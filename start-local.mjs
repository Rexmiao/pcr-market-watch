import {spawn, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const project = fileURLToPath(new URL('./', import.meta.url));
const pagePaths=['', 'options-monitor.html', 'quote-reviews.html', 'charts.html', 'archive/index-trends.html', 'archive/seven-watchlist.html'];

export function launcherPorts(preferred=process.env.PCR_PREVIEW_PORT) {
  const text=preferred===undefined?'8765':String(preferred).trim();
  const first=Number(text);
  if(!/^\d+$/.test(text)||!Number.isInteger(first)||first<1024||first>65535)throw Error('PCR_PREVIEW_PORT must be an integer between 1024 and 65535.');
  return Array.from({length:Math.min(10,65536-first)},(_,index)=>first+index);
}

export async function isPcrServer(port) {
  const url=`http://127.0.0.1:${port}/`;
  try {
    const response = await fetch(url + 'api/watchlist', {signal: AbortSignal.timeout(700)});
    if (!response.ok) return false;
    const data = await response.json();
    if (!data.instruments || typeof data.instruments !== 'object'||Array.isArray(data.instruments)) return false;
    const settings = await fetch(url + 'api/watchlist-settings', {signal: AbortSignal.timeout(1000)});
    return settings.ok && (await settings.json()).storage === 'local';
  } catch { return false; }
}

export async function findPcrServer(ports=launcherPorts()) {
  const states=await Promise.all(ports.map(isPcrServer));
  const index=states.indexOf(true);
  return index<0?null:{port:ports[index],url:`http://127.0.0.1:${ports[index]}/`,existing:true};
}

async function portAvailable(port) {
  return await new Promise((accept,reject)=>{
    const probe=createServer();
    probe.once('error',error=>['EADDRINUSE','EACCES'].includes(error.code)?accept(false):reject(error));
    probe.listen({port,host:'127.0.0.1',exclusive:true},()=>probe.close(error=>error?reject(error):accept(true)));
  });
}

export async function selectLaunchTarget(ports=launcherPorts()) {
  const existing=await findPcrServer(ports);
  if(existing)return existing;
  for(const port of ports)if(await portAvailable(port))return {port,url:`http://127.0.0.1:${port}/`,existing:false};
  throw Error(`No available PCR port in ${ports[0]}–${ports.at(-1)}. Choose a different PCR_PREVIEW_PORT.`);
}

export async function verifyPcrPages(url) {
  for(const path of pagePaths) {
    const response=await fetch(url+path,{signal:AbortSignal.timeout(5000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Page failed: '+path);
    await response.arrayBuffer();
  }
  return [...pagePaths];
}

async function openBrowser(url) {
  try {
    await new Promise((resolve, reject) => {
      const browser = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}' -ErrorAction Stop`], {stdio: 'ignore', windowsHide: true});
      browser.on('error', reject);
      browser.on('exit', code => code === 0 ? resolve() : reject(new Error('Browser launch failed.')));
    });
  } catch {
    console.error('无法自动打开浏览器，请复制这个网址：' + url);
  }
}

export async function launch() {
  const checkOnly=process.argv.includes('--check'),statusOnly=process.argv.includes('--status');
  let server;
  try {
  const ports=launcherPorts();
  const target=statusOnly?await findPcrServer(ports):await selectLaunchTarget(ports);
  if(target?.existing) {
    const {url}=target;
    console.log('后台已在运行：' + url);
    console.log('关闭网页不会停止后台。');
    if(checkOnly) {
      for(const path of await verifyPcrPages(url))console.log('PASS HTTP /'+path);
      console.log('PASS local watchlist API');
    } else if (!statusOnly) await openBrowser(url);
  } else if (statusOnly) {
    console.log(`在端口 ${ports[0]}–${ports.at(-1)} 未发现正在运行的 PCR 后台。`);
    console.log('请双击“启动本地网站.cmd”，并查看其中的启动提示。');
  } else {
    const {url,port}=target;
    if (!existsSync(join(project,'dist','server','index.js'))) {
      const result = spawnSync(process.execPath, ['scripts/build.mjs'], {cwd: project, stdio: 'inherit', windowsHide: true});
      if (result.status !== 0) throw Error('Build failed.');
    }
    server = spawn(process.execPath, ['scripts/preview.mjs'], {cwd: project, env:{...process.env,PCR_PREVIEW_PORT:String(port)},stdio: 'inherit', windowsHide: true});
    let spawnError=null;
    server.on('error', error => {spawnError=error;process.exitCode = 1;});
    process.on('exit', () => { if (server && server.exitCode === null) server.kill(); });
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    let available = false;
    const deadline=Date.now()+20000;
    while(Date.now()<deadline) {
      if (await isPcrServer(port)) { available = true; break; }
      if (spawnError||server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!available) throw Error(spawnError?.message||`Server did not start at ${url}. Check the startup messages and port availability.`);
    console.log('PCR dashboard: ' + url);
    if (checkOnly) {
      for (const path of await verifyPcrPages(url)) {
        console.log('PASS HTTP /' + path);
      }
      console.log('PASS local watchlist API');
      server.kill();
    } else {
      await openBrowser(url);
      console.log('Keep this window open while using the local site. Press Ctrl+C to stop.');
    }
    server.on('exit', code => { if (code) process.exitCode = code; });
  }
} catch (error) {
  console.error(error.message);
  if (server && server.exitCode === null) server.kill();
  process.exitCode = 1;
}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await launch();
