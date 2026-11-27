import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {createStructureArchiveHandler} from './structure-archive.mjs';
import {readStructureStatusRows,createTaskMetadataReader,STATUS_INLINE_CHARACTER_LIMIT} from './structure-status-read.mjs';

const at=Date.parse('2026-11-27T14:00:00Z');
const monitoring={schemaVersion:1,monitoringEnabled:true,monitoringEnabledSince:'2026-11-27T12:00:00Z'};
const report=(id,mode,startedAt,status='partial')=>({schemaVersion:1,runId:id,mode,observationDate:startedAt.slice(0,10),startedAt,attemptStartedAt:startedAt,completedAt:status==='running'?null:startedAt,status,attempts:1,symbols:['AMD','QQQ'],plans:{AMD:{},QQQ:{}},tasks:[],requestedCount:6,savedCount:5,partialCount:0,unavailableCount:1,requestCount:7,coverageComplete:false,errors:['TIMEOUT'],privateField:'synthetic-private-run'});
async function fixture({populated=true,sharedRun=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'pcr-structure-status-'));
  let notifications=0,starts=0;const statements=[];
  const database=await createLocalD1({databasePath:join(directory,'isolated.sqlite3'),onChange:()=>{notifications++;}});
  const call=database.call.bind(database);database.call=async input=>{if(input.action==='statement'){starts++;statements.push(input.sql);}return call(input);};
  const manual=report('manual','manual','2026-11-27T13:45:00Z','running'),scheduled=report('scheduled','scheduled','2026-11-26T22:45:00Z');
  if(populated){await database.batch([
    database.prepare('INSERT INTO structure_daily_state(id,payload_json,updated_at,lease_until) VALUES(?,?,?,?)').bind('daily',JSON.stringify(monitoring),'2026-11-27T12:00:00Z',0),
    database.prepare('INSERT INTO structure_daily_state(id,payload_json,updated_at,lease_until) VALUES(?,?,?,?)').bind('lease','{"token":"synthetic-private-lease"}','2026-11-27T14:00:00Z',at+60000),
    ...[scheduled,...sharedRun?[]:[manual]].map(item=>database.prepare('INSERT INTO structure_daily_runs(run_id,observation_date,mode,status,payload_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?)').bind(item.runId,item.observationDate,item.mode,item.status,JSON.stringify(item),item.startedAt,item.completedAt)),
  ]);}
  return {database,manual,scheduled,reset(){notifications=0;starts=0;statements.length=0;},stats:()=>({notifications,starts,statements:[...statements]})};
}
async function legacyRows(database){
  const [state,last,lastScheduled,count,lease]=await Promise.all([
    database.prepare('SELECT payload_json FROM structure_daily_state WHERE id=?').bind('daily').first(),
    database.prepare('SELECT payload_json FROM structure_daily_runs ORDER BY started_at DESC LIMIT 1').first(),
    database.prepare('SELECT payload_json FROM structure_daily_runs WHERE mode=? ORDER BY started_at DESC LIMIT 1').bind('scheduled').first(),
    database.prepare('SELECT COUNT(*) AS record_count,COUNT(DISTINCT observation_date) AS date_count,MAX(queried_at) AS latest_queried_at FROM structure_snapshots').first(),
    database.prepare('SELECT lease_until FROM structure_daily_state WHERE id=?').bind('lease').first(),
  ]);return {statePayload:state?.payload_json??null,last,lastScheduled,count,lease};
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function get(handler){const response=await handler(new Request('http://isolated.test/api/structure-daily'));assert.equal(response.status,200);return response.json();}

test('one parameterized SELECT preserves all five status reads without writes or BEGIN IMMEDIATE',async()=>{
  const f=await fixture(),database=f.database;
  const before=digest(await readFile(database.databasePath));f.reset();const legacy=await legacyRows(database);assert.equal(f.stats().starts,5);
  f.reset();const {payloadFallback,...current}=await readStructureStatusRows(database);assert.deepEqual(current,legacy);assert.equal(payloadFallback,false);assert.equal(f.stats().starts,1);assert.equal(f.stats().notifications,0);assert(/^\s*WITH\b/.test(f.stats().statements[0]));assert(!/BEGIN\s+IMMEDIATE|\b(?:INSERT|UPDATE|DELETE)\b/i.test(f.stats().statements[0]));assert.equal(digest(await readFile(database.databasePath)),before);
});

test('empty status stays uninitialized and a shared latest/scheduled run is returned faithfully',async()=>{
  const empty=await fixture({populated:false});empty.reset();const before=digest(await readFile(empty.database.databasePath));
  const rows=await readStructureStatusRows(empty.database);assert.equal(rows.statePayload,null);assert.equal(rows.last,null);assert.equal(rows.lastScheduled,null);assert.equal(rows.lease,null);assert.deepEqual(rows.count,{record_count:0,date_count:0,latest_queried_at:null});assert.equal(empty.stats().starts,1);assert.equal(empty.stats().notifications,0);assert.equal(digest(await readFile(empty.database.databasePath)),before);
  const shared=await fixture({sharedRun:true}),value=await readStructureStatusRows(shared.database);assert.equal(value.last.payload_json,value.lastScheduled.payload_json);assert.equal(JSON.parse(value.last.payload_json).runId,'scheduled');
});

test('large saved checkpoints use bounded fixed-ID fallback and retain original payloads',async()=>{
  const f=await fixture();await f.database.prepare('UPDATE structure_daily_runs SET payload_json=? WHERE run_id=?').bind(JSON.stringify({...f.manual,padding:'x'.repeat(STATUS_INLINE_CHARACTER_LIMIT+1)}),'manual').run();
  const expected=await legacyRows(f.database);f.reset();const {payloadFallback,...rows}=await readStructureStatusRows(f.database);assert.equal(payloadFallback,true);assert.deepEqual(rows,expected);assert.equal(f.stats().starts,3);assert.equal(f.stats().notifications,0);assert(f.stats().statements.slice(1).every(sql=>sql.includes('WHERE run_id=?')));
});

test('cached OS metadata never caches activation, lease expiry, or archived counts and excludes private fields',async()=>{
  const f=await fixture();let clock=at,calls=0;
  const handler=createStructureArchiveHandler({database:f.database,now:()=>clock,authorizationStatus:()=>({configured:true,status:'available',password:'synthetic-private-auth'}),schedulerStatus:()=>{calls++;return {available:true,state:'Ready',kind:'windows_task',nextRunAt:'2026-11-27T22:45:00Z',privatePath:'synthetic-private-path'};}});
  let value=await get(handler);assert.equal(value.running,true);assert.equal(value.lastRun.status,'running');assert.equal(value.scheduler.state,'Running');assert.equal(value.scheduler.metadataCache.status,'fresh');
  await f.database.prepare('UPDATE structure_daily_state SET payload_json=? WHERE id=?').bind(JSON.stringify({...monitoring,monitoringEnabled:false}),'daily').run();
  clock+=1000;value=await get(handler);assert.equal(calls,1);assert.equal(value.scheduler.metadataCache.status,'cached');assert.equal(value.monitoringEnabled,false);assert.equal(value.nextRunAt,null);
  clock=at+60001;value=await get(handler);assert.equal(value.running,false);assert.equal(value.lastRun.status,'interrupted');assert.equal(value.lastRun.retryEligible,true);assert.equal(value.scheduler.state,'Ready');assert.equal(calls,2);assert(!JSON.stringify(value).includes('synthetic-private'));
  const body=Buffer.from('{}'),compressed=gzipSync(body);await f.database.prepare('INSERT INTO structure_snapshots(id,run_id,observation_date,kind,symbol,scope_kind,scope_key,expiries_json,queried_at,provider_updated_at,oi_settlement_date,status,units,payload_gzip_base64,payload_bytes,compressed_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('synthetic-one','manual','2026-11-27','gamma','AMD','expiry','2026-12-04','["2026-12-04"]','2026-11-27T14:00:00Z',null,null,'current','provider_gex_unspecified',compressed.toString('base64'),body.length,compressed.length).run();
  clock+=1000;value=await get(handler);assert.equal(value.archive.recordCount,1);assert.equal(calls,2);assert.equal(value.scheduler.metadataCache.status,'cached');
});

test('only successful Windows metadata is cached for30 seconds; failure is explicit and not stale success',async()=>{
  let clock=0,calls=0,fail=false;const reader=createTaskMetadataReader({now:()=>clock,read:()=>{calls++;if(fail)throw Error('synthetic-private-error');return {available:true,state:'Ready',kind:'windows_task'};}});
  for(let i=0;i<10;i++){clock=i*3000;const value=await reader();assert.equal(value.metadataCache.status,i?'cached':'fresh');assert.equal(value.metadataCache.checkedAt,'1970-01-01T00:00:00.000Z');}assert.equal(calls,1);
  clock=30000;fail=true;let value=await reader();assert.equal(value.available,false);assert.equal(value.state,'unavailable');assert.equal(value.metadataCache.status,'unavailable');assert.equal(value.metadataCache.ttlMs,0);await reader();assert.equal(calls,3);
  fail=false;value=await reader();assert.equal(value.available,true);assert.equal(value.metadataCache.status,'fresh');assert.equal(calls,4);
});

test('cloud metadata remains dynamic and concurrent Windows reads share one safe observation',async()=>{
  let calls=0;const cloud=createTaskMetadataReader({read:()=>({available:true,state:++calls===1?'Ready':'Disabled',kind:'cloud_process'}),now:()=>0});assert.equal((await cloud()).metadataCache.status,'not_cached');assert.equal((await cloud()).state,'Disabled');assert.equal(calls,2);
  let release,probes=0;const pending=new Promise(resolve=>{release=resolve;});const reader=createTaskMetadataReader({now:()=>0,read:async()=>{probes++;await pending;return {available:true,state:'Ready',kind:'windows_task',password:'synthetic-private-password'};}});
  const requests=[reader(),reader(),reader()];release();const values=await Promise.all(requests);assert.equal(probes,1);assert.equal(values.filter(value=>value.metadataCache.coalesced).length,2);assert(values.every(value=>!JSON.stringify(value).includes('synthetic-private')));
});
