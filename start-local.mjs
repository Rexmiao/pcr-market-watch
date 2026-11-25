import {spawn, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const project = fileURLToPath(new URL('./', import.meta.url));
const url = 'http://127.0.0.1:8765/';
const checkOnly = process.argv.includes('--check');
const statusOnly = process.argv.includes('--status');
let server;

async function ready() {
  try {
    const response = await fetch(url + 'api/watchlist', {signal: AbortSignal.timeout(1000)});
    if (!response.ok) return false;
    const data = await response.json();
    if (!data.instruments || typeof data.instruments !== 'object') return false;
    const settings = await fetch(url + 'api/watchlist-settings', {signal: AbortSignal.timeout(2000)});
    return settings.ok && (await settings.json()).storage === 'local';
  } catch { return false; }
}

async function openBrowser() {
  if (checkOnly) return;
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

try {
  if (await ready()) {
    console.log('后台已在运行：' + url);
    console.log('关闭网页不会停止后台。');
    if (!statusOnly) await openBrowser();
  } else if (statusOnly) {
    console.log('后台未运行，或端口 8765 被其他服务占用。');
    console.log('请双击“启动本地网站.cmd”，并查看其中的启动提示。');
  } else {
    if (!existsSync(new URL('./dist/server/index.js', import.meta.url))) {
      const result = spawnSync(process.execPath, ['scripts/build.mjs'], {cwd: project, stdio: 'inherit', windowsHide: true});
      if (result.status !== 0) throw Error('Build failed.');
    }
    server = spawn(process.execPath, ['scripts/preview.mjs'], {cwd: project, stdio: 'inherit', windowsHide: true});
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    process.on('exit', () => { if (server && server.exitCode === null) server.kill(); });
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    let available = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await ready()) { available = true; break; }
      if (server.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!available) throw Error('Server did not start. Check whether port 8765 is in use.');
    console.log('PCR dashboard: ' + url);
    if (checkOnly) {
      for (const path of ['', 'charts.html', 'archive/index-trends.html', 'archive/seven-watchlist.html']) {
        const response = await fetch(url + path, {signal: AbortSignal.timeout(5000)});
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw Error('Page failed: ' + path);
        await response.arrayBuffer();
        console.log('PASS HTTP /' + path);
      }
      console.log('PASS local watchlist API');
      server.kill();
    } else {
      await openBrowser();
      console.log('Keep this window open while using the local site. Press Ctrl+C to stop.');
    }
    server.on('exit', code => { if (code) process.exitCode = code; });
  }
} catch (error) {
  console.error(error.message);
  if (server && server.exitCode === null) server.kill();
  process.exitCode = 1;
}
