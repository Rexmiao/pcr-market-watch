// Local-only market-data adapter. No account, position, order or trade commands.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

const ALLOWED_COMMANDS = new Set(['subscribe','get-basic-qot','get-kline','get-option-expiration-date','get-option-chain','get-security-snapshot','get-ticker']);
const MAX_SYMBOLS = 20;

class MoomooError extends Error {
  constructor(code, message, status = 502) {super(message); this.name = 'MoomooError'; this.code = code; this.status = status;}
}

function hostAddress(value) {
  let url;
  const supplied = value || 'http://127.0.0.1:22222';
  try { url = new URL(supplied.includes('://') ? supplied : 'http://' + supplied); } catch {throw new MoomooError('INVALID_HOST','The moomoo host URL is invalid.',400);}
  if (!['http:','https:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) {
    throw new MoomooError('INVALID_HOST','The moomoo adapter accepts a loopback host only.',400);
  }
  if (!url.port) url.port = '22222';
  if (Number(url.port) < 1024 || Number(url.port) > 65535) throw new MoomooError('INVALID_HOST','The moomoo port is invalid.',400);
  return url.origin;
}

function symbolList(input, {one = false, underlying = false, max = MAX_SYMBOLS} = {}) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  const result = [];
  for (const item of values) {
    if (typeof item !== 'string') throw new MoomooError('INVALID_SYMBOL','Choose valid U.S. symbols.',400);
    let symbol = item.trim().toUpperCase();
    if (/^(HK|SH|SZ|SG|JP|AU|CA)\./.test(symbol)) throw new MoomooError('INVALID_SYMBOL','This adapter is limited to U.S. securities.',400);
    if (symbol.startsWith('US.')) symbol = symbol.slice(3);
    const pattern = underlying ? /^[A-Z][A-Z0-9.]{0,9}$/ : /^[A-Z][A-Z0-9.]{0,31}$/;
    if (!pattern.test(symbol)) throw new MoomooError('INVALID_SYMBOL','Choose valid U.S. symbols.',400);
    const code = 'US.' + symbol;
    if (!result.includes(code)) result.push(code);
  }
  if (!result.length || result.length > max || (one && result.length !== 1)) throw new MoomooError('INVALID_SYMBOL',`Choose between 1 and ${max} symbols; this query requires one symbol when specified.`,400);
  return result;
}

function activityDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MoomooError('INVALID_DATE','Choose valid expiration dates.',400);
  const stamp = Date.parse(value+'T12:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== value) throw new MoomooError('INVALID_DATE','Choose valid expiration dates.',400);
  return value;
}

function expirationRange(begin, end) {
  begin = activityDate(begin); end = activityDate(end);
  const [year, month, day] = begin.split('-').map(Number);
  const nextFirst = new Date(Date.UTC(year,month,1,12));
  const nextLast = new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
  nextFirst.setUTCDate(Math.min(day,nextLast));
  if (end < begin || end > nextFirst.toISOString().slice(0,10)) throw new MoomooError('INVALID_RANGE','An option-chain request can cover at most one calendar month.',400);
  return {begin,end};
}

function defaultExecutable() {
  return join(process.env.APPDATA || (process.env.USERPROFILE ? join(process.env.USERPROFILE,'AppData','Roaming') : ''),'moomoo','2.0','OpenAPI','moomooapp-cli.exe');
}

