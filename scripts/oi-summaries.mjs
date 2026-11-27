// Local, read-only cloud OI summaries and append-only observation history.
// Independent of legacy option-chain snapshots, events, desktop APIs and Cboe.
import {createOiHistoryStore,validOiDate,oiObservationDate} from './oi-history.mjs';
const PROVIDER='moomoo_webapi',COOLDOWN=30000,MAX_AGE=86400000;
const CODES=new Set(['NOT_CONFIGURED','AUTH_REQUIRED','AUTH_FAILED','NO_PERMISSION','CREDENTIALS_UNAVAILABLE','TIMEOUT','RATE_LIMITED','NO_DATA','INVALID_RESPONSE','UNSUPPORTED_PROVIDER','PROVIDER_UNAVAILABLE','PARTIAL_OI','ZERO_CALL_OI','LOCAL_STORAGE_UNAVAILABLE']);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const error=(symbol,code)=>({symbol,source:PROVIDER,code:CODES.has(code)?code:'PROVIDER_UNAVAILABLE',message:'The requested cloud OI summary could not be fully verified.'});
function unavailable(symbol){return {symbol,provider:PROVIDER,putOi:null,callOi:null,oiPcr:null,checkedAt:null,oiAsOf:null,oiAsOfConfirmed:false,oiBasis:'previous_session',coverage:'provider_symbol_overview',stale:false,status:'unavailable',errors:[]};}
function cleanCached(value,symbol){
  if(!object(value)||value.symbol!==symbol||value.provider!==PROVIDER||value.coverage!=='provider_symbol_overview'||value.oiBasis!=='previous_session')return null;
  const checkedAt=stamp(value.checkedAt);if(!checkedAt)return null;
  const putOi=count(value.putOi),callOi=count(value.callOi);if(putOi===null&&callOi===null)return null;
  const errors=Array.isArray(value.errors)?value.errors.slice(0,4).map(e=>error(symbol,e?.code)):[];
  const oiAsOf=value.oiAsOfConfirmed===true&&validOiDate(value.oiAsOf)&&value.oiAsOf<=oiObservationDate(checkedAt)?value.oiAsOf:null;
  return {...unavailable(symbol),putOi,callOi,oiPcr:putOi!==null&&callOi!==null&&callOi>0?putOi/callOi:null,checkedAt,oiAsOf,oiAsOfConfirmed:oiAsOf!==null,stale:value.stale===true,status:value.status==='failed'?'failed':putOi===null||callOi===null||callOi===0?'partial':'current',errors,...(stamp(value.lastAttemptAt)?{lastAttemptAt:stamp(value.lastAttemptAt)}:{})};
}

