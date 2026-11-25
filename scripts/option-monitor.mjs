import {monitorSymbol,monitorDate,monitorToday,monitorChain,selectMonitorContracts,normalizeMonitorContracts,normalizeMonitorTrades,monitorOverview,emptyMonitor,monitorTimestamp} from '../worker/option-monitor.js';
import {normalizeWebApiMonitor} from '../worker/option-monitor-webapi.js';

export function createOptionsMonitorHandler({client,webApiClient,database,now=()=>Date.now()}={}) {
  const cache=new Map(),active=new Map(),attempts=new Map();
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  const iso=()=>new Date(now()).toISOString();
  const cacheKey=(mode,symbol,expiration)=>mode+'|'+symbol+'|'+(expiration||'auto');
  function connectionMode(requested) {
    if(requested!=='auto')return requested;
    return webApiClient?.isConfigured?.()?'webapi':'desktop';
  }
  function empty(symbol,mode,status='unavailable') {
    const value=emptyMonitor(symbol,status);
    value.connectionMode=mode;
    if(mode==='webapi') {
      value.provider='moomoo_webapi';value.coverage.mode='provider_symbol_overview';
      value.overview.coverageLabel='provider_symbol_overview';
    }
    return value;
  }
  function safeError(error,source) {
    return {source,code:typeof error?.code==='string'?error.code:'PROVIDER_UNAVAILABLE',message:'The selected market-data query could not be verified.'};
  }
  async function saved(key) {
    if(cache.has(key))return cache.get(key);
    if(!database)return null;
    const row=await database.prepare('SELECT payload_json FROM option_monitor_cache WHERE cache_key=?').bind(key).first();
    if(!row)return null;
    try{const data=JSON.parse(row.payload_json);if(data.schemaVersion===1&&data.symbol&&Array.isArray(data.contracts)){cache.set(key,data);return data;}}catch{}
    return null;
  }
  async function persist(data,keys) {
    if(!database)throw Error('LOCAL_STORAGE_UNAVAILABLE');
    const today=monitorToday(now());
    // Fixed table names keep observations from distinct providers independent.
    const table=data.connectionMode==='webapi'?'option_monitor_webapi_oi':'option_monitor_oi';
    const previous=await database.prepare(`SELECT a.contract,a.observed_date,a.open_interest FROM ${table} a WHERE a.symbol=? AND a.observed_date=(SELECT MAX(b.observed_date) FROM ${table} b WHERE b.contract=a.contract AND b.observed_date<?)`).bind(data.symbol,today).all();
    const prior=new Map(previous.results.map(row=>[row.contract,row]));
    data.oiChanges=data.contracts.filter(c=>c.openInterest!==null&&prior.has(c.contract)).map(c=>({contract:c.contract,optionType:c.optionType,strike:c.strike,expiration:c.expiration,
      previousObservationDate:prior.get(c.contract).observed_date,currentObservationDate:today,previousOi:prior.get(c.contract).open_interest,currentOi:c.openInterest,
      change:c.openInterest-prior.get(c.contract).open_interest,basis:'observed_oi_change',previousOiAsOf:null,currentOiAsOf:null,openClose:'unknown'}));
    const writes=data.contracts.filter(c=>c.openInterest!==null).map(c=>database.prepare(`INSERT INTO ${table}(symbol,contract,expiration,option_type,strike,observed_date,open_interest,checked_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(contract,observed_date) DO UPDATE SET open_interest=excluded.open_interest,checked_at=excluded.checked_at`).bind(data.symbol,c.contract,c.expiration,c.optionType,c.strike,today,c.openInterest,data.checkedAt));
    const payload=JSON.stringify(data);
    for(const key of keys)writes.push(database.prepare('INSERT INTO option_monitor_cache(cache_key,symbol,payload_json,checked_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,checked_at=excluded.checked_at').bind(key,data.symbol,payload,data.checkedAt));
    writes.push(database.prepare('DELETE FROM option_monitor_cache WHERE cache_key NOT IN (SELECT cache_key FROM option_monitor_cache ORDER BY checked_at DESC LIMIT 64)'));
    const cutoff=new Date(now()-120*86400000).toISOString().slice(0,10);
    writes.push(database.prepare(`DELETE FROM ${table} WHERE observed_date<?`).bind(cutoff));
    await database.batch(writes);
  }
  async function refreshDesktop(symbol,requestedExpiration,prior) {
    const errors=[],today=monitorToday(now());
    const expirationsResult=await client.optionExpirations(symbol);
    const availableExpirations=[...new Set((expirationsResult.data.date_list||[]).map(r=>typeof r==='string'?r:r.strike_time||r.date).filter(date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=today))].sort().slice(0,60);
    const expiration=requestedExpiration||availableExpirations[0];
    if(!expiration||!availableExpirations.includes(expiration))throw Object.assign(Error('Unavailable expiration'),{code:'EXPIRATION_UNAVAILABLE'});
    const chain=await client.optionChain(symbol,{begin:expiration,end:expiration});
    const all=monitorChain(chain.data,symbol,expiration);
    if(!all.length)throw Object.assign(Error('No option contracts'),{code:'NO_CONTRACTS'});
    let referencePrice=null,referencePriceTime=null;
    try{const quote=(await client.quotes(symbol)).data.basic_qot_list.find(q=>String(q.security?.code||'').replace(/^US\./,'')===symbol);referencePrice=Number.isFinite(quote?.cur_price)?quote.cur_price:null;referencePriceTime=monitorTimestamp(quote?.update_timestamp);}catch(error){errors.push(safeError(error,'reference_price'));}
    const selected=selectMonitorContracts(all,referencePrice,20);
    const snapshot=await (client.optionSnapshots?client.optionSnapshots(selected.map(c=>c.contract)):client.securitySnapshots(selected.map(c=>c.contract)));
    const contracts=normalizeMonitorContracts(selected,snapshot.data.snapshot_list,prior,now());
    if(!contracts.some(c=>c.available))throw Object.assign(Error('No verified snapshots'),{code:'NO_SNAPSHOTS'});
    const tradeCandidates=contracts.filter(c=>c.available&&c.volume>0).sort((a,b)=>b.volume-a.volume).slice(0,3),events=[];
    let tradeContractsChecked=0;
    // The desktop Host can stall competing CLI subscriptions; collect the
    // bounded ticker subset in order instead of opening concurrent connections.
    for(const contract of tradeCandidates) {
      tradeContractsChecked++;
      try {const result=await client.optionTrades(contract.contract,{count:200});events.push(...normalizeMonitorTrades(contract,result.data.ticker_list,now()));}
      catch(error){errors.push(safeError(error,'trade_prints'));if(error?.code==='TIMEOUT')break;}
    }
    const checkedAt=iso(),observations=contracts.map(c=>c.observationTime).filter(Boolean).sort();
    return {schemaVersion:1,symbol,provider:'moomoo',connectionMode:'desktop',status:errors.length||contracts.some(c=>!c.available||c.volume===null||c.openInterest===null)?'partial':'current',
      checkedAt,observationTime:observations.at(-1)||null,observedDate:today,stale:false,
      coverage:{mode:'selected_expiry_strikes',isComplete:false,expiration,availableExpirations,selectedContracts:selected.length,totalAvailableContracts:all.length,
        strikeMin:Math.min(...selected.map(c=>c.strike)),strikeMax:Math.max(...selected.map(c=>c.strike)),tradeContractsChecked,
        maxPrintsPerContract:200,referencePrice,referencePriceTime,referenceBasis:referencePrice===null?'median_available_strike':'last_regular_quote',
        observationSource:snapshot.sourceCommand||'get-security-snapshot',label:'Selected expiry and up to 20 nearest strike prices; not whole-symbol or whole-market PCR. Trade prints cover at most three scanned contracts.'},
      overview:monitorOverview(contracts),contracts,events:events.sort((a,b)=>(b.fillTime||b.fillTimeRaw||'').localeCompare(a.fillTime||a.fillTimeRaw||'')),
      alerts:[],oiChanges:[],errors,entitlementVerified:false,
      notice:'Provider trade direction is a classification, not verified opening/closing or investor intent. OI uses the latest supplied value with unknown settlement date. Page polling is not background monitoring.'};
  }
  async function refresh(mode,symbol,requestedExpiration,prior) {
    let data;
    if(mode==='webapi') {
      if(!webApiClient)throw Object.assign(Error('Cloud authorization is unavailable'),{code:'NOT_CONFIGURED'});
      const results=await Promise.allSettled([webApiClient.overview(symbol),webApiClient.events(symbol)]);
      if(results.every(result=>result.status==='rejected'))throw results[0].reason;
      data=normalizeWebApiMonitor(symbol,results[0].status==='fulfilled'?results[0].value:null,results[1].status==='fulfilled'?results[1].value:null,{now:now(),expiration:requestedExpiration,prior});
      for(const [index,result] of results.entries())if(result.status==='rejected')data.errors.push(safeError(result.reason,index===0?'overview':'activity'));
      if(data.errors.length&&data.status==='current')data.status='partial';
    } else {
      if(!client)throw Object.assign(Error('Desktop client is unavailable'),{code:'NOT_CONFIGURED'});
      data=await refreshDesktop(symbol,requestedExpiration,prior);
    }
    const keys=[cacheKey(mode,symbol,requestedExpiration)];
    if(mode==='desktop')keys.push(cacheKey(mode,symbol,data.coverage.expiration));
    try{await persist(data,[...new Set(keys)]);}catch{data.status='partial';data.errors.push({source:'storage',code:'LOCAL_STORAGE_UNAVAILABLE',message:'Observations could not be saved; durable OI comparison is unavailable.'});}
    for(const key of keys)cache.set(key,data);
    while(cache.size>64)cache.delete(cache.keys().next().value);
    return data;
  }
  return async request=>{
    const url=new URL(request.url);if(!['/api/options-monitor','/api/options-monitor/refresh'].includes(url.pathname))return null;
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Only same-origin requests are accepted.'},403);
    const force=url.pathname.endsWith('/refresh');
    if(request.method!==(force?'POST':'GET'))return json({error:'Method not allowed.'},405);
    let symbol,expiration,provider;
    try{
      if([...url.searchParams.keys()].some(k=>!['symbol','expiration','provider'].includes(k))||url.searchParams.getAll('symbol').length!==1||url.searchParams.getAll('expiration').length>1||url.searchParams.getAll('provider').length>1)throw Error();
      symbol=monitorSymbol(url.searchParams.get('symbol'));expiration=url.searchParams.get('expiration')||null;if(expiration)monitorDate(expiration);
      provider=url.searchParams.get('provider')||'auto';if(!['auto','desktop','webapi'].includes(provider))throw Error();
      if(force){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error();const body=await request.text();if(body.length>2048)throw Error();const parsed=body?JSON.parse(body):{};if(!parsed||Array.isArray(parsed)||Object.keys(parsed).length)throw Error();}
    }catch{return json({error:'Choose a U.S. symbol, an optional ISO expiration, and an empty JSON body.'},400);}
    const mode=connectionMode(provider),key=cacheKey(mode,symbol,expiration);let prior=null;
    try{prior=await saved(key);}catch{}
    if(!force)return json(prior?{...prior,cached:true,stale:now()-Date.parse(prior.checkedAt)>120000}:empty(symbol,mode));
    if(active.has(key))return json({...await active.get(key),coalesced:true});
    const remaining=30000-(now()-(attempts.get(key)||0));
    if(remaining>0)return json({...prior||empty(symbol,mode),cached:true,refreshStatus:'cooldown',retryAfterSeconds:Math.ceil(remaining/1000)});
    attempts.set(key,now());while(attempts.size>128)attempts.delete(attempts.keys().next().value);
    const pending=refresh(mode,symbol,expiration,prior).catch(error=>({...prior||empty(symbol,mode,'failed'),status:'failed',stale:Boolean(prior),lastAttemptAt:iso(),errors:[safeError(error,'provider')]}));
    active.set(key,pending);try{return json(await pending);}finally{active.delete(key);}
  };
}
