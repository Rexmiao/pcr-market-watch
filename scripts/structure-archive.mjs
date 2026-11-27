// Durable quote-only Gamma / Max Pain observations. History GETs read SQLite
// only. New observations come exclusively from the shared read-only adapter.
import {randomUUID,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {readStructureStatusRows,createTaskMetadataReader} from './structure-status-read.mjs';
import {pathToFileURL} from 'node:url';
import {optionStructureDate,optionStructureDay,selectGammaExpiries,normalizeGammaObservation,normalizeMaxPainObservation} from '../worker/option-structure.js';

export const STRUCTURE_DAILY_TIME='17:45';
export const STRUCTURE_DAILY_ZONE='America/New_York';
export const STRUCTURE_ARCHIVE_LIMITS=Object.freeze({maxRequests:600,maxDurationMs:1200000,minGapMs:2000,leaseMs:120000,maxScheduledAttempts:3,retryDelayMs:900000,manualCooldownMs:60000,maxPayloadBytes:1500000,maxCompressedBytes:512000,maxIndexDates:3650,maxDateRecords:1000});
const TICKER=/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/;
const validSymbol=value=>typeof value==='string'&&value.length<=10&&TICKER.test(value)&&!/^(US|HK|SH|SZ|SG|JP|AU|CA)\./.test(value);
const validInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const safeCodes=new Set(['NOT_CONFIGURED','AUTH_REQUIRED','AUTH_FAILED','NO_PERMISSION','CREDENTIALS_UNAVAILABLE','TIMEOUT','RATE_LIMITED','NO_DATA','INVALID_RESPONSE','UNSUPPORTED_PROVIDER','PROVIDER_UNAVAILABLE','RESPONSE_TOO_LARGE','PROVIDER_FILTER_LIMIT','REQUEST_BUDGET','TIME_BUDGET','DATE_CHANGED','LEASE_LOST','STORAGE_UNAVAILABLE','INVALID_WATCHLIST','PAYLOAD_LIMIT','FRESH_OBSERVATION_REQUIRED']);
const errorCode=error=>safeCodes.has(error?.code)?error.code:'PROVIDER_UNAVAILABLE';
const iso=instant=>new Date(instant).toISOString();
const parts=instant=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:STRUCTURE_DAILY_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
function targetFor(date){const target=Date.parse(date+'T17:45:00Z');let guess=target;for(let i=0;i<4;i++){const p=parts(guess);guess+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);}return guess;}
export function nextStructureDailyRun(instant=Date.now()){const date=optionStructureDay(instant),today=targetFor(date),tomorrow=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);return iso(today>instant?today:targetFor(tomorrow));}
export function structureDailyIsDue(instant=Date.now()){const p=parts(instant);return `${p.hour}:${p.minute}`>=STRUCTURE_DAILY_TIME;}
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
function checkedLimits(input={}){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(STRUCTURE_ARCHIVE_LIMITS,key)))throw Error('INVALID_LIMITS');const result={...STRUCTURE_ARCHIVE_LIMITS,...input};for(const [key,value]of Object.entries(result)){if(!Number.isSafeInteger(value)||value<0||value>STRUCTURE_ARCHIVE_LIMITS[key]&& !['minGapMs','leaseMs','retryDelayMs','manualCooldownMs'].includes(key))throw Error('INVALID_LIMITS');}if(result.minGapMs<2000||result.leaseMs<60000||result.leaseMs>300000||result.maxRequests<1||result.maxDurationMs<1)throw Error('INVALID_LIMITS');return result;}
function parseObject(text){if(typeof text!=='string'||text.length>1250000)throw {code:'INVALID_RESPONSE'};const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw {code:'INVALID_RESPONSE'};return value;}
async function stateRead(database,id){const row=await database.prepare('SELECT payload_json FROM structure_daily_state WHERE id=?').bind(id).first();return row?parseObject(row.payload_json):null;}
export async function ensureStructureMonitoring({database,enabled,now=()=>Date.now()}={}){
  if(typeof enabled!=='boolean')throw Error('INVALID_MONITORING_STATE');
  const prior=await stateRead(database,'daily');if(prior?.monitoringEnabled===enabled&&(!enabled||validInstant(prior.monitoringEnabledSince)))return {registered:false};
  const stamp=iso(now()),state={schemaVersion:1,monitoringEnabled:enabled,monitoringEnabledSince:enabled?stamp:null};
  await database.prepare('INSERT INTO structure_daily_state(id,payload_json,updated_at,lease_until) VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').bind('daily',JSON.stringify(state),stamp).run();return {registered:true};
}
export async function structurePublishedSymbols(database){
  const rows=await Promise.all(['user_watchlists','user_market_pcr'].map(table=>database.prepare(`SELECT items_json FROM ${table} WHERE owner_id=?`).bind('local_user').first()));
  const symbols=new Set();
  for(let i=0;i<rows.length;i++){
    if(!rows[i])continue;let items;try{items=JSON.parse(rows[i].items_json);}catch{throw {code:'INVALID_WATCHLIST'};}
    if(!Array.isArray(items)||items.length>40)throw {code:'INVALID_WATCHLIST'};
    for(const item of items){if(i===1&&item?.type!=='symbol')continue;if(!validSymbol(item?.symbol))throw {code:'INVALID_WATCHLIST'};symbols.add(item.symbol);}
  }
  return [...symbols].sort();
}
function recordId(runId,task){return createHash('sha256').update([runId,task.kind,task.symbol,task.scopeKind,task.scopeKey].join('|')).digest('hex');}
function encodePayload(payload,limits){const raw=Buffer.from(JSON.stringify(payload));if(raw.length>limits.maxPayloadBytes)throw {code:'PAYLOAD_LIMIT'};const compressed=gzipSync(raw);if(compressed.length>limits.maxCompressedBytes)throw {code:'PAYLOAD_LIMIT'};return {base64:compressed.toString('base64'),bytes:raw.length,compressedBytes:compressed.length};}
function decodePayload(row){if(!Number.isSafeInteger(row.payload_bytes)||row.payload_bytes<1||row.payload_bytes>STRUCTURE_ARCHIVE_LIMITS.maxPayloadBytes||!Number.isSafeInteger(row.compressed_bytes)||row.compressed_bytes<1||row.compressed_bytes>STRUCTURE_ARCHIVE_LIMITS.maxCompressedBytes||typeof row.payload_gzip_base64!=='string'||row.payload_gzip_base64.length>Math.ceil(STRUCTURE_ARCHIVE_LIMITS.maxCompressedBytes/3)*4)throw {code:'INVALID_RESPONSE'};const compressed=Buffer.from(row.payload_gzip_base64,'base64');if(compressed.toString('base64')!==row.payload_gzip_base64||compressed.length!==row.compressed_bytes)throw {code:'INVALID_RESPONSE'};const raw=gunzipSync(compressed,{maxOutputLength:STRUCTURE_ARCHIVE_LIMITS.maxPayloadBytes});if(raw.length!==row.payload_bytes)throw {code:'INVALID_RESPONSE'};return JSON.parse(raw.toString('utf8'));}
function header(row){return {id:row.id,runId:row.run_id,observationDate:row.observation_date,kind:row.kind,symbol:row.symbol,scopeKind:row.scope_kind,scopeKey:row.scope_key,expiries:JSON.parse(row.expiries_json),queriedAt:row.queried_at,providerUpdatedAt:row.provider_updated_at,oiSettlementDate:row.oi_settlement_date,status:row.status,units:row.units};}
const HEADER_COLUMNS='id,run_id,observation_date,kind,symbol,scope_kind,scope_key,expiries_json,queried_at,provider_updated_at,oi_settlement_date,status,units';
async function saveObservation(database,report,task,payload,limits){
  if(!validInstant(payload.checkedAt)||Date.parse(payload.checkedAt)<Date.parse(report.startedAt)||optionStructureDay(Date.parse(payload.checkedAt))!==report.observationDate||payload.stale||!['current','partial'].includes(payload.status))throw {code:'FRESH_OBSERVATION_REQUIRED'};
  const encoded=encodePayload(payload,limits),units=task.kind==='gamma'?'provider_gex_unspecified':'provider_pain_unspecified';
  const result=await database.prepare('INSERT OR IGNORE INTO structure_snapshots(id,run_id,observation_date,kind,symbol,scope_kind,scope_key,expiries_json,queried_at,provider_updated_at,oi_settlement_date,status,units,payload_gzip_base64,payload_bytes,compressed_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(recordId(report.runId,task),report.runId,report.observationDate,task.kind,task.symbol,task.scopeKind,task.scopeKey,JSON.stringify(task.expiries),payload.checkedAt,payload.providerUpdatedAt||null,null,payload.status,units,encoded.base64,encoded.bytes,encoded.compressedBytes).run();
  return result.meta.changes===1;
}
function reportCounts(report){report.requestedCount=report.tasks.length;report.savedCount=report.tasks.filter(task=>task.state==='saved').length;report.partialCount=report.tasks.filter(task=>task.state==='saved'&&task.status==='partial').length;report.notApplicableCount=report.tasks.filter(task=>task.state==='not_applicable').length;report.unavailableCount=report.requestedCount-report.savedCount-report.notApplicableCount;report.errors=[...new Set(report.tasks.flatMap(task=>task.error?[task.error]:[]).concat(report.errors||[]))].slice(0,16);}
function safeRun(value){
  if(!value||!validInstant(value.startedAt)||!optionStructureDate(value.observationDate)||!['manual','scheduled'].includes(value.mode))return null;
  const result={runId:value.runId,observationDate:value.observationDate,mode:value.mode,status:value.status,startedAt:value.startedAt,completedAt:value.completedAt||null,attemptStartedAt:value.attemptStartedAt||value.startedAt,attempts:value.attempts||1,requestedCount:value.requestedCount||0,savedCount:value.savedCount||0,partialCount:value.partialCount||0,notApplicableCount:value.notApplicableCount||0,unavailableCount:value.unavailableCount||0,requestCount:value.requestCount||0,symbolCount:value.symbols?.length||0,plannedSymbolCount:Object.keys(value.plans||{}).length,coverageComplete:value.coverageComplete===true,errors:(value.errors||[]).filter(code=>safeCodes.has(code)),limits:value.limits};
  return result;
}
async function persistReport(database,report){reportCounts(report);await database.prepare('INSERT INTO structure_daily_runs(run_id,observation_date,mode,status,payload_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,completed_at=excluded.completed_at').bind(report.runId,report.observationDate,report.mode,report.status,JSON.stringify(report),report.startedAt,report.completedAt).run();}
function newReport(mode,stamp,date,limits){return {schemaVersion:1,runId:randomUUID(),mode,observationDate:date,timeZone:STRUCTURE_DAILY_ZONE,startedAt:stamp,attemptStartedAt:stamp,completedAt:null,attempts:1,status:'running',symbols:[],plans:{},tasks:[],requestCount:0,attemptRequestCount:0,requestedCount:0,savedCount:0,unavailableCount:0,partialCount:0,coverageComplete:false,errors:[],limits:{maxRequests:limits.maxRequests,maxDurationMs:limits.maxDurationMs,minGapMs:limits.minGapMs}};}
export async function runStructureDaily({database,webApiClient,mode='scheduled',now=()=>Date.now(),sleep=ms=>new Promise(resolveWait=>setTimeout(resolveWait,ms)),limits:inputLimits={}}={}){
  if(!['manual','scheduled'].includes(mode)||!database?.prepare)throw Error('INVALID_CAPTURE_OPTIONS');
  const limits=checkedLimits(inputLimits),started=now(),day=optionStructureDay(started),stamp=iso(started);
  if(mode==='scheduled'&&!structureDailyIsDue(started))return {status:'not_due',observationDate:day};
  const leaseToken=randomUUID(),leaseJson=JSON.stringify({token:leaseToken}),lease=await database.prepare('INSERT INTO structure_daily_state(id,payload_json,updated_at,lease_until) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at,lease_until=excluded.lease_until WHERE structure_daily_state.lease_until<=?').bind('lease',leaseJson,stamp,started+limits.leaseMs,started).run();
  if(lease.meta.changes!==1)return {status:'busy',observationDate:day};
  let report,lastCallAt=null;
  async function renew(){const instant=now(),result=await database.prepare('UPDATE structure_daily_state SET updated_at=?,lease_until=? WHERE id=? AND payload_json=? AND lease_until>?').bind(iso(instant),instant+limits.leaseMs,'lease',leaseJson,instant).run();if(result.meta.changes!==1)throw {code:'LEASE_LOST'};}
  async function call(load){
    if(optionStructureDay(now())!==day)throw {code:'DATE_CHANGED'};
    if(report.attemptRequestCount>=limits.maxRequests)throw {code:'REQUEST_BUDGET'};
    if(now()-started>=limits.maxDurationMs)throw {code:'TIME_BUDGET'};
    const wait=lastCallAt===null?0:limits.minGapMs-(now()-lastCallAt);if(wait>0)await sleep(wait);
    if(optionStructureDay(now())!==day)throw {code:'DATE_CHANGED'};
    if(now()-started>=limits.maxDurationMs)throw {code:'TIME_BUDGET'};
    await renew();lastCallAt=now();report.requestCount++;report.attemptRequestCount++;
    const value=await load();
    if(optionStructureDay(now())!==day||!validInstant(value?.checkedAt)||optionStructureDay(Date.parse(value.checkedAt))!==day)throw {code:'DATE_CHANGED'};
    if(Date.parse(value.checkedAt)<lastCallAt||Date.parse(value.checkedAt)>now()+30000)throw {code:'FRESH_OBSERVATION_REQUIRED'};
    return value;
  }
  try{
    const row=await database.prepare('SELECT payload_json FROM structure_daily_runs WHERE observation_date=? AND mode=? ORDER BY started_at DESC LIMIT 1').bind(day,mode).first();
    const previous=row?parseObject(row.payload_json):null;
    if(mode==='scheduled'&&previous){
      if(['success','empty_watchlist'].includes(previous.status))return {...safeRun(previous),status:'already_saved'};
      if(previous.attempts>=limits.maxScheduledAttempts)return {...safeRun(previous),status:'attempts_exhausted'};
      if(now()-Date.parse(previous.attemptStartedAt||previous.startedAt)<limits.retryDelayMs&&previous.status!=='running')return {...safeRun(previous),status:'retry_cooldown'};
      report=previous;report.attempts++;report.attemptStartedAt=stamp;report.attemptRequestCount=0;report.completedAt=null;report.status='running';report.errors=[];
    }else{
      if(mode==='manual'&&previous&&now()-Date.parse(previous.attemptStartedAt||previous.startedAt)<limits.manualCooldownMs)return {...safeRun(previous),status:'manual_cooldown'};
      report=newReport(mode,stamp,day,limits);report.symbols=await structurePublishedSymbols(database);
    }
    await persistReport(database,report);
    const fatalCodes=new Set(['REQUEST_BUDGET','TIME_BUDGET','DATE_CHANGED','LEASE_LOST','RATE_LIMITED','NOT_CONFIGURED','AUTH_REQUIRED','AUTH_FAILED','CREDENTIALS_UNAVAILABLE']);
    let stopped=false;
    for(const symbol of report.symbols){
      if(!report.plans[symbol]){
        try{
          const observation=await call(()=>webApiClient.expirations(symbol));
          if(observation?.provider!=='moomoo_webapi'||!Array.isArray(observation.data?.expiration_list))throw {code:'INVALID_RESPONSE'};
          const available=observation.data.expiration_list.map(row=>row.strike_time);
          if(available.length>512||available.some(date=>!optionStructureDate(date))||new Set(available).size!==available.length)throw {code:'INVALID_RESPONSE'};
          const expiries=selectGammaExpiries(available,'30d',day);
          report.plans[symbol]={availableExpiries:available.filter(date=>date>=day).sort(),selectedExpiries:expiries,expirationsQueriedAt:observation.checkedAt};
          report.tasks.push({symbol,kind:'gamma',scopeKind:'window',scopeKey:'30d',expiries:[...expiries],state:'pending'},{symbol,kind:'gamma',scopeKind:'window',scopeKey:'30d_ex_nearest',expiries:expiries.slice(1),state:'pending'});
          for(const expiry of expiries)report.tasks.push({symbol,kind:'gamma',scopeKind:'expiry',scopeKey:expiry,expiries:[expiry],state:'pending'},{symbol,kind:'max_pain',scopeKind:'expiry',scopeKey:expiry,expiries:[expiry],state:'pending'});
          await persistReport(database,report);
        }catch(error){report.errors.push(errorCode(error));if(fatalCodes.has(errorCode(error))){stopped=true;break;}continue;}
      }
      for(const task of report.tasks.filter(task=>task.symbol===symbol&&task.state!=='saved')){
        const prior=await database.prepare('SELECT id,status FROM structure_snapshots WHERE id=?').bind(recordId(report.runId,task)).first();
        if(prior){task.state='saved';task.status=prior.status;delete task.error;continue;}
        if(!task.expiries.length){task.state=task.scopeKey==='30d_ex_nearest'?'not_applicable':'unavailable';if(task.state==='unavailable')task.error='NO_DATA';else{task.reason='NO_REMAINING_EXPIRIES';delete task.error;}continue;}
        if(task.expiries.join(',').length>256){task.state='unavailable';task.error='PROVIDER_FILTER_LIMIT';continue;}
        try{
          let payload;
          if(task.kind==='gamma')payload=normalizeGammaObservation(await call(()=>webApiClient.gammaExposure(symbol,{expiries:task.expiries})),task.expiries);
          else payload=normalizeMaxPainObservation(await call(()=>webApiClient.maxPain(symbol,{expiry:task.scopeKey})),{symbol,expiry:task.scopeKey,calendarDate:day,availableExpiries:report.plans[symbol].availableExpiries});
          if(optionStructureDay(now())!==day)throw {code:'DATE_CHANGED'};
          await saveObservation(database,report,task,payload,limits);task.state='saved';task.status=payload.status;delete task.error;
        }catch(error){task.state='unavailable';task.error=errorCode(error);if(fatalCodes.has(task.error)){stopped=true;}}
        await persistReport(database,report);
        if(stopped)break;
      }
      if(stopped)break;
    }
    reportCounts(report);
    // A single-expiry ex-nearest view is explicitly unavailable; it is an empty
    // comparison, never an omitted provider filter that silently means all.
    const expectedTasks=report.tasks.filter(task=>!(task.scopeKey==='30d_ex_nearest'&&!task.expiries.length));
    report.coverageComplete=Object.keys(report.plans).length===report.symbols.length&&expectedTasks.every(task=>task.state==='saved'&&task.status==='current')&&Object.values(report.plans).every(plan=>plan.selectedExpiries.length>0);
    report.status=!report.symbols.length?'empty_watchlist':report.coverageComplete?'success':report.savedCount?'partial':'unavailable';report.completedAt=iso(now());await persistReport(database,report);return safeRun(report);
  }catch(error){
    if(report){report.errors.push(errorCode(error));report.status=report.savedCount?'partial':'unavailable';report.completedAt=iso(now());try{await persistReport(database,report);}catch{throw {code:'STORAGE_UNAVAILABLE'};}return safeRun(report);}
    throw {code:errorCode(error)};
  }finally{await database.prepare('DELETE FROM structure_daily_state WHERE id=? AND payload_json=?').bind('lease',leaseJson).run();}
}

export function createStructureArchiveHandler({database,webApiClient,now=()=>Date.now(),sleep,limits,authorizationStatus=async()=>({configured:null,status:'unavailable'}),schedulerStatus=async()=>({available:false,state:'not_configured'})}={}){
  let background=null,lastBackgroundError=null;
  const schedulerMetadata=createTaskMetadataReader({read:schedulerStatus,now});
  const run=()=>runStructureDaily({database,webApiClient,mode:'manual',now,sleep,limits});
  const handler=async request=>{
    const url=new URL(request.url),path=url.pathname;if(!['/api/structure-archive/index','/api/structure-archive','/api/structure-daily','/api/structure-daily/capture'].includes(path))return null;
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'SAME_ORIGIN_REQUIRED'},403);
    const capture=path==='/api/structure-daily/capture';if(request.method!==(capture?'POST':'GET'))return json({error:'METHOD_NOT_ALLOWED'},405,{allow:capture?'POST':'GET'});
    try{
      if(path.startsWith('/api/structure-daily')){
        if([...url.searchParams].length)return json({error:'INVALID_QUERY'},400);
        if(capture){
          if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||Number(request.headers.get('content-length')||0)>128)return json({error:'INVALID_QUERY'},400);
          const text=await request.text();if(text.length>128||JSON.stringify(JSON.parse(text))!=='{}')return json({error:'INVALID_QUERY'},400);
          if(!background){lastBackgroundError=null;background=run().catch(error=>{lastBackgroundError=errorCode(error);return null;}).finally(()=>{background=null;});}
          return json({schemaVersion:1,accepted:true,status:'queued'},202);
        }
        const [rows,scheduler,auth]=await Promise.all([readStructureStatusRows(database),schedulerMetadata(),Promise.resolve().then(authorizationStatus).catch(()=>null)]);
        const state=rows.statePayload===null?null:parseObject(rows.statePayload),{last,lastScheduled,count,lease}=rows;
        const activeLease=Number.isSafeInteger(lease?.lease_until)&&lease.lease_until>now();
        const schedulerSafe={available:scheduler?.available===true,state:['Ready','Running','Disabled','not_found','not_supported','not_configured'].includes(scheduler?.state)?scheduler.state:'unavailable',nextRunAt:validInstant(scheduler?.nextRunAt)?scheduler.nextRunAt:null,kind:['cloud_process','windows_task','local_process'].includes(scheduler?.kind)?scheduler.kind:null,metadataCache:scheduler.metadataCache};
        if(activeLease&&schedulerSafe.available)schedulerSafe.state='Running';
        const runView=row=>{const run=row?safeRun(parseObject(row.payload_json)):null;return run?.status==='running'&&!activeLease?{...run,status:'interrupted',retryEligible:run.observationDate===optionStructureDay(now())}:run;};
        return json({schemaVersion:1,scheduledTime:STRUCTURE_DAILY_TIME,timeZone:STRUCTURE_DAILY_ZONE,monitoringEnabled:state?.monitoringEnabled===true,monitoringEnabledSince:state?.monitoringEnabledSince||null,nextRunAt:state?.monitoringEnabled&&schedulerSafe.available?nextStructureDailyRun(now()):null,lastRun:runView(last),lastScheduledRun:runView(lastScheduled),scheduler:schedulerSafe,authorization:{configured:typeof auth?.configured==='boolean'?auth.configured:null,status:['available','refresh_needed','reconnect_required','not_configured','unavailable'].includes(auth?.status)?auth.status:'unavailable'},archive:{recordCount:count.record_count,dateCount:count.date_count,lastQueriedAt:count.latest_queried_at},running:Boolean(background)||activeLease,lastBackgroundError,limits:STRUCTURE_ARCHIVE_LIMITS});
      }
      const allowed=path.endsWith('/index')?['symbol']:['symbol','date','id'],seen=new Set();for(const[key]of url.searchParams){if(!allowed.includes(key)||seen.has(key))return json({error:'INVALID_QUERY'},400);seen.add(key);}
      const symbol=url.searchParams.get('symbol');if(!validSymbol(symbol))return json({error:'INVALID_QUERY'},400);
      if(path.endsWith('/index')){
        const result=await database.prepare('SELECT s.observation_date,COUNT(*) AS record_count,SUM(s.kind=\'gamma\') AS gamma_count,SUM(s.kind=\'max_pain\') AS max_pain_count,COUNT(DISTINCT s.run_id) AS run_count,MAX(s.queried_at) AS last_queried_at,GROUP_CONCAT(DISTINCT s.scope_key) AS scope_keys,GROUP_CONCAT(DISTINCT CASE WHEN s.scope_kind=\'expiry\' THEN s.scope_key END) AS expiry_keys,MAX(r.status=\'success\') AS any_success FROM structure_snapshots s LEFT JOIN structure_daily_runs r ON r.run_id=s.run_id WHERE s.symbol=? GROUP BY s.observation_date ORDER BY s.observation_date DESC LIMIT ?').bind(symbol,STRUCTURE_ARCHIVE_LIMITS.maxIndexDates+1).all();
        const dates=result.results.slice(0,STRUCTURE_ARCHIVE_LIMITS.maxIndexDates).map(row=>({date:row.observation_date,recordCount:row.record_count,gammaCount:row.gamma_count,maxPainCount:row.max_pain_count,runCount:row.run_count,lastQueriedAt:row.last_queried_at,status:row.any_success?'success':'partial',expiries:(row.expiry_keys||'').split(',').filter(Boolean).sort(),scopeKeys:(row.scope_keys||'').split(',').filter(Boolean).sort(),scopesTruncated:false}));
        return json({schemaVersion:1,symbol,timeZone:STRUCTURE_DAILY_ZONE,dates,truncated:result.results.length>STRUCTURE_ARCHIVE_LIMITS.maxIndexDates});
      }
      const date=url.searchParams.get('date'),id=url.searchParams.get('id');if(Boolean(date)===Boolean(id)||date&&!optionStructureDate(date)||id&&!/^[a-f0-9]{64}$/.test(id))return json({error:'INVALID_QUERY'},400);
      if(id){const row=await database.prepare('SELECT * FROM structure_snapshots WHERE id=? AND symbol=?').bind(id,symbol).first();if(!row)return json({error:'SNAPSHOT_NOT_FOUND'},404);return json({schemaVersion:1,record:{...header(row),payload:decodePayload(row)}});}
      const rows=(await database.prepare(`SELECT ${HEADER_COLUMNS} FROM structure_snapshots WHERE symbol=? AND observation_date=? ORDER BY queried_at DESC,id LIMIT ?`).bind(symbol,date,STRUCTURE_ARCHIVE_LIMITS.maxDateRecords+1).all()).results;
      const runs=(await database.prepare('SELECT payload_json FROM structure_daily_runs WHERE observation_date=? ORDER BY started_at DESC LIMIT 50').bind(date).all()).results.map(row=>safeRun(parseObject(row.payload_json)));
      return json({schemaVersion:1,symbol,observationDate:date,records:rows.slice(0,STRUCTURE_ARCHIVE_LIMITS.maxDateRecords).map(header),runs,truncated:rows.length>STRUCTURE_ARCHIVE_LIMITS.maxDateRecords});
    }catch(error){return json({error:error instanceof SyntaxError?'INVALID_QUERY':errorCode(error)},error instanceof SyntaxError?400:503);}
  };
  handler.waitForIdle=async()=>{if(background)await background;};
  return handler;
}
export async function mainStructureDaily(args=process.argv.slice(2)){
  const values=new Map();for(let i=0;i<args.length;i++){const key=args[i];if(!['--database','--mode','--register-only'].includes(key)||!args[i+1]||values.has(key))throw Error('INVALID_ARGUMENTS');values.set(key,args[++i]);}
  if(values.has('--register-only')&&!['true','false'].includes(values.get('--register-only')))throw Error('INVALID_ARGUMENTS');
  const [{createLocalD1},{createRuntimeMoomooAuth},{createMoomooWebApiClient}]=await Promise.all([import('./local-db.mjs'),import('./runtime-auth.mjs'),import('../worker/moomoo-webapi.js')]);
  const database=await createLocalD1(values.has('--database')?{databasePath:resolve(values.get('--database'))}:{});
  if(values.get('--register-only')==='true'){console.log(JSON.stringify(await ensureStructureMonitoring({database,enabled:true})));return 0;}
  const auth=createRuntimeMoomooAuth(),client=createMoomooWebApiClient({accessTokenProvider:auth.getAccessToken,isConfigured:auth.isConfigured});
  const report=await runStructureDaily({database,webApiClient:client,mode:values.get('--mode')||'manual'});console.log(JSON.stringify(report));return ['unavailable','partial'].includes(report.status)?2:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{process.exitCode=await mainStructureDaily();}catch{console.error('Option structure capture could not be completed.');process.exitCode=1;}}
