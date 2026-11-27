// Daily quote-only OI capture. All timestamps describe actual observations.
import {mkdir,readFile,writeFile,rename,open,unlink,stat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createLocalD1} from './local-db.mjs';
import {createOiSummaryHandler} from './oi-summaries.mjs';
import {createMoomooWebApiClient} from '../worker/moomoo-webapi.js';
import {createRuntimeMoomooAuth} from './runtime-auth.mjs';

export const OI_DAILY_TASK='PCR-OI-Daily-Snapshot';
export const OI_DAILY_TIME='17:30';
export const OI_DAILY_ZONE='America/New_York';
const TICKER=/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/;
const parts=instant=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:OI_DAILY_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export function oiObservationDate(instant=Date.now()){const p=parts(instant);return `${p.year}-${p.month}-${p.day}`;}
function zonedTarget(date){
  const target=Date.parse(date+'T17:30:00Z');let guess=target;
  for(let i=0;i<4;i++){const p=parts(guess),represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);guess+=target-represented;}
  return guess;
}
export function nextOiDailyRun(instant=Date.now()){
  const date=oiObservationDate(instant),today=zonedTarget(date);
  return new Date(today>instant?today:zonedTarget(new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10))).toISOString();
}
export function oiDailyIsDue(instant=Date.now()){const p=parts(instant);return `${p.hour}:${p.minute}`>=OI_DAILY_TIME;}
const validInstant=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const shiftDate=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export async function dailyWatchlistSymbols(database){
  const row=await database.prepare('SELECT items_json FROM user_watchlists WHERE owner_id=?').bind('local_user').first();
  if(!row)return [];
  const items=JSON.parse(row.items_json);
  if(!Array.isArray(items)||items.length>40)throw Error('INVALID_WATCHLIST');
  const symbols=items.map(v=>v?.symbol);
  if(symbols.some(v=>typeof v!=='string'||v.length>10||!TICKER.test(v)||/^(US|HK|SH|SZ|SG|JP|AU|CA)\./.test(v))||new Set(symbols).size!==symbols.length)throw Error('INVALID_WATCHLIST');
  return symbols.sort();
}
export function oiDailyRoot(database){return join(dirname(database.databasePath),'oi-daily');}
function parseState(data){
  if(typeof data!=='string'||data.length>65536)return null;
  try{const value=JSON.parse(data);return value?.schemaVersion===1&&value.timeZone===OI_DAILY_ZONE?value:null;}catch{return null;}
}
async function readState(root,database){
  if(database?.prepare){
    const row=await database.prepare('SELECT payload_json FROM oi_daily_state WHERE id=?').bind('daily').first();
    if(row){const value=parseState(row.payload_json);if(!value)throw Error('OI_DAILY_STATE_UNAVAILABLE');return value;}
  }
  // Existing Windows-only installations can still read their original state.
  // New completed runs commit metadata to SQLite before updating these mirrors.
  try{return parseState(await readFile(join(root,'state.json'),'utf8'));}catch{return null;}
}
async function persistState(database,state,report){
  if(!database?.prepare||!database?.batch)throw Error('OI_DAILY_STORAGE_UNAVAILABLE');
  await database.batch([
    database.prepare('INSERT INTO oi_daily_runs(run_id,observation_date,mode,status,payload_json,completed_at) VALUES(?,?,?,?,?,?)').bind(report.runId,report.observationDate,report.mode,report.status,JSON.stringify(report),report.completedAt),
    database.prepare('INSERT INTO oi_daily_state(id,payload_json,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').bind('daily',JSON.stringify(state),report.completedAt),
  ]);
}
// Activation is a durable fact, unlike the mere presence of a Ready scheduler.
// Startup calls this once; the status GET never registers or modifies a task.
export async function ensureOiDailyMonitoring({database,enabled,rootDirectory=oiDailyRoot(database),now=()=>Date.now()}={}){
  if(typeof enabled!=='boolean'||!database?.prepare)throw Error('OI_DAILY_MONITORING_UNAVAILABLE');
  const prior=await readState(rootDirectory,database);
  if(prior?.monitoringEnabled===enabled&&(!enabled||validInstant(prior.monitoringEnabledSince)))return {registered:false};
  const at=new Date(now()).toISOString();
  const state={schemaVersion:1,timeZone:OI_DAILY_ZONE,scheduledTime:OI_DAILY_TIME,schedule:prior?.schedule||null,lastRun:prior?.lastRun||null,
    monitoringEnabled:enabled,monitoringEnabledSince:enabled?at:null};
  await database.prepare('INSERT INTO oi_daily_state(id,payload_json,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').bind('daily',JSON.stringify(state),at).run();
  return {registered:true};
}
function safeRun(run,instant,{scheduledOnly=false}={}){
  if(!run||!['manual','scheduled'].includes(run.mode)||scheduledOnly&&run.mode!=='scheduled'||!validInstant(run.startedAt)||!validInstant(run.completedAt)||Date.parse(run.startedAt)>Date.parse(run.completedAt)||Date.parse(run.completedAt)>instant+30000||!validDate(run.observationDate)||run.observationDate!==oiObservationDate(Date.parse(run.startedAt))||!['success','partial','unavailable','empty_watchlist'].includes(run.status))return null;
  if(run.mode==='scheduled'&&Date.parse(run.startedAt)<zonedTarget(run.observationDate))return null;
  if(!['requestedCount','savedCount','unavailableCount'].every(key=>Number.isSafeInteger(run[key])&&run[key]>=0&&run[key]<=40)||run.savedCount+run.unavailableCount!==run.requestedCount)return null;
  if(run.status==='success'&&(!run.requestedCount||run.savedCount!==run.requestedCount)||run.status==='partial'&&(!run.savedCount||!run.unavailableCount)||run.status==='empty_watchlist'&&run.requestedCount!==0)return null;
  return {mode:run.mode,startedAt:run.startedAt,completedAt:run.completedAt,observationDate:run.observationDate,status:run.status,
    requestedCount:run.requestedCount,savedCount:run.savedCount,unavailableCount:run.unavailableCount,
    errorCodes:[...new Set((Array.isArray(run.errors)?run.errors:[]).filter(value=>typeof value==='string'&&/^[A-Z_]{1,48}$/.test(value)))].slice(0,12)};
}
export function oiDailyHealth({state=null,scheduler={},runs=[],now=()=>Date.now()}={}){
  const instant=now(),today=oiObservationDate(instant),plannedAt=zonedTarget(today),latestDue=instant>=plannedAt?today:shiftDate(today,-1);
  const since=state?.monitoringEnabled===true&&validInstant(state.monitoringEnabledSince)?state.monitoringEnabledSince:null;
  const firstDate=since?oiObservationDate(Date.parse(since)):null;
  const records=runs.map(run=>safeRun(run,instant,{scheduledOnly:true})).filter(Boolean).sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
  const byDate=new Map();for(const run of records)if(!byDate.has(run.observationDate))byDate.set(run.observationDate,run);
  const missingDates=[];let evaluatedFrom=null;
  if(firstDate&&firstDate<=latestDue){
    evaluatedFrom=[firstDate,shiftDate(latestDue,-29)].sort().at(-1);
    for(let date=evaluatedFrom;date<=latestDue;date=shiftDate(date,1)){
      const due=Math.max(zonedTarget(date),date===firstDate?Date.parse(since):0);
      if(!byDate.has(date)&&instant>=due+5*60000)missingDates.push(date);
    }
  }
  let consecutiveMissingDays=firstDate?0:null;
  if(firstDate)for(let date=latestDue;date>=firstDate&&consecutiveMissingDays<30;date=shiftDate(date,-1)){if(!missingDates.includes(date))break;consecutiveMissingDays++;}
  const assessedDate=firstDate&&firstDate<=latestDue?latestDue:today,assessed=byDate.get(assessedDate),latest=records[0]||null;
  let status,reason;
  if(String(scheduler.state).toLowerCase()==='disabled'){status='disabled';reason='scheduler_disabled';}
  else if(scheduler.available!==true){status='unconfirmed';reason='scheduler_unavailable';}
  else if(assessed){status=({success:'success',partial:'partial',unavailable:'failed',empty_watchlist:'empty_watchlist'})[assessed.status];reason='scheduled_record';}
  else if(!firstDate){status='unconfirmed';reason='monitoring_start_unknown';}
  else if(missingDates.includes(assessedDate)){status='missed';reason='no_scheduled_record';}
  else if(instant<plannedAt){status='waiting';reason=latest?'next_plan_not_due':'first_plan_not_due';}
  else {status='awaiting';reason='within_start_grace';}
  return {status,reason,monitoringEnabledSince:since,currentPlanAt:new Date(plannedAt).toISOString(),assessedDate,
    assessedDueAt:new Date(Math.max(zonedTarget(assessedDate),firstDate===assessedDate?Date.parse(since):0)).toISOString(),
    lastScheduledRun:latest,lastSuccessfulScheduledAt:records.find(run=>run.status==='success')?.completedAt||null,
    missingDates,consecutiveMissingDays,evaluatedFrom,lookbackDays:30,graceMinutes:5,
    scheduledEvidence:latest?(latest.status==='success'?'success_observed':latest.status==='partial'?'partial_observed':latest.status==='empty_watchlist'?'empty_watchlist_observed':'failure_observed'):'unobserved'};
}
async function readScheduledRuns(database,state){
  if(!database?.prepare)return state?.lastRun?.mode==='scheduled'?[state.lastRun]:[];
  const result=await database.prepare('SELECT payload_json FROM oi_daily_runs WHERE mode=? ORDER BY completed_at DESC LIMIT 128').bind('scheduled').all();
  return (result.results||[]).map(row=>{try{return typeof row.payload_json==='string'&&row.payload_json.length<=65536?JSON.parse(row.payload_json):null;}catch{return null;}}).filter(Boolean);
}
async function atomicJson(file,value){const temp=file+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,file);}
async function acquireLock(root,instant){
  const file=join(root,'capture.lock');
  try{const handle=await open(file,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date(instant).toISOString()}));await handle.close();return async()=>{await unlink(file).catch(()=>{});};}
  catch(error){if(error.code!=='EEXIST')throw error;const old=await stat(file);if(instant-old.mtimeMs>30*60000){await unlink(file);return acquireLock(root,instant);}return null;}
}
export async function captureDailyOi({database,webApiClient,rootDirectory=oiDailyRoot(database),mode='manual',now=()=>Date.now()}={}){
  if(!['manual','scheduled'].includes(mode))throw Error('INVALID_MODE');
  const startedAt=new Date(now()).toISOString(),observationDate=oiObservationDate(now());
  await mkdir(rootDirectory,{recursive:true});
  const release=await acquireLock(rootDirectory,now());if(!release)return {status:'running',observationDate};
  try{
    const prior=await readState(rootDirectory,database);
    if(mode==='scheduled'&&!oiDailyIsDue(now()))return {status:'not_due',observationDate};
    const previousSchedule=prior?.schedule?.date===observationDate?prior.schedule:{date:observationDate,attempts:0,success:false,lastAttemptAt:null};
    if(mode==='scheduled'&&previousSchedule.success)return {status:'already_saved',observationDate};
    if(mode==='scheduled'&&previousSchedule.attempts>=3)return {status:'attempts_exhausted',observationDate};
    if(mode==='scheduled'&&previousSchedule.lastAttemptAt&&now()-Date.parse(previousSchedule.lastAttemptAt)<15*60000)return {status:'retry_cooldown',observationDate};
    const report={schemaVersion:1,runId:randomUUID(),timeZone:OI_DAILY_ZONE,mode,startedAt,completedAt:null,observationDate,status:'unavailable',requestedCount:0,savedCount:0,unavailableCount:0,errors:[]};
    try{
      const symbols=await dailyWatchlistSymbols(database);report.requestedCount=symbols.length;
      if(!symbols.length){report.status='empty_watchlist';}
      else{
        const handler=createOiSummaryHandler({webApiClient,database,now});
        const response=await handler(new Request('http://127.0.0.1/api/oi-summaries/refresh?'+new URLSearchParams({symbols:symbols.join(',')}),{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
        const result=await response.json();if(!response.ok||!Array.isArray(result.items))throw Error('CAPTURE_UNAVAILABLE');
        // A retained old value is never counted as a snapshot for this run.
        report.savedCount=result.items.filter(v=>v.archived===true&&!v.stale&&v.checkedAt&&Date.parse(v.checkedAt)>=Date.parse(startedAt)&&Number.isSafeInteger(v.putOi)&&Number.isSafeInteger(v.callOi)).length;
        report.unavailableCount=symbols.length-report.savedCount;
        report.status=report.savedCount===symbols.length?'success':report.savedCount?'partial':'unavailable';
        report.errors=[...new Set(result.items.flatMap(v=>(v.errors||[]).map(e=>e.code)).filter(v=>typeof v==='string'&&/^[A-Z_]{1,48}$/.test(v)))].slice(0,12);
      }
    }catch{report.errors=['CAPTURE_UNAVAILABLE'];report.unavailableCount=report.requestedCount;}
    report.completedAt=new Date(now()).toISOString();
    const schedule=mode==='scheduled'?{date:observationDate,attempts:previousSchedule.attempts+1,success:report.status==='success'||report.status==='empty_watchlist',lastAttemptAt:startedAt}:prior?.schedule||null;
    const state={schemaVersion:1,timeZone:OI_DAILY_ZONE,scheduledTime:OI_DAILY_TIME,schedule,lastRun:report,
      ...(typeof prior?.monitoringEnabled==='boolean'?{monitoringEnabled:prior.monitoringEnabled}:mode==='scheduled'?{monitoringEnabled:true}:{}),
      ...(validInstant(prior?.monitoringEnabledSince)?{monitoringEnabledSince:prior.monitoringEnabledSince}:mode==='scheduled'?{monitoringEnabledSince:startedAt}:{})};
    // The report and dedup/retry state are a single transaction. Restoring a
    // database backup therefore restores both the values and scheduler history.
    await persistState(database,state,report);
    try{
      const runDirectory=join(rootDirectory,'runs');await mkdir(runDirectory,{recursive:true});
      await atomicJson(join(runDirectory,startedAt.replace(/[:.]/g,'-')+'.json'),report);
      await atomicJson(join(rootDirectory,'state.json'),state);
    }catch{console.warn('Daily OI metadata was saved to SQLite; its compatibility file mirror could not be updated.');}
    return report;
  }finally{await release();}
}
function windowsTaskStatus(){
  if(process.platform!=='win32')return Promise.resolve({available:false,state:'not_supported'});
  return new Promise(resolveResult=>{
    const script="$ErrorActionPreference='Stop'; try { $t=Get-ScheduledTask -TaskName 'PCR-OI-Daily-Snapshot' -TaskPath '\\'; $i=Get-ScheduledTaskInfo -TaskName 'PCR-OI-Daily-Snapshot' -TaskPath '\\'; [ordered]@{available=$true;state=[string]$t.State;nextRunAt=if($i.NextRunTime.Year -gt 2000){$i.NextRunTime.ToUniversalTime().ToString('o')}else{$null};lastRunAt=if($i.LastRunTime.Year -gt 2000){$i.LastRunTime.ToUniversalTime().ToString('o')}else{$null};lastTaskResult=$i.LastTaskResult}|ConvertTo-Json -Compress } catch { '{\"available\":false,\"state\":\"not_found\"}' }";
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['ignore','pipe','ignore']});let output='',done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolveResult(value);};
    const timer=setTimeout(()=>{child.kill();finish({available:false,state:'unavailable'});},10000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>8192){child.kill();finish({available:false,state:'unavailable'});}});
    child.on('error',()=>finish({available:false,state:'unavailable'}));child.on('close',()=>{try{finish(JSON.parse(output));}catch{finish({available:false,state:'unavailable'});}});
  });
}
export function createOiDailyStatusHandler({database,rootDirectory=oiDailyRoot(database),now=()=>Date.now(),schedulerStatus=windowsTaskStatus,authorizationStatus=async()=>({configured:null,status:'unavailable'})}={}){
  let taskCache=null,cachedAt=0;
  return async request=>{
    const url=new URL(request.url);if(url.pathname!=='/api/oi-daily')return null;
    const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Same-origin requests only.'},403);
    if(request.method!=='GET'||[...url.searchParams].length)return json({error:'Read-only endpoint.'},request.method!=='GET'?405:400);
    const state=await readState(rootDirectory,database);
    if(!taskCache||now()-cachedAt>30000){taskCache=await schedulerStatus();cachedAt=now();}
    const last=state?.lastRun;
    // Fixed safe fields only: no filesystem locations, credentials or symbols.
    const lastRun=safeRun(last,now());
    const runs=await readScheduledRuns(database,state),health=oiDailyHealth({state,scheduler:taskCache,runs,now});
    let auth;try{auth=await authorizationStatus();}catch{auth=null;}
    const authStatus=['available','refresh_needed','reconnect_required','not_configured','unavailable'].includes(auth?.status)?auth.status:'unavailable';
    const authorization={configured:typeof auth?.configured==='boolean'?auth.configured:null,status:authStatus,
      accessExpiresAt:validInstant(auth?.accessExpiresAt)?auth.accessExpiresAt:null,refreshExpiresAt:validInstant(auth?.refreshExpiresAt)?auth.refreshExpiresAt:null,
      refreshExpiryKnown:auth?.refreshExpiryKnown===true&&validInstant(auth?.refreshExpiresAt),renewable:auth?.renewable===true};
    return json({supported:true,timeZone:OI_DAILY_ZONE,scheduledTime:OI_DAILY_TIME,checkedAt:new Date(now()).toISOString(),scheduler:taskCache,nextPlannedAt:nextOiDailyRun(now()),lastRun,health,authorization});
  };
}
export async function mainDailyOi(args=process.argv.slice(2)){
  const values=new Map();for(let i=0;i<args.length;i++){const key=args[i];if(!['--database','--mode'].includes(key)||!args[i+1]||values.has(key))throw Error('INVALID_ARGUMENTS');values.set(key,args[++i]);}
  const database=await createLocalD1(values.has('--database')?{databasePath:resolve(values.get('--database'))}:{}),auth=createRuntimeMoomooAuth();
  const client=createMoomooWebApiClient({accessTokenProvider:auth.getAccessToken,isConfigured:auth.isConfigured});
  const report=await captureDailyOi({database,webApiClient:client,mode:values.get('--mode')||'manual'});
  console.log(JSON.stringify({status:report.status,observationDate:report.observationDate,requestedCount:report.requestedCount,savedCount:report.savedCount,completedAt:report.completedAt}));
  return ['unavailable','partial'].includes(report.status)?2:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{process.exitCode=await mainDailyOi();}catch{console.error('OI capture could not be completed.');process.exitCode=1;}}
