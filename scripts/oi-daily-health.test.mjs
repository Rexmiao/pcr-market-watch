import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalD1} from './local-db.mjs';
import {captureDailyOi,ensureOiDailyMonitoring,oiDailyHealth,createOiDailyStatusHandler} from './oi-daily.mjs';
import {backupHfDatabase,restoreHfDatabase} from './hf-storage.mjs';
import {createRuntimeMoomooAuth} from './runtime-auth.mjs';
import {createLocalMoomooWebApiTokenProvider} from './moomoo-webapi-auth.mjs';
import {encryptCloudBootstrap} from './cloud-auth.mjs';
import {dailyHealthMessage} from '../web/oi-daily-status.js';

const clock=value=>Date.parse(value),ready={available:true,state:'Ready',kind:'cloud_process'};
const enabled=since=>({monitoringEnabled:true,monitoringEnabledSince:since});
function report(date,{status='success',mode='scheduled',start=date+'T22:30:00Z',saved=1,requested=1,errors=[]}={}){
  return {mode,status,observationDate:date,startedAt:start,completedAt:new Date(clock(start)+1000).toISOString(),requestedCount:requested,savedCount:saved,unavailableCount:requested-saved,errors};
}
function health(at,state=enabled('2026-11-26T10:00:00Z'),runs=[],scheduler=ready){return oiDailyHealth({state,runs,scheduler,now:()=>clock(at)});}

test('first enabled day waits for 17:30, late activation gets its own grace, and unknown past is never assigned failures',()=>{
  const initial=health('2026-11-26T10:03:00Z');
  assert.equal(initial.status,'waiting');assert.equal(initial.reason,'first_plan_not_due');
  assert.deepEqual(initial.missingDates,[]);assert.equal(initial.scheduledEvidence,'unobserved');assert.equal(initial.currentPlanAt,'2026-11-26T22:30:00.000Z');
  assert.equal(health('2026-11-26T22:34:59Z').status,'awaiting');
  const missed=health('2026-11-26T22:35:00Z');assert.equal(missed.status,'missed');assert.deepEqual(missed.missingDates,['2026-11-26']);
  const late=enabled('2026-11-26T23:00:00Z');
  const after=health('2026-11-26T23:01:00Z',late);assert.equal(after.status,'awaiting');assert.equal(after.assessedDueAt,'2026-11-26T23:00:00.000Z');assert.deepEqual(after.missingDates,[]);
  assert.equal(health('2026-11-26T23:05:00Z',late).status,'missed');
  const unknown=health('2026-11-28T23:00:00Z',null);assert.equal(unknown.status,'unconfirmed');assert.equal(unknown.consecutiveMissingDays,null);assert.deepEqual(unknown.missingDates,[]);
});

test('manual observations cannot establish scheduled success; valid partial/failure/empty evidence remains distinct',()=>{
  const manual=report('2026-11-26',{mode:'manual'});
  assert.equal(health('2026-11-26T23:00:00Z',enabled('2026-11-26T10:00:00Z'),[manual]).status,'missed');
  for(const [status,saved,requested,expected]of [['success',1,1,'success'],['partial',1,2,'partial'],['unavailable',0,1,'failed'],['empty_watchlist',0,0,'empty_watchlist']]){
    const value=health('2026-11-26T23:00:00Z',enabled('2026-11-26T10:00:00Z'),[report('2026-11-26',{status,saved,requested})]);
    assert.equal(value.status,expected);assert.equal(value.lastScheduledRun.mode,'scheduled');assert.deepEqual(value.missingDates,[]);
  }
  assert.equal(health('2026-11-26T23:00:00Z',null,[report('2026-11-26',{start:'2026-11-26T21:30:00Z'})]).lastScheduledRun,null,'Early reports cannot establish a scheduled trigger.');
  assert.equal(health('2026-11-26T23:00:00Z',null,[report('2026-11-26',{start:'2026-11-27T22:30:00Z'})]).lastScheduledRun,null,'Future/foreign observation dates are invalid.');
  assert.equal(health('2026-11-26T10:03:00Z',null,[],{available:false,state:'Disabled'}).status,'disabled');
});

