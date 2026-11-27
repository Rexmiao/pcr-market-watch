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
function stockCodes(values){
  if(!Array.isArray(values)||!values.length||values.length>20)throw new MoomooWebApiError('INVALID_SYMBOL','Choose 1–20 unique U.S. stock or ETF codes.',400);
  const codes=values.map(value=>{
    if(typeof value!=='string'||!(/^(?:US\.)?[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/).test(value))throw new MoomooWebApiError('INVALID_SYMBOL','Choose 1–20 unique U.S. stock or ETF codes.',400);
    const bare=value.replace(/^US\./,'');
    if(bare.length>10||/^(US|HK|SH|SZ|BJ|SG|JP|AU|CA|KR)\./.test(bare))throw new MoomooWebApiError('INVALID_SYMBOL','Choose U.S. stock or ETF codes only.',400);
    return 'US.'+bare;
  });
  if(new Set(codes).size!==codes.length)throw new MoomooWebApiError('INVALID_SYMBOL','Choose unique U.S. stock or ETF codes.',400);
  return codes.sort();
}
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
function structureDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(new Date(value+'T12:00:00Z').valueOf())&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function structureExpiries(value,{allowAll=false}={}){
  if(value===null&&allowAll)return null;
  if(!Array.isArray(value)||!value.length||value.some(v=>!structureDate(v))||new Set(value).size!==value.length)throw new MoomooWebApiError('INVALID_EXPIRY','Choose valid unique expiration dates.',400);
  const sorted=[...value].sort();if(sorted.join(',').length>256)throw new MoomooWebApiError('PROVIDER_FILTER_LIMIT','The selected expiration filter exceeds the provider limit.',400);return sorted;
}
function structureNumber(value,{positive=false,signed=false}={}){const result=number(value,{positive,signed});return result!==null&&Math.abs(result)<=1e20?result:null;}
function boundedRows(value,max=5000){if(value===undefined)return [];if(!Array.isArray(value)||value.length>max)throw new MoomooWebApiError('INVALID_RESPONSE','The options structure response has an unexpected shape.');return value;}
function strikeRows(value,fields){const seen=new Set();return boundedRows(value).map(row=>{const strike=structureNumber(row?.strike_price,{positive:true});if(!object(row)||strike===null||seen.has(strike))throw new MoomooWebApiError('INVALID_RESPONSE','The options structure response has invalid or duplicate strikes.');seen.add(strike);const result={strike_price:strike};for(const key of fields)result[key]=structureNumber(row[key],{signed:key.endsWith('_gex')});return result;}).sort((a,b)=>a.strike_price-b.strike_price);}
function profileRows(value){const seen=new Set();return boundedRows(value).map(row=>{const spot=structureNumber(row?.spot_price,{positive:true});if(!object(row)||spot===null||seen.has(spot))throw new MoomooWebApiError('INVALID_RESPONSE','The GEX profile has invalid or duplicate prices.');seen.add(spot);return {spot_price:spot,aggregate_gex:structureNumber(row.aggregate_gex,{signed:true})};}).sort((a,b)=>a.spot_price-b.spot_price);}
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
    if(!['/api/v1.0/quote/option-underlying-overview','/api/v1.0/quote/option-event','/api/v1.0/quote/stock-quote'].includes(path)&&!/^\/api\/v1\.0\/quote\/US\.[A-Z][A-Z0-9.]{0,9}\/(?:option-expiration|option-gamma-exposure|option-max-pain)$/.test(path))throw new MoomooWebApiError('COMMAND_BLOCKED','This WebAPI operation is not permitted.',403);
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
          if(payload?.ret_code===-9)throw new MoomooWebApiError('NO_PERMISSION','The market-data entitlement does not permit this query.',403);
          if(payload?.ret_code===-11)throw new MoomooWebApiError('RATE_LIMITED','The market-data rate limit was reached.',429);
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
    status(){return {provider:'moomoo_webapi',configured:configured(),connectionStatus:!configured()?'not_configured':lastErrorCode?'error':lastSuccessAt?'connected':'not_checked',lastSuccessAt,lastErrorCode,readOnly:true,capabilities:['option_overview','option_events','stock_quotes','option_expirations','gamma_exposure','max_pain'],scope:'quote:read only; no account, position, order, or trade access.'};},
    async expirations(input){
      const code=symbolCode(input);return perform('expirations|'+code,async()=>{
        const payload=await request('/api/v1.0/quote/'+code+'/option-expiration',{query:{filter_standard:'ALL'}});
        if(!Array.isArray(payload.data.expiration_list)||payload.data.expiration_list.length>512||payload.pagination?.completed===false)throw new MoomooWebApiError('INVALID_RESPONSE','The expiration list is incomplete or invalid.');
        const seen=new Set(),expiration_list=payload.data.expiration_list.map(row=>{if(!object(row)||!structureDate(row.strike_time)||seen.has(row.strike_time))throw new MoomooWebApiError('INVALID_RESPONSE','The expiration list contains invalid or duplicate dates.');seen.add(row.strike_time);return {strike_time:row.strike_time,option_expiry_date_distance:number(row.option_expiry_date_distance,{integer:true,signed:true})};}).sort((a,b)=>a.strike_time.localeCompare(b.strike_time));
        return observation('option_expirations',{expiration_list},{symbol:code,coverage:'Provider-returned expiration dates; exchange coverage is not independently verified.'});
      });
    },
    async gammaExposure(input,{expiries=null}={}){
      const code=symbolCode(input),dates=structureExpiries(expiries,{allowAll:true});return perform('gamma|'+code+'|'+(dates?.join(',')||'all'),async()=>{
        const payload=await request('/api/v1.0/quote/'+code+'/option-gamma-exposure',{query:{filter_standard:'ALL',point_count:301,...(dates?{expire_time:dates.join(',')}:{})}}),raw=payload.data;
        const roots=boundedRows(raw.zero_gamma_points,64).map(value=>structureNumber(value,{positive:true}));if(roots.some(value=>value===null))throw new MoomooWebApiError('INVALID_RESPONSE','The GEX zero points are invalid.');
        const data={call_wall_strike:structureNumber(raw.call_wall_strike,{positive:true}),put_wall_strike:structureNumber(raw.put_wall_strike,{positive:true}),underlying_price:structureNumber(raw.underlying_price,{positive:true}),update_time:number(raw.update_time,{integer:true,positive:true}),zero_gamma_points:[...new Set(roots)].sort((a,b)=>a-b),zero_gamma_disclosed:Array.isArray(raw.zero_gamma_points),items:strikeRows(raw.items,['call_gex','put_gex','net_gex']),profile_points:profileRows(raw.profile_points),interpolated_points:profileRows(raw.interpolated_points)};
        return observation('gamma_exposure',data,{symbol:code,requestedExpiries:dates,units:'provider_gex_unspecified',positioning:'provider_model_assumptions',oiSettlementDate:null,coverage:'Provider model for selected expirations; dealer inventory direction and GEX normalization are not independently disclosed.'});
      });
    },
    async maxPain(input,{expiry}={}){
      const code=symbolCode(input),dates=structureExpiries([expiry]);return perform('max_pain|'+code+'|'+expiry,async()=>{
        const payload=await request('/api/v1.0/quote/'+code+'/option-max-pain',{query:{expire_time:dates[0],filter_standard:'ALL',only_max_pain:false}}),raw=payload.data;
        if(!Array.isArray(raw.chains)||raw.chains.length>1)throw new MoomooWebApiError('INVALID_RESPONSE','The Max Pain response has an unexpected expiration list.');
        const chains=raw.chains.map(row=>{if(!object(row)||row.strike_date!==expiry)throw new MoomooWebApiError('INVALID_RESPONSE','The Max Pain response returned a different expiration.');return {strike_date:expiry,left_day:number(row.left_day,{integer:true,signed:true}),max_pain_strike:structureNumber(row.max_pain_strike,{positive:true}),items:strikeRows(row.items,['call_pain','put_pain','total_pain'])};});
        return observation('max_pain',{update_time:number(raw.update_time,{integer:true,positive:true}),chains},{symbol:code,requestedExpiry:expiry,units:'provider_pain_unspecified',oiSettlementDate:null,coverage:'Provider OI-based expiration payout model; not a price target or a guaranteed expiry settlement.'});
      });
    },
    async stockQuotes(input){
      const codes=stockCodes(input);
      return perform('stock_quotes|'+codes.join(','),async()=>{
        const payload=await request('/api/v1.0/quote/stock-quote',{method:'POST',body:{code_list:codes}});
        if(!Array.isArray(payload.data.quote_list)||payload.data.quote_list.length>codes.length)throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo stock quote list has an unexpected schema.');
        const seen=new Set(),quote_list=payload.data.quote_list.map(row=>{
          if(!object(row)||typeof row.code!=='string'||!codes.includes(row.code)||seen.has(row.code))throw new MoomooWebApiError('INVALID_RESPONSE','The moomoo stock quote list returned an unexpected symbol.');
          seen.add(row.code);
          const result={code:row.code,data_time:number(row.data_time,{integer:true,positive:true}),data_date:typeof row.data_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.data_date)?row.data_date:null};
          for(const key of ['last_price','open_price','high_price','low_price','prev_close_price'])result[key]=number(row[key],{positive:true});
          result.volume=number(row.volume,{integer:true});result.turnover=number(row.turnover);
          // The documented session objects have no independent timestamp. Do not
          // copy the regular data_time, retrieval time, or unrecognized fields.
          for(const key of ['pre_market','after_market','overnight'])result[key]={price:number(row[key]?.price,{positive:true})};
          return result;
        });
        return observation('stock_quotes',{quote_list},{symbols:codes,timestampUnit:'milliseconds',sessionTimestampAvailability:'undisclosed',coverage:'Requested U.S. stocks and ETFs only. Missing symbols remain missing; session prices have no independently documented timestamp.'});
      });
    },
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
