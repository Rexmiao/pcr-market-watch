import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {launcherPorts,isPcrServer,findPcrServer,selectLaunchTarget,verifyPcrPages} from '../start-local.mjs';

const exec=promisify(execFile),owned=[];
async function listen(handler) {
  const server=http.createServer(handler);
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  owned.push(server);
  return {server,port:server.address().port,url:`http://127.0.0.1:${server.address().port}/`};
}
try {
  assert.deepEqual(launcherPorts('8765'),Array.from({length:10},(_,i)=>8765+i));
  assert.deepEqual(launcherPorts('11000'),Array.from({length:10},(_,i)=>11000+i));
  assert.deepEqual(launcherPorts('65534'),[65534,65535]);
  for(const value of ['', 'abc', '80', '65536', '8765.5', '8765;echo'])assert.throws(()=>launcherPorts(value),/PCR_PREVIEW_PORT/);

  let foreignCalls=0;
  const foreign=await listen((request,response)=>{
    foreignCalls++;response.setHeader('content-type','application/json');
    response.end(JSON.stringify(request.url==='/api/watchlist'?{instruments:{OTHER:{}}}:{storage:'foreign-application'}));
  });
  const visited=[];
  const pcr=await listen((request,response)=>{
    visited.push(request.url);
    if(request.url==='/api/watchlist'){response.setHeader('content-type','application/json');response.end(JSON.stringify({instruments:{NVDA:{}}}));}
    else if(request.url==='/api/watchlist-settings'){response.setHeader('content-type','application/json');response.end(JSON.stringify({storage:'local',revision:1,initialized:true,items:[],groups:[]}));}
    else if(['/','/options-monitor.html','/quote-reviews.html','/charts.html','/archive/index-trends.html','/archive/seven-watchlist.html'].includes(request.url)){response.setHeader('content-type','text/html');response.end('<!doctype html><title>PCR fixture</title>');}
    else{response.statusCode=404;response.end('missing');}
  });
  assert.equal(await isPcrServer(foreign.port),false,'An unrelated server must not be mistaken for PCR even if one endpoint looks similar');
  assert.equal(await isPcrServer(pcr.port),true);
  assert.deepEqual(await findPcrServer([foreign.port,pcr.port]),{port:pcr.port,url:pcr.url,existing:true});
  assert.equal((await selectLaunchTarget([foreign.port,pcr.port])).existing,true);
  assert(foreignCalls>0);

  const freeProbe=await listen((request,response)=>response.end('temporary'));
  await new Promise(accept=>freeProbe.server.close(accept));
  const free=freeProbe.port;
  assert.deepEqual(await selectLaunchTarget([foreign.port,free]),{port:free,url:`http://127.0.0.1:${free}/`,existing:false});
  assert.equal((await fetch(foreign.url)).status,200,'Port selection must leave the unrelated server running');
  await assert.rejects(selectLaunchTarget([foreign.port]),/No available PCR port/);
  assert.deepEqual(await verifyPcrPages(pcr.url),['','options-monitor.html','quote-reviews.html','charts.html','archive/index-trends.html','archive/seven-watchlist.html']);

  const launcher=fileURLToPath(new URL('../start-local.mjs',import.meta.url));
  const options={env:{...process.env,PCR_PREVIEW_PORT:String(pcr.port)},windowsHide:true,timeout:10000};
  const status=await exec(process.execPath,[launcher,'--status'],options);
  assert(status.stdout.includes(pcr.url),'Status prints the actual detected URL');
  const checked=await exec(process.execPath,[launcher,'--check'],options);
  assert(checked.stdout.includes(pcr.url));
  assert(checked.stdout.includes('PASS HTTP /archive/seven-watchlist.html'));
  assert(checked.stdout.includes('PASS local watchlist API'));
  assert.equal(await isPcrServer(pcr.port),true,'--check must not stop a reused PCR backend');
  assert.equal((await fetch(foreign.url)).status,200,'Neither launcher mode may stop a foreign service');
  for(const path of ['/','/options-monitor.html','/quote-reviews.html','/charts.html','/archive/index-trends.html','/archive/seven-watchlist.html'])assert(visited.includes(path));
  console.log('PASS launcher ports: foreign-service identification, existing PCR reuse, free fallback, preferred-port validation, actual URL output and archive checks without stopping existing services');
} finally {
  await Promise.all(owned.map(server=>new Promise(accept=>{server.close(()=>accept());server.closeAllConnections?.();})));
}