test('DST, bounded coverage and consecutive gaps use New York query days, including weekends and holidays',()=>{
  const spring=health('2026-03-08T21:29:00Z',enabled('2026-03-08T14:00:00Z'));
  assert.equal(spring.currentPlanAt,'2026-03-08T21:30:00.000Z');assert.equal(spring.status,'waiting');
  const gap=health('2026-11-29T12:00:00Z',enabled('2026-11-26T10:00:00Z'),[report('2026-11-26')]);
  assert.deepEqual(gap.missingDates,['2026-11-27','2026-11-28']);assert.equal(gap.consecutiveMissingDays,2);assert.equal(gap.assessedDate,'2026-11-28');
  const capped=health('2026-11-29T23:00:00Z',enabled('2026-09-01T10:00:00Z'));
  assert.equal(capped.missingDates.length,30);assert.equal(capped.consecutiveMissingDays,30);assert.equal(capped.lookbackDays,30);
});

test('real SQLite retains activation and independent scheduled evidence across manual updates and backup restore; GET never writes or fetches',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-health-')),database=await createLocalD1({databasePath:join(directory,'original.sqlite3')});
  await database.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind('local_user','[{"symbol":"AMD","category":null}]','[]',1,'2026-11-26T10:00:00Z').run();
  let at=clock('2026-11-26T10:00:00Z');const since=new Date(at).toISOString();
  assert.equal((await ensureOiDailyMonitoring({database,enabled:true,now:()=>at})).registered,true);
  at+=60000;assert.equal((await ensureOiDailyMonitoring({database,enabled:true,now:()=>at})).registered,false);
  let calls=0;
  const client={status:()=>({configured:true}),overview:async symbol=>{calls++;return {provider:'moomoo_webapi',checkedAt:new Date(at+1000).toISOString(),data:{items:[{code:'US.'+symbol,put_open_interest:20,call_open_interest:10}]}};}};
  const options={database,webApiClient:client,now:()=>at,rootDirectory:join(directory,'files')};
  at=clock('2026-11-26T22:35:00Z');await captureDailyOi({...options,mode:'manual'});
  const handler=createOiDailyStatusHandler({database,now:()=>at,rootDirectory:join(directory,'files'),schedulerStatus:async()=>ready,
    authorizationStatus:async()=>({configured:true,status:'available',accessExpiresAt:'2026-11-27T01:00:00Z',password:'NEVER_PUBLISH',accessToken:'NEVER_PUBLISH'})});
  let body=await(await handler(new Request('http://127.0.0.1/api/oi-daily'))).json();
  assert.equal(body.lastRun.mode,'manual');assert.equal(body.health.status,'missed');assert.equal(body.health.lastScheduledRun,null);
  at+=60000;await captureDailyOi({...options,mode:'scheduled'});at+=60000;await captureDailyOi({...options,mode:'manual'});
  const before=await readFile(database.databasePath);const countBefore=calls;
  body=await(await handler(new Request('http://127.0.0.1/api/oi-daily'))).json();
  assert.equal(body.lastRun.mode,'manual');assert.equal(body.health.status,'success');assert.equal(body.health.lastScheduledRun.mode,'scheduled');assert.equal(body.health.monitoringEnabledSince,since);
  assert(!JSON.stringify(body).includes('NEVER_PUBLISH'));assert.equal(calls,countBefore);assert.deepEqual(await readFile(database.databasePath),before);
  const backupDirectory=join(directory,'backups'),pythonExecutable=database.pythonExecutable;
  await backupHfDatabase({databasePath:database.databasePath,backupDirectory,pythonExecutable});
  const restoredPath=join(directory,'new','restored.sqlite3');await restoreHfDatabase({databasePath:restoredPath,backupDirectory,pythonExecutable});
  const restored=await createLocalD1({databasePath:restoredPath});
  const restoredHandler=createOiDailyStatusHandler({database:restored,rootDirectory:join(directory,'missing-files'),now:()=>at,schedulerStatus:async()=>ready});
  const after=await(await restoredHandler(new Request('http://127.0.0.1/api/oi-daily'))).json();
  assert.deepEqual(after.health,body.health);assert.equal(after.lastRun.mode,'manual');assert.equal(calls,countBefore);
  await ensureOiDailyMonitoring({database:restored,enabled:false,now:()=>at});at+=60000;await ensureOiDailyMonitoring({database:restored,enabled:true,now:()=>at});
  const reenabled=JSON.parse((await restored.prepare('SELECT payload_json FROM oi_daily_state WHERE id=?').bind('daily').first()).payload_json);
  assert.equal(reenabled.monitoringEnabledSince,new Date(at).toISOString(),'An explicit disabled period is not retroactively counted as monitored.');
});