function spawnRunner({executablePath, args, environment, timeoutMs}) {
  return new Promise((accept,reject) => {
    const child = spawn(executablePath,args,{env:environment,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    const stdout=[],stderr=[];
    let bytes=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept(value);};
    const timer=setTimeout(()=>{child.kill();finish(new MoomooError('TIMEOUT','The local moomoo market-data request timed out.',504));},timeoutMs);
    child.on('error',()=>finish(new MoomooError('CLI_UNAVAILABLE','The local moomoo market-data client could not be started.',503)));
    const collect=(target,chunk)=>{bytes+=chunk.length;if(bytes>8_000_000){child.kill();finish(new MoomooError('RESPONSE_TOO_LARGE','The moomoo response exceeds the local adapter limit.'));}else target.push(chunk);};
    child.stdout.on('data',chunk=>collect(stdout,chunk));
    child.stderr.on('data',chunk=>collect(stderr,chunk));
    child.on('close',code=>finish(null,{code,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')}));
  });
}

export function createMoomooClient({appKey = process.env.OPENAPI_HOST_APPKEY || '',hostUrl = process.env.OPENAPI_HOST_URL,executablePath = defaultExecutable(),runner = spawnRunner,timeoutMs = 20000} = {}) {
  const host = hostAddress(hostUrl);
  const key = typeof appKey === 'string' ? appKey.trim() : '';
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new MoomooError('INVALID_TIMEOUT','Invalid moomoo timeout.',400);
  const subscriptions = new Map(), quoteCache = new Map(), active = new Map();
  let lastSuccessAt = null, lastErrorCode = null;
  const redact = value => key ? String(value).replaceAll(key,'[redacted]') : String(value);
  function rejected(message) {
    const safe = redact(message || 'Market-data query rejected by moomoo.').slice(0,240);
    if (/app.?key|鉴权|认证|authentication|unauthorized/i.test(safe)) return new MoomooError('AUTH_FAILED',safe,401);
    if (/请先订阅|未订阅|not subscribed|subscribe first/i.test(safe)) return new MoomooError('NOT_SUBSCRIBED',safe,409);
    if (/权限|permission|entitlement|not authorized|无权/i.test(safe)) return new MoomooError('NO_PERMISSION',safe,403);
    if (/频率|额度|quota|too many|rate.?limit/i.test(safe)) return new MoomooError('RATE_LIMITED',safe,429);
    if (/cannot reach|connect host|connection refused|unreachable|无法连接|连接失败/i.test(safe)) return new MoomooError('PROVIDER_UNAVAILABLE','The local moomoo market-data service is unavailable.',503);
    if (/unrecognized subcommand|unknown command|unsupported command/i.test(safe)) return new MoomooError('UNSUPPORTED_CLIENT','This desktop moomoo client does not support the requested market-data command.',503);
    return new MoomooError('PROVIDER_REJECTED',safe);
  }
  async function execute(command, flags = [], symbols = []) {
    if (!ALLOWED_COMMANDS.has(command)) throw new MoomooError('COMMAND_BLOCKED','This market-data command is not permitted.',403);
    if (!key) throw new MoomooError('NOT_CONFIGURED','The local moomoo AppKey is not configured.',503);
    try {
      const result = await runner({executablePath,args:['--raw',command,...flags,...symbols],environment:{...process.env,OPENAPI_HOST_URL:host,OPENAPI_HOST_APPKEY:key},timeoutMs});
      let envelope;
      try {envelope=JSON.parse(String(result.stdout || '').replace(/^\uFEFF/,''));}
      catch {
        let cliError;
        try {cliError=JSON.parse(String(result.stderr || '').replace(/^\uFEFF/,''));} catch { /* Never expose raw CLI stderr. */ }
        if (typeof cliError?.error === 'string') throw rejected(cliError.error);
        if (result.code !== 0) throw new MoomooError('CLI_REJECTED','The local moomoo client rejected the market-data request.');
        throw new MoomooError('INVALID_RESPONSE','The moomoo host returned no valid JSON market-data response.');
      }
      if (result.code !== 0 || envelope.ret_type !== 0 || !envelope.s2c || typeof envelope.s2c !== 'object' || Array.isArray(envelope.s2c)) {
        throw rejected(typeof envelope.ret_msg==='string'?envelope.ret_msg:'Market-data query rejected by moomoo.');
      }
      lastSuccessAt=new Date().toISOString();lastErrorCode=null;
      return envelope.s2c;
    } catch(error) {
      const safe=error instanceof MoomooError?error:new MoomooError('PROVIDER_UNAVAILABLE','The local moomoo market-data service is unavailable.');
      safe.message=redact(safe.message);lastErrorCode=safe.code;throw safe;
    }
  }
  async function subscribe(symbols,type) {
    const now=Date.now(),missing=symbols.filter(symbol=>now-(subscriptions.get(type+'|'+symbol)||0)>60000);
    if (!missing.length) return;
    await execute('subscribe',['--sub-type-list',type===1?'basic':type===4?'ticker':'kl_day','--is-sub-or-un-sub','--no-is-reg-or-un-reg-push','--extended-time','--session','all'],missing);
    for(const symbol of missing)subscriptions.set(type+'|'+symbol,Date.now());
    if(subscriptions.size>200)subscriptions.delete(subscriptions.keys().next().value);
  }
  async function coalesce(cacheKey,load) {
    if(active.has(cacheKey))return active.get(cacheKey);
    const pending=load();active.set(cacheKey,pending);
    try{return await pending;}finally{active.delete(cacheKey);}
  }
  function observation(kind,data,extra={}) {
    return {provider:'moomoo',kind,checkedAt:new Date().toISOString(),hostScope:'local',data,...extra};
  }
  return Object.freeze({
    status() {return {provider:'moomoo',configured:Boolean(key),cliAvailable:existsSync(executablePath),host,lastSuccessAt,lastErrorCode,connectionStatus:lastSuccessAt&&!lastErrorCode?'connected':lastErrorCode?'error':'not_checked',readOnly:true,capabilities:['quotes','daily_kline','option_expirations','option_chain','security_snapshots','option_trades'],scope:'Local market data only; no account, position, order or trade access.'};},
    async quotes(input) {
      const symbols=symbolList(input),cacheKey='quotes|'+symbols.join(',');
      const previous=quoteCache.get(cacheKey);
      if(previous&&Date.now()-previous.at<5000)return {...previous.value,cached:true};
      return await coalesce(cacheKey,async()=>{
        await subscribe(symbols,1);
        const data=await execute('get-basic-qot',[],symbols);
        if(!Array.isArray(data.basic_qot_list))throw new MoomooError('INVALID_RESPONSE','The moomoo quote list is unavailable.');
        const value=observation('quotes',{basic_qot_list:data.basic_qot_list},{symbols,marketTimestamps:'Provider update_time/update_timestamp describe market time; checkedAt describes retrieval.',entitlementVerified:false});
        quoteCache.set(cacheKey,{at:Date.now(),value});if(quoteCache.size>50)quoteCache.delete(quoteCache.keys().next().value);
        return value;
      });
    },
    async dailyKline(input,{count=252,rehabType=1}={}) {
      const symbols=symbolList(input,{one:true,underlying:true});
      if(!Number.isInteger(count)||count<1||count>1000||![0,1,2].includes(rehabType))throw new MoomooError('INVALID_QUERY','Choose 1–1000 daily bars and a valid adjustment type.',400);
      return await coalesce('kline|'+symbols[0]+'|'+count+'|'+rehabType,async()=>{
        await subscribe(symbols,6);
        const data=await execute('get-kline',['--rehab-type',String(rehabType),'--kl-type','2','--req-num',String(count),'--security',symbols[0]]);
        if(!Array.isArray(data.kl_list))throw new MoomooError('INVALID_RESPONSE','The moomoo daily-bar list is unavailable.');
        return observation('daily_kline',data,{symbol:symbols[0],rehabType,requestedBars:count});
      });
    },
    async optionExpirations(input) {
      const [symbol]=symbolList(input,{one:true,underlying:true});
      return await coalesce('expirations|'+symbol,async()=>{
        const data=await execute('get-option-expiration-date',['--owner',symbol]);
        if(!Array.isArray(data.date_list))throw new MoomooError('INVALID_RESPONSE','The moomoo option-expiration list is unavailable.');
        return observation('option_expirations',data,{symbol});
      });
    },
    async optionChain(input,{begin,end}={}) {
      const [symbol]=symbolList(input,{one:true,underlying:true}),range=expirationRange(begin,end);
      return await coalesce('chain|'+symbol+'|'+begin+'|'+end,async()=>{
        const data=await execute('get-option-chain',['--begin-time',range.begin,'--end-time',range.end,'--owner',symbol]);
        if(!Array.isArray(data.option_chain))throw new MoomooError('INVALID_RESPONSE','The moomoo option-chain list is unavailable.');
        return observation('option_chain',data,{symbol,expirationStart:begin,expirationEnd:end,coverage:'Selected expiration range only; not an all-expiration PCR or OI aggregate.'});
      });
    },
    async securitySnapshots(input) {
      const symbols=symbolList(input,{max:100}),cacheKey='snapshots|'+symbols.join(',');
      const previous=quoteCache.get(cacheKey);
      if(previous&&Date.now()-previous.at<15000)return {...previous.value,cached:true};
      return await coalesce(cacheKey,async()=>{
        // Full snapshots do not require a Basic subscription or consume ticker subscriptions.
        const data=await execute('get-security-snapshot',[],symbols);
        if(!Array.isArray(data.snapshot_list))throw new MoomooError('INVALID_RESPONSE','The moomoo security snapshot list is unavailable.');
        const value=observation('security_snapshots',data,{symbols,entitlementVerified:false,
          coverage:'Requested securities only; snapshot volume/OI is not a complete underlying or market aggregate.',
          marketTimestamps:'Each basic.update_time is the provider snapshot time. OI settlement dates may be undisclosed and must remain unknown.'});
        quoteCache.set(cacheKey,{at:Date.now(),value});if(quoteCache.size>50)quoteCache.delete(quoteCache.keys().next().value);
        return value;
      });
    },
    async optionSnapshots(input) {
      const symbols=symbolList(input,{max:40});
      if(symbols.some(symbol=>!/^US\.[A-Z][A-Z0-9.]{0,9}\d{6}[CP]\d{1,10}$/.test(symbol)))throw new MoomooError('INVALID_SYMBOL','Choose U.S. option contract codes.',400);
      const rows=[];
      // Basic option quotes supply option_ex_data as well as volume. The full
      // snapshot operation is independent and may not be available in a Host.
      for(let offset=0;offset<symbols.length;offset+=20) {
        const result=await this.quotes(symbols.slice(offset,offset+20));
        for(const quote of result.data.basic_qot_list)rows.push({basic:quote,option_ex_data:quote.option_ex_data||{}});
      }
      return observation('option_contract_observations',{snapshot_list:rows},{symbols,sourceCommand:'get-basic-qot',entitlementVerified:false,
        coverage:'Up to 40 requested option contracts, in batches of 20 basic quotes; not a complete underlying or market aggregate.'});
    },
    async optionTrades(input,{count=100}={}) {
      const [symbol]=symbolList(input,{one:true});
      if(!/^[A-Z][A-Z0-9.]{0,9}\d{6}[CP]\d{1,10}$/.test(symbol.slice(3)))throw new MoomooError('INVALID_SYMBOL','Choose one U.S. option contract code.',400);
      if(!Number.isInteger(count)||count<1||count>200)throw new MoomooError('INVALID_QUERY','Choose between 1 and 200 recent option trades.',400);
      const cacheKey='option-trades|'+symbol+'|'+count,previous=quoteCache.get(cacheKey);
      if(previous&&Date.now()-previous.at<5000)return {...previous.value,cached:true};
      return await coalesce(cacheKey,async()=>{
        await subscribe([symbol],4);
        const data=await execute('get-ticker',['--security',symbol,'--max-ret-num',String(count)]);
        if(!Array.isArray(data.ticker_list))throw new MoomooError('INVALID_RESPONSE','The moomoo option trade list is unavailable.');
        const value=observation('option_trades',data,{symbol,requestedTrades:count,entitlementVerified:false,
          coverage:'Recent trades for this contract only; no pagination, open/close classification, or whole-market block-trade feed.',
          marketTimestamps:'Ticker time/timestamp describe trade time; recv_time and checkedAt do not prove real-time entitlement.',
          directionMeaning:'Provider dir is a trade-direction classification, not a verified opening/closing action or investor position.'});
        quoteCache.set(cacheKey,{at:Date.now(),value});if(quoteCache.size>50)quoteCache.delete(quoteCache.keys().next().value);
        return value;
      });
    },
  });
}

// Storage is supplied by the caller; no secret path or storage format is coupled here.
export async function createMoomooClientFromStore({readCredentials,...options} = {}) {
  const stored = typeof readCredentials === 'function' ? await readCredentials() : null;
  const saved = typeof stored === 'string' ? {appKey:stored} : stored || {};
  return createMoomooClient({...saved,...options});
}

export function createMoomooLocalHandler(client = createMoomooClient()) {
  return async request => {
    const url=new URL(request.url),prefix='/api/providers/moomoo/';
    if(!url.pathname.startsWith(prefix))return null;
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Only same-origin requests are accepted.'},403);
    if(request.method!=='GET')return json({error:'Only read-only GET requests are accepted.'},405);
    try {
      const method=url.pathname.slice(prefix.length),symbol=url.searchParams.get('symbol');
      if(method==='status')return json(client.status());
      if(method==='quotes')return json(await client.quotes(url.searchParams.get('symbols')||symbol));
      if(method==='kline')return json(await client.dailyKline(symbol,{count:Number(url.searchParams.get('count')||252),rehabType:Number(url.searchParams.get('rehabType')||1)}));
      if(method==='expirations')return json(await client.optionExpirations(symbol));
      if(method==='option-chain')return json(await client.optionChain(symbol,{begin:url.searchParams.get('begin'),end:url.searchParams.get('end')}));
      if(method==='security-snapshots')return json(await client.securitySnapshots(url.searchParams.get('symbols')||symbol));
      if(method==='option-trades')return json(await client.optionTrades(symbol,{count:Number(url.searchParams.get('count')||100)}));
      return json({error:'Market-data endpoint not found.'},404);
    } catch(error) {return json({provider:'moomoo',error:error instanceof MoomooError?error.message:'The local market-data request failed.',code:error instanceof MoomooError?error.code:'PROVIDER_UNAVAILABLE'},error instanceof MoomooError?error.status:502);}
  };
}

export const moomooTesting={symbolList,expirationRange,hostAddress};
