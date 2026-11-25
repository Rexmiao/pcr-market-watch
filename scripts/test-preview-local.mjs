import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=fileURLToPath(new URL('../',import.meta.url));
const temporary=await mkdtemp(join(tmpdir(),'pcr-preview-db-'));
const databasePath=join(temporary,'pcr.sqlite3');
const reservation=net.createServer();
await new Promise((accept,reject)=>{reservation.on('error',reject);reservation.listen(0,'127.0.0.1',accept);});
const port=reservation.address().port;
await new Promise(accept=>reservation.close(accept));
assert.notEqual(port,8765);
const origin='http://127.0.0.1:'+port;
let child;

async function stop(){
  if(!child)return;
  const current=child;child=null;
  if(current.exitCode!==null||current.signalCode!==null)return;
  await new Promise(accept=>{current.once('exit',accept);current.kill();});
}

async function start(){
  child=spawn(process.execPath,['scripts/preview.mjs'],{cwd:project,env:{...process.env,PCR_PREVIEW_PORT:String(port),PCR_DB_PATH:databasePath},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';
  child.stdout.on('data',chunk=>output+=chunk);
  child.stderr.on('data',chunk=>output+=chunk);
  child.on('error',error=>{output+=error.message;});
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw Error('Preview did not start: '+output.slice(0,1000));
    try {const response=await fetch(origin+'/api/watchlist-settings',{signal:AbortSignal.timeout(500)});if(response.status===200)return;} catch {}
    await new Promise(accept=>setTimeout(accept,100));
  }
  throw Error('Preview readiness timed out: '+output.slice(0,1000));
}

async function get(){const response=await fetch(origin+'/api/watchlist-settings');assert.equal(response.status,200);return await response.json();}
async function put(value){const response=await fetch(origin+'/api/watchlist-settings',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;}
async function marketGet(){const response=await fetch(origin+'/api/market-pcr-settings');assert.equal(response.status,200);return response.json();}
async function marketPut(value){const response=await fetch(origin+'/api/market-pcr-settings',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;}

try{
  await start();
  const initial=await get();
  assert.equal(initial.storage,'local');
  assert.equal(initial.initialized,false);
  assert.equal(initial.revision,0);
  const groups=[{id:'semi',name:'Semiconductors'},{id:'custom_memory',name:'存储'}];
  const items=[{symbol:'NVDA',category:'semi'},{symbol:'SNDK',category:'custom_memory'}];
  const saved=await put({groups,items,revision:0});
  assert.equal(saved.revision,1);
  const marketInitial=await marketGet();assert.equal(marketInitial.items,null);assert.equal(marketInitial.initialized,false);
  const marketItems=[{type:'cboe',key:'total'},{type:'symbol',symbol:'GLD'}];
  await marketPut({items:marketItems,revision:0});
  await stop();
  await start();
  const restarted=await get();
  assert.deepEqual(restarted.items,items);
  assert.deepEqual(restarted.groups,groups);
  assert.equal(restarted.revision,1);
  assert.deepEqual((await marketGet()).items,marketItems);
  await marketPut({items:[],revision:1});
  assert.deepEqual((await get()).items,items,'Market edits must not change personal membership');
  await put({groups:[],items:[],revision:restarted.revision});
  await stop();
  await start();
  const empty=await get();
  assert.equal(empty.initialized,true);
  assert.equal(empty.revision,2);
  assert.deepEqual(empty.items,[]);
  assert.deepEqual(empty.groups,[]);
  const marketEmpty=await marketGet();assert.deepEqual(marketEmpty.items,[]);assert.equal(marketEmpty.initialized,true);
  const statusResponse=await fetch(origin+'/api/providers/moomoo/status');
  assert.equal(statusResponse.status,200);
  const status=await statusResponse.json();
  assert.equal(status.provider,'moomoo');
  assert.equal(status.readOnly,true);
  assert.equal(Object.keys(status).some(key=>/app.?key|secret|credential/i.test(key)),false);
  assert.equal((await fetch(origin+'/')).status,200);
  console.log('PASS local preview HTTP: separate market/personal settings persist after restart, empty profiles remain empty, migrations bootstrap, and original PCR/moomoo routes remain available');
}finally{await stop();}