test('authorization diagnostics inspect encrypted metadata without renewal, saving, locks, or token disclosure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pcr-auth-health-')),at=clock('2026-11-26T12:00:00Z');let calls=0,saves=0;
  const bundle={clientId:'unit-client-private',accessToken:'unit-access-private',refreshToken:'unit-refresh-private',scope:'quote:read',expiresAt:at-1,refreshExpiresAt:at+7200000};
  const key='ab'.repeat(32),file=join(directory,'grant.enc.json'),lock=join(directory,'runtime','lock');
  const env={PCR_RUNTIME:'cloud',PCR_CLOUD_AUTH_KEY:key,PCR_CLOUD_AUTH_FILE:file,PCR_CLOUD_AUTH_LOCK_FILE:lock,MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON:encryptCloudBootstrap(bundle,key)};
  const auth=createRuntimeMoomooAuth({env,now:()=>at,fetcher:async()=>{calls++;throw Error();}});
  let result=await auth.getAuthorizationStatus();assert.equal(result.status,'refresh_needed');assert.equal(result.renewable,true);assert.equal(result.refreshExpiryKnown,true);
  assert.equal(calls,0);assert(!JSON.stringify(result).includes('private'));await assert.rejects(readFile(file),{code:'ENOENT'});await assert.rejects(readFile(lock),{code:'ENOENT'});
  const expired=createRuntimeMoomooAuth({env:{...env,MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON:encryptCloudBootstrap({...bundle,refreshExpiresAt:at-1},key)},now:()=>at});
  assert.equal((await expired.getAuthorizationStatus()).status,'reconnect_required');
  const accessValid=createRuntimeMoomooAuth({env:{...env,MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON:encryptCloudBootstrap({...bundle,expiresAt:at+7200000,refreshExpiresAt:at-1},key)},now:()=>at});
  result=await accessValid.getAuthorizationStatus();assert.equal(result.status,'available');assert.equal(result.renewable,false);
  const local=createLocalMoomooWebApiTokenProvider({readBundle:async()=>({...bundle,refreshExpiresAt:undefined}),hasCredentials:()=>true,saveBundle:async()=>{saves++;},fetcher:async()=>{calls++;throw Error();},now:()=>at});
  result=await local.getAuthorizationStatus();assert.equal(result.status,'refresh_needed');assert.equal(result.refreshExpiryKnown,false);assert.equal(saves,0);assert.equal(calls,0);
  assert.equal((await createRuntimeMoomooAuth({env:{PCR_RUNTIME:'cloud'},now:()=>at}).getAuthorizationStatus()).status,'not_configured');
});

test('daily UI messages keep an upcoming plan separate from success, and normal access-token renewal is informational',()=>{
  assert.equal(dailyHealthMessage({health:{status:'waiting'},authorization:{status:'refresh_needed'}}).tone,'info');
  assert.equal(dailyHealthMessage({health:{status:'waiting'}}).key,'oiDailyHealthWaiting');
  for(const status of ['partial','failed','missed'])assert.equal(dailyHealthMessage({health:{status}}).tone,'error');
  assert.equal(dailyHealthMessage({health:{status:'success',missingDates:['2026-11-26']}}).tone,'error');
  assert.equal(dailyHealthMessage({health:{status:'waiting'},authorization:{status:'reconnect_required'}}).tone,'error');
});
