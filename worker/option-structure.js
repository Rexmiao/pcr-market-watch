// Quote-only option structure observations. GET never contacts a provider.
// This bounded process cache is not an archive and is independent of PCR/OI.
const PROVIDER='moomoo_webapi',COOLDOWN=60000,MAX_CACHE=100;
const WINDOWS=new Set(['nearest','7d','30d','all']);
const CODES=new Set(['NOT_CONFIGURED','AUTH_REQUIRED','AUTH_FAILED','NO_PERMISSION','CREDENTIALS_UNAVAILABLE','TIMEOUT','RATE_LIMITED','NO_DATA','INVALID_RESPONSE','UNSUPPORTED_PROVIDER','PROVIDER_UNAVAILABLE','RESPONSE_TOO_LARGE','PROVIDER_FILTER_LIMIT']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const sourceStamp=value=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value).valueOf())?new Date(value).toISOString():null;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export function optionStructureDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(new Date(value+'T12:00:00Z').valueOf())&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function optionStructureDay(now=Date.now()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return p.year+'-'+p.month+'-'+p.day;}
export function selectGammaExpiries(dates,window,day){
  if(!WINDOWS.has(window)||!optionStructureDate(day)||!Array.isArray(dates)||dates.some(value=>!optionStructureDate(value)))throw Error('INVALID_QUERY');
  const available=[...new Set(dates)].filter(date=>date>=day).sort();
  if(window==='all')return available;
  if(window==='nearest')return available.slice(0,1);
  const end=new Date(day+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+(window==='7d'?7:30));
  return available.filter(date=>date<=end.toISOString().slice(0,10));
}
function safeSymbol(value){return typeof value==='string'&&value.length<=10&&/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/.test(value)&&! /^(US|HK|SH|SZ|SG|JP|AU|CA)\./.test(value);}
function err(error){const code=CODES.has(error?.code)?error.code:'PROVIDER_UNAVAILABLE';return {code,message:'The requested moomoo option structure could not be verified.'};}
function sameDates(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((date,index)=>date===b[index]);}
function emptyGamma(dates=[],reason=null){return {status:'unavailable',checkedAt:null,providerUpdatedAt:null,underlyingPrice:null,callWall:null,putWall:null,zeroGammaPoints:[],zeroGammaDisclosed:false,items:[],profile:[],profileKind:null,selectedExpiries:[...dates],errors:[],stale:false,...(reason?{reason}:{})};}
function cleanGamma(result,dates){
  if(result?.provider!==PROVIDER||!stamp(result.checkedAt)||!object(result.data))throw {code:'INVALID_RESPONSE'};
  const d=result.data,items=Array.isArray(d.items)?d.items.map(row=>({strike:row.strike_price,callGex:row.call_gex,putGex:row.put_gex,netGex:row.net_gex})):[];
  const original=Array.isArray(d.profile_points)?d.profile_points:[],interpolated=Array.isArray(d.interpolated_points)?d.interpolated_points:[];
  const useOriginal=original.some(row=>finite(row.aggregate_gex)),rawProfile=useOriginal?original:interpolated;
  const profile=rawProfile.map(row=>({spot:row.spot_price,gex:row.aggregate_gex}));
  if(!items.some(row=>[row.callGex,row.putGex,row.netGex].some(finite))&&!profile.some(row=>finite(row.gex))&&!finite(d.call_wall_strike)&&!finite(d.put_wall_strike))throw {code:'NO_DATA'};
  return {...emptyGamma(dates),status:items.length&&profile.some(row=>finite(row.gex))?'current':'partial',checkedAt:stamp(result.checkedAt),providerUpdatedAt:sourceStamp(d.update_time),underlyingPrice:d.underlying_price??null,callWall:d.call_wall_strike??null,putWall:d.put_wall_strike??null,zeroGammaPoints:d.zero_gamma_points||[],zeroGammaDisclosed:d.zero_gamma_disclosed===true,items,profile,profileKind:profile.length?(useOriginal?'provider_profile':'provider_interpolated'):null};
}
// Shared by the durable collector. These functions normalize a newly returned
// quote-only observation; they never read or retain the live process cache.
export function normalizeGammaObservation(result,dates){return cleanGamma(result,dates);}
export function normalizeMaxPainObservation(result,{symbol,expiry,calendarDate,availableExpiries=[]}={}){
  const d=result?.data,chain=d?.chains?.[0];
  if(result?.provider!==PROVIDER||!stamp(result.checkedAt)||!chain||chain.strike_date!==expiry||!Array.isArray(chain.items))throw {code:'NO_DATA'};
  const items=chain.items.map(row=>({strike:row.strike_price,callPain:row.call_pain,putPain:row.put_pain,totalPain:row.total_pain}));
  if(!finite(chain.max_pain_strike)&&!items.some(row=>[row.callPain,row.putPain,row.totalPain].some(finite)))throw {code:'NO_DATA'};
  return {schemaVersion:1,provider:PROVIDER,kind:'max_pain',symbol,configured:true,calendarDate,currentCalendarDate:calendarDate,availableExpiries:[...availableExpiries],expiry,
    status:finite(chain.max_pain_strike)&&items.length?'current':'partial',checkedAt:stamp(result.checkedAt),providerUpdatedAt:sourceStamp(d.update_time),maxPain:chain.max_pain_strike??null,
    underlyingPrice:null,items,errors:[],stale:false,lastAttemptAt:stamp(result.checkedAt),units:'provider_pain_unspecified',oiSettlementDate:null};
}
function retainedGamma(prior,dates,error,now){const previous=prior?.checkedAt&&sameDates(prior.selectedExpiries,dates)?structuredClone(prior):emptyGamma(dates);return {...previous,status:previous.checkedAt?'failed':'unavailable',stale:Boolean(previous.checkedAt),lastAttemptAt:new Date(now).toISOString(),errors:[err(error)]};}

