// Optional direct market-data provider. Web standards only; no desktop processes,
// account endpoints, trade commands, credentials in URLs, or configurable hosts.
const API_ORIGIN='https://webapi.moomoo.com';
const MAX_BYTES=2_000_000;
const TOKEN=/^[A-Za-z0-9._~+\/-]+=*$/;

export class MoomooWebApiError extends Error {
  constructor(code,message,status=502){super(message);this.name='MoomooWebApiError';this.code=code;this.status=status;}
}
function symbolCode(value){
  if(typeof value!=='string')throw new MoomooWebApiError('INVALID_SYMBOL','Choose one U.S. stock or ETF code.',400);
  const code=value.trim().toUpperCase().replace(/^US\./,'');
  if(!/^[A-Z][A-Z0-9.]{0,9}$/.test(code)||/^(HK|SH|SZ|SG|JP|AU|CA)\./.test(code))throw new MoomooWebApiError('INVALID_SYMBOL','Choose one U.S. stock or ETF code.',400);
  return 'US.'+code;
}
function matchesSymbol(value,expected){try{return symbolCode(value)===expected;}catch{return false;}}
function tokenValue(value){
  if(typeof value!=='string'||!value||value.length>8192||!TOKEN.test(value))throw new MoomooWebApiError('AUTH_FAILED','The moomoo WebAPI authorization is invalid or expired.',401);
  return value;
}
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function number(value,{integer=false,positive=false,signed=false}={}){
  if(!['string','number'].includes(typeof value)||(typeof value==='string'&&!value.trim()))return null;
  const n=Number(value);
  return Number.isFinite(n)&&(!integer||Number.isSafeInteger(n))&&(signed||n>=0)&&(!positive||n>0)?n:null;
}
async function readJson(response){
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES)throw new MoomooWebApiError('RESPONSE_TOO_LARGE','The moomoo response exceeds the permitted size.');
  const reader=response.body?.getReader();
  let text='';
  if(reader){
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new MoomooWebApiError('RESPONSE_TOO_LARGE','The moomoo response exceeds the permitted size.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}text=new TextDecoder().decode(bytes);
  }else{text=await response.text();if(new TextEncoder().encode(text).length>MAX_BYTES)throw new MoomooWebApiError('RESPONSE_TOO_LARGE','The moomoo response exceeds the permitted size.');}
  try{return JSON.parse(text);}catch{throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo WebAPI response was not valid JSON.');}
}
function providerError(status){
  if(status===401)return new MoomooWebApiError('AUTH_FAILED','The moomoo WebAPI authorization is invalid or expired.',401);
  if(status===403)return new MoomooWebApiError('NO_PERMISSION','The moomoo WebAPI authorization or market-data entitlement does not permit this query.',403);
  if(status===429)return new MoomooWebApiError('RATE_LIMITED','The moomoo WebAPI rate limit was reached.',429);
  if(status>=300&&status<400)return new MoomooWebApiError('REDIRECT_BLOCKED','Redirected moomoo WebAPI requests are not permitted.');
  return new MoomooWebApiError('PROVIDER_UNAVAILABLE','The moomoo WebAPI market-data service could not complete the query.');
}

export function createMoomooWebApiClient({accessToken='',accessTokenProvider,isConfigured,fetcher=(...args)=>fetch(...args),timeoutMs=15000}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new MoomooWebApiError('INVALID_TIMEOUT','Choose a request timeout up to 60 seconds.',400);
  if(typeof accessToken!=='string'||(accessToken&&(accessToken.length>8192||!TOKEN.test(accessToken))))throw new MoomooWebApiError('AUTH_FAILED','The moomoo WebAPI authorization is invalid.',401);
  const configured=()=>{try{return typeof isConfigured==='function'?Boolean(isConfigured()):Boolean(accessToken||accessTokenProvider);}catch{return false;}};
  let lastSuccessAt=null,lastErrorCode=null;
  const active=new Map();
  async function request(path,{method='GET',query,body}={}){
    // These are public market-data queries, including the read-only POST overview.
    if(!['/api/v1.0/quote/option-underlying-overview','/api/v1.0/quote/option-event'].includes(path))throw new MoomooWebApiError('COMMAND_BLOCKED','This WebAPI operation is not permitted.',403);
    if(!configured())throw new MoomooWebApiError('NOT_CONFIGURED','Connect moomoo WebAPI with quote:read authorization to use the direct data provider.',503);
    const url=new URL(path,API_ORIGIN);if(query)for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
    const controller=new AbortController();let timer;
    const timedOut=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new MoomooWebApiError('TIMEOUT','The moomoo WebAPI request timed out.',504));},timeoutMs);});
    const operation=(async()=>{
      for(let attempt=0;attempt<2;attempt++){
        const token=tokenValue(typeof accessTokenProvider==='function'?await accessTokenProvider({forceRefresh:attempt===1}):accessToken);
        const response=await fetcher(url.href,{method,headers:{accept:'application/json',authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:controller.signal});
        if(response.status===401&&attempt===0&&typeof accessTokenProvider==='function'){await response.body?.cancel();continue;}
        if(response.status<200||response.status>=300)throw providerError(response.status);
        if(response.url&&new URL(response.url).origin!==API_ORIGIN)throw providerError(302);
        const payload=await readJson(response);
        if(!object(payload)||payload.ret_code!==0||!object(payload.data)){
          if(payload?.ret_code===-8)throw new MoomooWebApiError('UNSUPPORTED_PROVIDER','This moomoo WebAPI query is not supported.',503);
          if(payload?.ret_code===-10)throw new MoomooWebApiError('NO_DATA','No moomoo WebAPI data is available for this query.',404);
          throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo WebAPI response was rejected or had an unexpected schema.');
        }
        return payload;
      }
      throw providerError(401);
    })();
    try{return await Promise.race([operation,timedOut]);}finally{clearTimeout(timer);}
  }
  async function perform(key,load){
    if(active.has(key))return active.get(key);
    if(active.size>=20)throw new MoomooWebApiError('RATE_LIMITED','Too many direct moomoo market-data queries are active.',429);
    const pending=(async()=>{try{const result=await load();lastSuccessAt=result.checkedAt;lastErrorCode=null;return result;}catch(error){const authenticationCodes=['NOT_CONFIGURED','AUTH_REQUIRED','NO_PERMISSION','CREDENTIALS_UNAVAILABLE'];const safe=error instanceof MoomooWebApiError?error:authenticationCodes.includes(error?.code)?new MoomooWebApiError(error.code,'Reconnect moomoo WebAPI with quote:read authorization.',[401,403,503].includes(error.status)?error.status:503):new MoomooWebApiError('PROVIDER_UNAVAILABLE','The moomoo WebAPI query could not be completed.');lastErrorCode=safe.code;throw safe;}})();
    active.set(key,pending);try{return await pending;}finally{active.delete(key);}
  }
  function observation(kind,data,extra={}){return {provider:'moomoo_webapi',kind,checkedAt:new Date().toISOString(),data,entitlementVerified:false,...extra};}
  return Object.freeze({
    status(){return {provider:'moomoo_webapi',configured:configured(),connectionStatus:!configured()?'not_configured':lastErrorCode?'error':lastSuccessAt?'connected':'not_checked',lastSuccessAt,lastErrorCode,readOnly:true,capabilities:['option_overview','option_events'],scope:'quote:read only; no account, position, order, or trade access.'};},
    async overview(input){
      const code=symbolCode(input);
      return perform('overview|'+code,async()=>{
        const payload=await request('/api/v1.0/quote/option-underlying-overview',{method:'POST',body:{codes:[code]}});
        if(!Array.isArray(payload.data.items)||payload.data.items.length>1)throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo overview returned an unexpected symbol list.');
        const items=payload.data.items.map(row=>{
          if(!object(row)||!matchesSymbol(row.code,code))throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo overview returned a different underlying.');
          return {code,call_volume:number(row.call_volume,{integer:true}),put_volume:number(row.put_volume,{integer:true}),call_open_interest:number(row.call_open_interest,{integer:true}),put_open_interest:number(row.put_open_interest,{integer:true}),iv:number(row.iv),iv_rank:number(row.iv_rank),iv_percentile:number(row.iv_percentile),pre_iv:number(row.pre_iv),historical_volatilities:Array.isArray(row.historical_volatilities)?row.historical_volatilities.slice(0,32).filter(object).map(v=>({time_range:number(v.time_range,{integer:true,positive:true}),hv:number(v.hv)})):[]};
        });
        return observation('option_overview',{items},{symbols:[code],oiLag:'T-1',oiSettlementDate:null,marketTimestamp:null,coverage:'Vendor per-underlying aggregate. Exact exchange/expiry coverage and volume refresh delay are not documented here; open interest is T-1.'});
      });
    },
    async events(input){
      const code=symbolCode(input);
      return perform('events|'+code,async()=>{
        const payload=await request('/api/v1.0/quote/option-event',{query:{option_market:'US_SECURITY',code,page_size:300}});
        if(!Array.isArray(payload.data.events)||payload.data.events.length>300)throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo event list has an unexpected schema.');
        const events=payload.data.events.map(row=>{
          const contract=typeof row?.option==='string'?row.option.match(/^US\.([A-Z][A-Z0-9.]{0,9})(\d{6})[CP]\d{1,10}$/):null;
          if(!object(row)||!matchesSymbol(row.owner||row.symbol,code)||!contract||!(contract[1]===code.slice(3)||contract[1].replace(/\d+$/,'')===code.slice(3)))throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo event list returned an unexpected contract.');
          const result={option:row.option,owner:code,symbol:code.slice(3),ticker_type:['BUY','SELL','NEUTRAL','1','2','3'].includes(String(row.ticker_type).toUpperCase())?String(row.ticker_type).toUpperCase():'UNKNOWN',option_type:['CALL','PUT','1','2'].includes(String(row.option_type).toUpperCase())?String(row.option_type).toUpperCase():null};
          for(const key of ['fill_timestamp','strike_timestamp','volume','total_volume','total_open_interest'])result[key]=number(row[key],{integer:true});
          for(const key of ['price','turnover','strike_price','underlying_price','bid_price','ask_price','iv','vo_ratio'])result[key]=number(row[key]);
          for(const key of ['delta','gamma','vega','theta','rho','otm'])result[key]=number(row[key],{signed:true});
          result.dte=number(row.dte,{integer:true,signed:true});return result;
        });
        // This adapter intentionally reads one bounded page. Do not expose opaque vendor cursors.
        const pagination=object(payload.pagination)?{completed:payload.pagination.completed===true,total:number(payload.pagination.total,{integer:true}),hasMore:payload.pagination.completed!==true}:{completed:false,total:null,hasMore:true};
        return observation('option_events',{events,update_timestamp:number(payload.data.update_timestamp,{integer:true})},{symbol:code,pagination,coverage:'First page, at most 300 vendor-selected unusual trades for this underlying; not all exchange trades. Opening/closing intent is unavailable.',timestampUnit:'microseconds',openCloseClassification:'unavailable'});
      });
    },
  });
}
