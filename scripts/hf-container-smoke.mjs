// Optional manual integration check. Uses one owned, temporary Docker container;
// never supplies brokerage credentials or exposes a port beyond loopback.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const docker=process.env.PCR_DOCKER||'docker';
const container='pcr-hf-smoke-'+randomUUID().slice(0,8),password=randomUUID().replaceAll('-','');
const origin='http://127.0.0.1:8796';
const expectedMigrations=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8')).entries.length;
function run(args,{env=process.env}={}){return new Promise((accept,reject)=>{
  const child=spawn(docker,args,{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});let output='',error='';
  child.stdout.on('data',chunk=>{if(output.length<32768)output+=chunk;});child.stderr.on('data',chunk=>{if(error.length<4096)error+=chunk;});
  child.on('error',()=>reject(Error('Docker could not start.')));child.on('close',code=>code===0?accept(output.trim()):reject(Error('Docker operation failed: '+error.slice(0,400))));
});}
async function request(path,{auth=true,...init}={}){return fetch(origin+path,{...init,headers:{...(auth?{authorization:'Basic '+Buffer.from('pcr:'+password).toString('base64')}:{}) ,...init.headers},signal:AbortSignal.timeout(10000)});}
let started=false;
try{
  await run(['run','-d','--name',container,'-p','127.0.0.1:8796:7860','--env','PCR_CLOUD_PASSWORD','--env','PCR_CLOUD_PUBLIC_ORIGIN='+origin,process.env.PCR_HF_IMAGE||'pcr-market-watch-hf:0.2.21'],{env:{...process.env,PCR_CLOUD_PASSWORD:password}});started=true;
  let ready=false;
  for(let i=0;i<30;i++){
    try{if((await request('/',{auth:false})).status===401){ready=true;break;}}catch{}
    await new Promise(accept=>setTimeout(accept,500));
  }
  assert(ready,'Cloud gateway must become ready.');
  assert.equal((await request('/',{auth:false})).status,401);
  assert.equal((await request('/api/oi-summaries/history?symbols=NVDA',{auth:false})).status,401);
  assert.equal((await request('/option-structure.html',{auth:false})).status,401);
  assert.equal((await request('/api/gamma-exposure?symbol=QQQ',{auth:false})).status,401);
  let home;
  for(let i=0;i<20;i++){
    home=await request('/');if(home.status===200)break;
    await new Promise(accept=>setTimeout(accept,500));
  }
  assert.equal(home.status,200);assert((await home.text()).includes('PCR'));
  assert.equal((await request('/option-structure.html')).status,200);
  const structure=await request('/api/gamma-exposure?symbol=QQQ');assert.equal(structure.status,200);assert.equal((await structure.json()).base.checkedAt,null);
  const history=await request('/api/oi-summaries/history?symbols=NVDA&date=2026-11-26');assert.equal(history.status,200);
  const saved=await history.json();assert.equal(saved.observationDate,'2026-11-26');assert.equal(saved.items.length,1);assert.equal(saved.items[0].checkedAt,null);assert.equal(saved.items[0].putOi,null);
  const calendar=await request('/api/oi-summaries/history?symbols=NVDA');assert.equal(calendar.status,200);assert.deepEqual((await calendar.json()).dates,[]);
  const daily=await request('/api/oi-daily');assert.equal(daily.status,200);const status=await daily.json();assert.equal(status.scheduler.kind,'cloud_process');assert.equal(status.scheduler.state,'Disabled');assert.equal(status.scheduler.nextRunAt,null);
  assert.equal((await request('/api/providers/moomoo/status')).status,403);
  assert.equal((await request('/api/oi-summaries/history?symbols=NVDA',{headers:{origin:'https://untrusted.example'}})).status,403);
  const uid=await run(['exec',container,'id','-u']);assert.equal(uid,'1000');
  const sqlite=JSON.parse(await run(['exec',container,'python3','-c',"import sqlite3,json; c=sqlite3.connect('/tmp/pcr-runtime/pcr.sqlite3'); print(json.dumps({'integrity':c.execute('PRAGMA quick_check').fetchone()[0],'migrations':c.execute('SELECT COUNT(*) FROM __pcr_local_migrations').fetchone()[0],'oi_history':c.execute(\"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='oi_summary_snapshots'\").fetchone()[0]}))"]));
  assert.equal(sqlite.integrity,'ok');assert.equal(sqlite.migrations,expectedMigrations);assert.equal(sqlite.oi_history,1);
  const node=await run(['exec',container,'node','--version']);assert(node.startsWith('v22.'));
  console.log(JSON.stringify({passed:true,anonymousHomepage:401,anonymousApi:401,authenticatedHomepage:200,historyApi:200,emptyArchive:true,dailyDisabled:true,crossOrigin:403,desktopBlocked:403,uid:Number(uid),node,sqlite}));
}finally{
  if(started)await run(['rm','-f',container]).catch(()=>{});
}