export function createOptionStructureHandler({webApiClient,now=()=>Date.now()}={}){
  const cache=new Map(),expiryCache=new Map(),operations=new Map();
  const iso=()=>new Date(now()).toISOString();
  const configured=()=>{try{return webApiClient?.status?.().configured===true;}catch{return false;}};
  function remember(key,value){cache.delete(key);cache.set(key,structuredClone(value));while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);return value;}
  function view(value){const result=structuredClone(value);result.currentCalendarDate=optionStructureDay(now());if(result.calendarDate!==result.currentCalendarDate){result.stale=true;if(result.base)result.base.stale=Boolean(result.base.checkedAt);if(result.withoutNearest)result.withoutNearest.stale=Boolean(result.withoutNearest.checkedAt);}return result;}
  function gammaShell(symbol,window){return {schemaVersion:1,provider:PROVIDER,kind:'gamma',symbol,window,configured:configured(),calendarDate:optionStructureDay(now()),currentCalendarDate:optionStructureDay(now()),availableExpiries:[],selectedExpiries:[],nearestExpiry:null,status:'unavailable',lastAttemptAt:null,stale:false,units:'provider_gex_unspecified',positioning:'provider_model_assumptions',oiSettlementDate:null,base:emptyGamma(),withoutNearest:{...emptyGamma([], 'NOT_CHECKED'),excludedExpiry:null},errors:[]};}
  function painShell(symbol,expiry=null){return {schemaVersion:1,provider:PROVIDER,kind:'max_pain',symbol,configured:configured(),calendarDate:optionStructureDay(now()),currentCalendarDate:optionStructureDay(now()),availableExpiries:[],expiry,status:'unavailable',checkedAt:null,providerUpdatedAt:null,maxPain:null,underlyingPrice:null,items:[],errors:[],stale:false,lastAttemptAt:null,units:'provider_pain_unspecified',oiSettlementDate:null};}
  async function expiryDates(symbol){
    const existing=expiryCache.get(symbol),day=optionStructureDay(now());if(existing&&existing.day===day&&now()-existing.at<300000)return [...existing.dates];
    if(!configured())throw {code:'NOT_CONFIGURED'};
    const result=await webApiClient.expirations(symbol);if(result?.provider!==PROVIDER||!stamp(result.checkedAt)||!Array.isArray(result.data?.expiration_list))throw {code:'INVALID_RESPONSE'};
    const dates=result.data.expiration_list.map(row=>row.strike_time);if(dates.some(date=>!optionStructureDate(date)))throw {code:'INVALID_RESPONSE'};
    const available=[...new Set(dates)].filter(date=>date>=day).sort();expiryCache.delete(symbol);expiryCache.set(symbol,{day,at:now(),dates:available});while(expiryCache.size>100)expiryCache.delete(expiryCache.keys().next().value);return available;
  }
  async function gamma(symbol,window,key){
    const previous=cache.get(key),day=optionStructureDay(now());let available;
    try{available=await expiryDates(symbol);}catch(error){const result=previous?view(previous):gammaShell(symbol,window);result.configured=configured();result.status=previous?.base?.checkedAt?'failed':'unavailable';result.stale=Boolean(previous?.base?.checkedAt);result.lastAttemptAt=iso();result.errors=[err(error)];for(const name of ['base','withoutNearest'])if(previous?.[name]?.checkedAt)result[name]={...result[name],status:'failed',stale:true,errors:[err(error)]};else result[name].errors=[err(error)];return remember(key,result);}
    const dates=selectGammaExpiries(available,window,day),remaining=dates.slice(1),result={...gammaShell(symbol,window),availableExpiries:available,selectedExpiries:dates,nearestExpiry:dates[0]||null,lastAttemptAt:iso()};
    if(!dates.length){result.base=emptyGamma([], 'NO_EXPIRIES');result.withoutNearest={...emptyGamma([], 'NO_REMAINING_EXPIRIES'),excludedExpiry:null};return remember(key,result);}
    async function load(selected,prior,{all=false}={}){
      if(!selected.length)return emptyGamma([], 'NO_REMAINING_EXPIRIES');
      if(!all&&selected.join(',').length>256)return emptyGamma(selected,'PROVIDER_FILTER_LIMIT');
      try{return cleanGamma(await webApiClient.gammaExposure(symbol,{expiries:all?null:selected}),selected);}catch(error){return retainedGamma(prior,selected,error,now());}
    }
    const [base,without]=await Promise.all([load(dates,previous?.base,{all:window==='all'}),load(remaining,previous?.withoutNearest)]);
    result.base=base;result.withoutNearest={...without,excludedExpiry:dates[0]};
    result.status=base.status==='current'&&(!remaining.length||without.status==='current')?'current':[base,without].some(value=>['current','partial'].includes(value.status))?'partial':base.checkedAt||without.checkedAt?'failed':'unavailable';
    result.stale=base.stale||without.stale;return remember(key,result);
  }
  async function pain(symbol,expiry,key){
    const previous=cache.get(key);let available,chosen=expiry;
    try{
      available=await expiryDates(symbol);chosen=expiry||available[0]||null;
      if(!chosen)return remember(key,{...painShell(symbol),availableExpiries:available,reason:'NO_EXPIRIES',lastAttemptAt:iso()});
      if(!available.includes(chosen))return remember(key,{...painShell(symbol,chosen),availableExpiries:available,reason:'EXPIRY_NOT_AVAILABLE',lastAttemptAt:iso()});
      const result=await webApiClient.maxPain(symbol,{expiry:chosen}),d=result?.data,chain=d?.chains?.[0];
      if(result?.provider!==PROVIDER||!stamp(result.checkedAt)||!chain||chain.strike_date!==chosen)throw {code:'NO_DATA'};
      const items=chain.items.map(row=>({strike:row.strike_price,callPain:row.call_pain,putPain:row.put_pain,totalPain:row.total_pain}));
      if(!finite(chain.max_pain_strike)&&!items.some(row=>[row.callPain,row.putPain,row.totalPain].some(finite)))throw {code:'NO_DATA'};
      const value={...painShell(symbol,chosen),status:finite(chain.max_pain_strike)&&items.length?'current':'partial',availableExpiries:available,checkedAt:stamp(result.checkedAt),providerUpdatedAt:sourceStamp(d.update_time),maxPain:chain.max_pain_strike??null,items,lastAttemptAt:iso()};
      remember('max_pain|'+symbol+'|'+chosen,value);return remember(key,value);
    }catch(error){
      const canRetain=previous?.checkedAt&&(!chosen||previous.expiry===chosen),value=canRetain?view(previous):painShell(symbol,chosen);
      if(available)value.availableExpiries=available;value.status=canRetain?'failed':'unavailable';value.stale=Boolean(canRetain);value.lastAttemptAt=iso();value.errors=[err(error)];return remember(key,value);
    }
  }
  return async request=>{
    const url=new URL(request.url),path=url.pathname,isGamma=['/api/gamma-exposure','/api/gamma-exposure/refresh'].includes(path),isPain=['/api/max-pain','/api/max-pain/refresh'].includes(path);
    if(!isGamma&&!isPain)return null;
    const refresh=path.endsWith('/refresh');if(request.method!==(refresh?'POST':'GET'))return json({error:'METHOD_NOT_ALLOWED'},405,{'allow':refresh?'POST':'GET'});
    let symbol,window='30d',expiry=null;
    try{
      const allowed=isGamma?['symbol','window']:['symbol','expiry'];let values;
      if(refresh){
        if([...url.searchParams].length||!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
        const text=await request.text();if(text.length>2048)throw Error();values=JSON.parse(text);if(!object(values)||Object.keys(values).some(key=>!allowed.includes(key)))throw Error();
      }else{const seen=new Set();for(const [key]of url.searchParams){if(!allowed.includes(key)||seen.has(key))throw Error();seen.add(key);}values=Object.fromEntries(url.searchParams);}
      symbol=values.symbol;if(!safeSymbol(symbol))throw Error();
      if(isGamma){window=values.window===undefined?'30d':values.window;if(!WINDOWS.has(window))throw Error();}else if(values.expiry!==undefined){expiry=values.expiry;if(!optionStructureDate(expiry))throw Error();}
    }catch{return json({error:'INVALID_QUERY'},400);}
    const kind=isGamma?'gamma':'max_pain',key=kind+'|'+symbol+'|'+(isGamma?window:expiry||'nearest');
    if(!refresh)return json(view(cache.get(key)||(isGamma?gammaShell(symbol,window):painShell(symbol,expiry))));
    const priorOperation=operations.get(kind);
    if(priorOperation?.pending){if(priorOperation.key===key)return json(view(await priorOperation.pending));return json({error:'REFRESH_BUSY',retryAfterSeconds:2},429,{'retry-after':'2'});}
    const remaining=priorOperation?COOLDOWN-(now()-priorOperation.at):0;if(remaining>0){const retry=Math.ceil(remaining/1000),saved=cache.get(key);return json({...saved?view(saved):{},error:'REFRESH_COOLDOWN',retryAfterSeconds:retry},429,{'retry-after':String(retry)});}
    const state={key,at:now(),pending:null};operations.set(kind,state);state.pending=isGamma?gamma(symbol,window,key):pain(symbol,expiry,key);
    try{return json(view(await state.pending));}finally{state.pending=null;}
  };
}