export function createOiSummaryHandler({webApiClient,database,now=()=>Date.now()}={}){
  const history=createOiHistoryStore({database,now});
  const cache=new Map(),attempts=new Map(),activeSymbols=new Map(),activeBatches=new Map(),waiters=[];let running=0;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  const iso=()=>new Date(now()).toISOString();
  const configured=()=>{try{return webApiClient?.status?.().configured===true;}catch{return false;}};
  async function limited(task){if(running>=2)await new Promise(accept=>waiters.push(accept));else running++;try{return await task();}finally{const next=waiters.shift();if(next)next();else running--;}}
  function remember(item){cache.delete(item.symbol);cache.set(item.symbol,item);while(cache.size>100)cache.delete(cache.keys().next().value);}
  async function saved(symbol){
    if(cache.has(symbol))return cache.get(symbol);
    if(!database)return null;
    const row=await database.prepare('SELECT payload_json FROM oi_summary_cache WHERE symbol=?').bind(symbol).first();
    if(!row)return null;let item;try{item=cleanCached(JSON.parse(row.payload_json),symbol);}catch{return null;}
    if(item)remember(item);return item;
  }
  async function persist(item,{archiveItem=null}={}){
    remember(item);if(!item.checkedAt)return;
    try{
      if(!database)throw Error();
      if(archiveItem){const archived=await history.archive(archiveItem,{reason:'refresh'});if(archived.item&&item===archiveItem){item.archived=true;item.observationDate=archived.item.observationDate;}}
      await database.batch([
        database.prepare('INSERT INTO oi_summary_cache(symbol,payload_json,checked_at) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET payload_json=excluded.payload_json,checked_at=excluded.checked_at').bind(item.symbol,JSON.stringify(item),item.checkedAt),
        database.prepare('DELETE FROM oi_summary_cache WHERE symbol NOT IN (SELECT symbol FROM oi_summary_cache ORDER BY checked_at DESC,symbol LIMIT 100)'),
      ]);
    }catch{item.status='partial';item.errors.push(error(item.symbol,'LOCAL_STORAGE_UNAVAILABLE'));remember(item);}
  }
  function retain(symbol,prior,code){return {...prior||unavailable(symbol),status:prior?.checkedAt?'failed':'unavailable',stale:Boolean(prior?.checkedAt),lastAttemptAt:iso(),errors:[error(symbol,code)]};}
  async function refreshSymbol(symbol){
    if(activeSymbols.has(symbol))return activeSymbols.get(symbol);
    const pending=(async()=>{
      let prior=null;try{prior=await saved(symbol);}catch{}
      const previousAttempt=attempts.get(symbol),remaining=previousAttempt===undefined?0:COOLDOWN-(now()-previousAttempt);
      if(remaining>0)return {...prior||unavailable(symbol),cached:true,refreshStatus:'cooldown',retryAfterSeconds:Math.ceil(remaining/1000)};
      attempts.delete(symbol);attempts.set(symbol,now());while(attempts.size>100)attempts.delete(attempts.keys().next().value);
      if(!configured()){const item=retain(symbol,prior,'NOT_CONFIGURED');await persist(item);return item;}
      return limited(async()=>{
        let item,archiveItem=null;
        try{
          const result=await webApiClient.overview(symbol),rows=result?.data?.items;
          if(result?.provider!==PROVIDER||!Array.isArray(rows)||rows.length!==1||rows[0]?.code!=='US.'+symbol||!stamp(result.checkedAt))throw {code:'INVALID_RESPONSE'};
          const putOi=count(rows[0].put_open_interest),callOi=count(rows[0].call_open_interest);
          if(putOi===null&&callOi===null)throw {code:'NO_DATA'};
          const checkedAt=stamp(result.checkedAt);
          const oiAsOf=result.oiSettlementDateConfirmed===true&&validOiDate(result.oiSettlementDate)&&result.oiSettlementDate<=oiObservationDate(checkedAt)?result.oiSettlementDate:null;
          archiveItem={...unavailable(symbol),putOi,callOi,oiPcr:putOi!==null&&callOi!==null&&callOi>0?putOi/callOi:null,checkedAt,oiAsOf,oiAsOfConfirmed:oiAsOf!==null,status:putOi===null||callOi===null||callOi===0?'partial':'current',errors:putOi===null||callOi===null?[error(symbol,'PARTIAL_OI')]:callOi===0?[error(symbol,'ZERO_CALL_OI')]:[]};
          if((putOi===null||callOi===null)&&prior?.putOi!==null&&prior?.putOi!==undefined&&prior?.callOi!==null&&prior?.callOi!==undefined){item=retain(symbol,prior,'PARTIAL_OI');}
          else{item=archiveItem;}
        }catch(failure){item=retain(symbol,prior,failure?.code);}
        await persist(item,{archiveItem});return item;
      });
    })();
    activeSymbols.set(symbol,pending);try{return await pending;}finally{activeSymbols.delete(symbol);}
  }
  function summary(items,extra={}){
    const checked=items.map(i=>i.checkedAt).filter(Boolean).sort(),available=items.some(i=>i.putOi!==null||i.callOi!==null),allCurrent=items.every(i=>i.status==='current'&&!i.stale);
    const cooldown=items.every(i=>i.refreshStatus==='cooldown');
    return {schemaVersion:1,provider:PROVIDER,configured:configured(),checkedAt:checked.at(-1)||null,oiAsOf:null,oiBasis:'previous_session',coverage:'provider_symbol_overview',status:allCurrent?'current':available?'partial':'unavailable',items,errors:items.flatMap(i=>i.errors||[]),...(cooldown?{refreshStatus:'cooldown',retryAfterSeconds:Math.max(...items.map(i=>i.retryAfterSeconds||0))}:{}),...extra};
  }
  return async request=>{
    const url=new URL(request.url);if(!['/api/oi-summaries','/api/oi-summaries/refresh','/api/oi-summaries/history'].includes(url.pathname))return null;
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Only same-origin requests are accepted.'},403);
    const refresh=url.pathname.endsWith('/refresh'),historical=url.pathname.endsWith('/history');if(request.method!==(refresh?'POST':'GET'))return json({error:'Method not allowed.'},405);
    let symbols;
    try{
      if([...url.searchParams.keys()].some(k=>k!=='symbols'&&!(historical&&k==='date'))||url.searchParams.getAll('symbols').length!==1||url.searchParams.getAll('date').length>1||historical&&url.searchParams.has('date')&&!validOiDate(url.searchParams.get('date')))throw Error();
      const raw=url.searchParams.get('symbols');if(!raw||raw.length>440)throw Error();
      symbols=raw.split(',');if(!symbols.length||symbols.length>40||symbols.some(s=>s.length>10||!(/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/).test(s)||/^(US|HK|SH|SZ|SG|JP|AU|CA)\./.test(s))||new Set(symbols).size!==symbols.length)throw Error();symbols.sort();
      if(refresh){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error();const body=await request.text();if(body.length>2048)throw Error();const value=JSON.parse(body);if(!object(value)||Object.keys(value).length)throw Error();}
    }catch{return json({error:'Choose 1–40 unique uppercase U.S. ticker codes and an empty JSON object for refresh.'},400);}
    try{await history.importLatestCache();}catch{if(historical)return json({supported:true,available:false,code:'LOCAL_STORAGE_UNAVAILABLE',error:'The saved OI history could not be read.'},503);}
    if(historical){
      try{
        if(url.searchParams.has('date')){const date=url.searchParams.get('date'),items=await history.readDate(symbols,date);return json(summary(items,{supported:Boolean(database),available:Boolean(database),archived:true,observationDate:date,date,timeZone:'America/New_York',cached:true}));}
        return json({schemaVersion:1,provider:PROVIDER,...await history.summary(symbols)});
      }catch{return json({supported:true,available:false,code:'LOCAL_STORAGE_UNAVAILABLE',error:'The saved OI history could not be read.'},503);}
    }
    if(!refresh){const items=await Promise.all(symbols.map(async symbol=>{let item;try{item=await saved(symbol);}catch{}return item?{...item,stale:item.stale||now()-Date.parse(item.checkedAt)>MAX_AGE}:unavailable(symbol);}));return json(summary(items,{cached:true}));}
    const key=symbols.join(',');if(activeBatches.has(key))return json({...await activeBatches.get(key),coalesced:true});
    if(activeBatches.size>=10)return json({error:'Too many OI summary batches are active.',code:'RATE_LIMITED'},429);
    const pending=(async()=>summary(await Promise.all(symbols.map(refreshSymbol)),{lastAttemptAt:iso()}))();
    activeBatches.set(key,pending);try{return json(await pending);}finally{activeBatches.delete(key);}
  };
}
