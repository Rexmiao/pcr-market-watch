// A local, read-only market-brief bridge. Configured direct WebAPI takes priority;
// a failed cloud request never silently switches to a different data source.
const TTL=15000,MAX_ACTIVE=20,MAX_CACHE=100;
const SAFE_CODES=new Set(['NOT_CONFIGURED','AUTH_REQUIRED','AUTH_FAILED','NO_PERMISSION','CREDENTIALS_UNAVAILABLE','TIMEOUT','RATE_LIMITED','NO_DATA','INVALID_RESPONSE','UNSUPPORTED_PROVIDER','PROVIDER_UNAVAILABLE','CLI_UNAVAILABLE','HOST_UNAVAILABLE']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
const stamp=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
const clockText=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)?$/.test(value)?value:null;
const failure=code=>{throw {code};};
function allowedRequest(request,url){
  const loopback=new Set(['127.0.0.1','localhost','[::1]']);
  if(url.protocol!=='http:'||!loopback.has(url.hostname)||url.username||url.password)return false;
  let expected=url.origin;
  const host=request.headers.get('host');
  if(host){
    if(!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(host))return false;
    let actual;try{actual=new URL('http://'+host);}catch{return false;}
    if(!loopback.has(actual.hostname)||actual.port!==url.port)return false;
    expected=actual.origin;
  }
  return request.headers.get('sec-fetch-site')!=='cross-site'&&(!request.headers.has('origin')||request.headers.get('origin')===expected);
}
function symbolsFrom(url){
  if([...url.searchParams.keys()].some(key=>key!=='symbols')||url.searchParams.getAll('symbols').length!==1)failure('INVALID_SYMBOL');
  const raw=url.searchParams.get('symbols');if(!raw||raw.length>219)failure('INVALID_SYMBOL');
  const symbols=raw.split(',');
  if(!symbols.length||symbols.length>20||new Set(symbols).size!==symbols.length||symbols.some(symbol=>symbol.length>10||!(/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/).test(symbol)||/^(US|HK|SH|SZ|BJ|SG|JP|AU|CA|KR)\./.test(symbol)))failure('INVALID_SYMBOL');
  return symbols.sort();
}
function session(row,{cloud=false}={}){
  const result={price:positive(row?.price)};
  if(!cloud){const timestamp=positive(row?.update_timestamp),text=clockText(row?.update_time);if(timestamp!==null)result.update_timestamp=timestamp;if(text)result.update_time=text;}
  return result;
}
function cleanQuotes(result,symbols,provider){
  const cloud=provider==='moomoo_webapi',checkedAt=stamp(result?.checkedAt),sourceRows=cloud?result?.data?.quote_list:result?.data?.basic_qot_list;
  if(!checkedAt||result?.provider!==(cloud?'moomoo_webapi':'moomoo')||!Array.isArray(sourceRows)||sourceRows.length>symbols.length)failure('INVALID_RESPONSE');
  const seen=new Set(),rows=sourceRows.map(source=>{
    const code=cloud?(typeof source?.code==='string'?source.code.replace(/^US\./,''):null):source?.security?.code;
    if(!object(source)||typeof code!=='string'||!symbols.includes(code)||seen.has(code)||(cloud?source.code!=='US.'+code:source.security?.market!==11))failure('INVALID_RESPONSE');
    seen.add(code);
    const timestamp=cloud?(Number.isSafeInteger(source.data_time)?positive(source.data_time)/1000:null):positive(source.update_timestamp);
    const row={security:{code,market:11},cur_price:positive(cloud?source.last_price:source.cur_price),update_timestamp:timestamp||null};
    const quoteDate=date(cloud?source.data_date:source.data_date);if(quoteDate)row.data_date=quoteDate;
    for(const key of ['open_price','high_price','low_price'])row[key]=positive(source[key]);
    row.last_close_price=positive(cloud?source.prev_close_price:source.last_close_price);
    row.volume=count(source.volume);
    if(!cloud){const text=clockText(source.update_time);if(text)row.update_time=text;}
    for(const key of ['pre_market','after_market','overnight'])row[key]=session(source[key],{cloud});
    return row;
  });
  return {provider,checkedAt,status:rows.length===symbols.length&&rows.every(row=>row.cur_price!==null&&row.update_timestamp!==null)?'current':'partial',data:{basic_qot_list:rows}};
}
export function createBriefQuotesHandler({webApiClient,desktopClient,now=()=>Date.now()}={}){
  const cache=new Map(),active=new Map();
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  function selected(){
    let cloudStatus,desktopStatus;try{cloudStatus=webApiClient?.status?.();}catch{}
    if(cloudStatus?.configured===true)return {provider:'moomoo_webapi',client:webApiClient,status:cloudStatus};
    try{desktopStatus=desktopClient?.status?.();}catch{}
    return {provider:'moomoo_desktop',client:desktopClient,status:desktopStatus};
  }
  function statusOf(selection){const value=selection.status;return {provider:selection.provider,configured:value?.configured===true&&(selection.provider==='moomoo_webapi'||value.cliAvailable!==false),connectionStatus:['not_configured','not_checked','connected','error'].includes(value?.connectionStatus)?value.connectionStatus:'not_configured',readOnly:true};}
  return async request=>{
    const url=new URL(request.url);if(!['/api/brief-quotes','/api/brief-quotes/status'].includes(url.pathname))return null;
    if(!allowedRequest(request,url))return json({error:'Only same-origin loopback requests are accepted.'},403);
    if(request.method!=='GET')return json({error:'Method not allowed.'},405);
    const selection=selected();
    if(url.pathname.endsWith('/status'))return [...url.searchParams].length?json({error:'Unexpected query parameter.'},400):json(statusOf(selection));
    let symbols;try{symbols=symbolsFrom(url);}catch{return json({error:'Choose 1–20 unique uppercase U.S. stock or ETF codes.',code:'INVALID_SYMBOL'},400);}
    const key=selection.provider+'|'+symbols.join(','),previous=cache.get(key);
    if(previous&&now()-previous.at<TTL)return json({...previous.value,cached:true});
    try{
      if(!statusOf(selection).configured)failure('NOT_CONFIGURED');
      let pending=active.get(key);
      if(!pending){
        if(active.size>=MAX_ACTIVE)failure('RATE_LIMITED');
        pending=(async()=>{
          const method=selection.provider==='moomoo_webapi'?'stockQuotes':'quotes';
          if(typeof selection.client?.[method]!=='function')failure('UNSUPPORTED_PROVIDER');
          const result=cleanQuotes(await selection.client[method](symbols),symbols,selection.provider);
          cache.delete(key);cache.set(key,{at:now(),value:result});while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
          return result;
        })();
        active.set(key,pending);pending.finally(()=>{if(active.get(key)===pending)active.delete(key);}).catch(()=>{});
      }
      return json(await pending);
    }catch(error){
      const code=SAFE_CODES.has(error?.code)?error.code:'PROVIDER_UNAVAILABLE';
      const status=({NOT_CONFIGURED:503,AUTH_REQUIRED:401,AUTH_FAILED:401,NO_PERMISSION:403,CREDENTIALS_UNAVAILABLE:503,TIMEOUT:504,RATE_LIMITED:429,NO_DATA:404,UNSUPPORTED_PROVIDER:503,CLI_UNAVAILABLE:503,HOST_UNAVAILABLE:503})[code]||502;
      return json({provider:selection.provider,checkedAt:null,error:'The selected moomoo market-data provider could not complete the quote request.',code},status);
    }
  };
}
