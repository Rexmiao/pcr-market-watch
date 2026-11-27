// Anonymous access is limited to published PCR aggregates. Owner settings are
// projected to ticker codes and generic groups; private records never proxy.
import {DEFAULT_SYMBOLS,DEFAULT_GROUPS,defaultCategory} from '../web/watchlist-model.js';
import {DEFAULT_MARKET_ITEMS,MARKET_CBOE_KEYS} from '../web/market-pcr-settings.js';
const SYMBOL=/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/;
const COOLDOWN=60000;
const PUBLIC_CORE=new Set(DEFAULT_SYMBOLS);
const PRIVATE_KEYS=new Set(['accesstoken','refreshtoken','access_token','refresh_token','appkey','app_key','api_key','apikey','password','secret','secretkey','secret_key','token','authorization','cookie','clientid','client_id','client_secret','registration_access_token','account','accounts','accountid','account_id','accid','position','positions','ownerid','owner_id','groups_json','databasepath','rootdirectory','configpath','credential','credentials']);
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;}
function ticker(value){return typeof value==='string'&&value.length<=10&&SYMBOL.test(value)&&! /^(US|HK|SH|SZ|SG|JP|AU|CA)\./.test(value);}
function quantitiesOnly(value,depth=0){
  if(depth>24)throw Error('INVALID_PUBLIC_RESPONSE');
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(item=>quantitiesOnly(item,depth+1));
  return Object.fromEntries(Object.entries(value).filter(([key])=>!PRIVATE_KEYS.has(key.toLowerCase())).map(([key,item])=>[key,quantitiesOnly(item,depth+1)]));
}
function publicCore(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  if(!value.instruments||typeof value.instruments!=='object'||Array.isArray(value.instruments))return value;
  return {...value,instruments:Object.fromEntries(Object.entries(value.instruments).filter(([symbol])=>PUBLIC_CORE.has(symbol)))};
}
function projectCoreResponse(value,path){
  if(!['/api/watchlist','/api/refresh'].includes(path)||!value||typeof value!=='object'||Array.isArray(value))return value;
  const result=publicCore(value);
  return Object.hasOwn(result,'data')?{...result,data:publicCore(result.data)}:result;
}
function query(url,allowed){const seen=new Set();for(const [key]of url.searchParams){if(!allowed.includes(key)||seen.has(key))throw Error('INVALID_QUERY');seen.add(key);}}
function codeItems(value){if(!Array.isArray(value)||value.length>40)throw Error('INVALID_SETTINGS');const seen=new Set();return value.map(item=>{if(!ticker(item?.symbol)||seen.has(item.symbol))throw Error('INVALID_SETTINGS');seen.add(item.symbol);return {symbol:item.symbol,category:defaultCategory(item.symbol)};});}
function marketItems(value){if(!Array.isArray(value)||value.length>40)throw Error('INVALID_SETTINGS');const seen=new Set();return value.map(item=>{let safe;if(item?.type==='cboe'&&MARKET_CBOE_KEYS.includes(item.key))safe={type:'cboe',key:item.key};else if(item?.type==='symbol'&&ticker(item.symbol))safe={type:'symbol',symbol:item.symbol};else throw Error('INVALID_SETTINGS');const id=safe.type+':'+(safe.key||safe.symbol);if(seen.has(id))throw Error('INVALID_SETTINGS');seen.add(id);return safe;});}
function settingsRevision(row){return Number.isSafeInteger(row?.revision)&&row.revision>0?row.revision:0;}
export function publicStaticPath(path){
  return ['/','/index.html','/charts.html','/option-structure.html'].includes(path)||/^\/[a-z0-9-]+\.(?:js|css)$/.test(path)||/^\/archive\/[a-z0-9-]+\.(?:html|json)$/.test(path);
}
export function createPublicAccessHandler({database,proxy,now=()=>Date.now()}={}){
  const refreshes=new Map();let settingsPending=null;
  async function settings(){
    if(settingsPending)return settingsPending;
    settingsPending=(async()=>{
      if(!database?.prepare)throw Error('SETTINGS_UNAVAILABLE');
      const [watch,market]=await Promise.all([
        database.prepare('SELECT items_json,revision FROM user_watchlists WHERE owner_id=?').bind('local_user').first(),
        database.prepare('SELECT items_json,revision FROM user_market_pcr WHERE owner_id=?').bind('local_user').first(),
      ]);
      const items=watch?codeItems(JSON.parse(watch.items_json)):DEFAULT_SYMBOLS.map(symbol=>({symbol,category:defaultCategory(symbol)}));
      const references=market?marketItems(JSON.parse(market.items_json)):DEFAULT_MARKET_ITEMS.map(item=>({...item}));
      const symbols=[...new Set([...items.map(item=>item.symbol),...references.filter(item=>item.type==='symbol').map(item=>item.symbol)])].sort();
      return {watch:{items,groups:DEFAULT_GROUPS.map(group=>({...group})),revision:settingsRevision(watch),updatedAt:null,storage:'cloud',initialized:true,readOnly:true,canRefresh:true},market:{items:references,revision:settingsRevision(market),updatedAt:null,storage:'cloud',initialized:true,readOnly:true,canRefresh:true},symbols};
    })();
    try{return await settingsPending;}finally{settingsPending=null;}
  }
  async function proxied(request){
    if(typeof proxy!=='function')return {status:503,body:{error:'PUBLIC_DATA_UNAVAILABLE'}};
    try{const response=await proxy(request);const text=await response.text();if(text.length>6*1024*1024)throw Error();const body=projectCoreResponse(quantitiesOnly(JSON.parse(text)),new URL(request.url).pathname);if(response.status>=400)return {status:response.status,body:{error:response.status===429?'SOURCE_COOLDOWN':'PUBLIC_DATA_UNAVAILABLE',...(Number.isFinite(body?.retryAfterSeconds)&&body.retryAfterSeconds>0?{retryAfterSeconds:body.retryAfterSeconds}:{}),...(body?.data&&typeof body.data==='object'?{data:body.data}:{})}};return {status:response.status,body};}
    catch{return {status:502,body:{error:'PUBLIC_DATA_UNAVAILABLE'}};}
  }
  function respond(result,extra={}){return json(result.body,result.status,extra);}
  async function refresh(operation,signature,execute){
    const previous=refreshes.get(operation);
    if(previous?.pending){if(previous.signature===signature)return {...await previous.pending,coalesced:true};return {status:429,body:{error:'PUBLIC_REFRESH_BUSY',retryAfterSeconds:2},retry:2};}
    const remaining=previous?COOLDOWN-(now()-previous.startedAt):0;
    if(remaining>0){const retry=Math.ceil(remaining/1000),safe=previous.signature===signature&&previous.result?.status>=200&&previous.result.status<300?previous.result.body:null;return {status:429,body:{...(safe||{}),error:'PUBLIC_REFRESH_COOLDOWN',retryAfterSeconds:retry,publicRefresh:{status:'cooldown',retryAfterSeconds:retry}},retry};}
    const state={startedAt:now(),signature,result:null,pending:null};refreshes.delete(operation);refreshes.set(operation,state);while(refreshes.size>100)refreshes.delete(refreshes.keys().next().value);
    state.pending=(async()=>{const result=await execute();state.result=result;return result;})();
    try{return await state.pending;}finally{state.pending=null;}
  }
  async function refreshOi(request,published){
    const results=[];
    for(let cursor=0;cursor<published.length;cursor+=40){const url=new URL(request.url);url.search='';url.searchParams.set('symbols',published.slice(cursor,cursor+40).join(','));results.push(await proxied(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})));}
    if(results.length===1)return results[0];
    const items=results.flatMap(result=>Array.isArray(result.body?.items)?result.body.items:[]),checked=items.map(item=>item.checkedAt).filter(value=>typeof value==='string').sort();
    return {status:items.length?200:502,body:{schemaVersion:1,provider:'moomoo_webapi',configured:results.some(result=>result.body?.configured===true),checkedAt:checked.at(-1)||null,oiAsOf:null,oiBasis:'previous_session',coverage:'provider_symbol_overview',status:items.every(item=>item.status==='current')?'current':items.length?'partial':'unavailable',items,errors:results.flatMap(result=>Array.isArray(result.body?.errors)?result.body.errors:[])}};
  }
  return async request=>{
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(publicStaticPath(path))return ['GET','HEAD'].includes(method)?await proxy(request):null;
    const settingsPath=['/api/watchlist-settings','/api/market-pcr-settings'].includes(path);
    const structurePath=['/api/gamma-exposure','/api/gamma-exposure/refresh','/api/max-pain','/api/max-pain/refresh'].includes(path);
    const archivePath=['/api/structure-archive','/api/structure-archive/index'].includes(path);
    const getPath=['/api/watchlist','/api/symbol','/api/oi-summaries','/api/oi-summaries/history','/api/cboe','/api/cboe/history','/api/market','/api/gamma-exposure','/api/max-pain','/api/structure-archive','/api/structure-archive/index','/api/structure-daily'].includes(path);
    const refreshPath=['/api/refresh','/api/oi-summaries/refresh','/api/cboe/refresh','/api/cboe/history/refresh','/api/market/refresh','/api/gamma-exposure/refresh','/api/max-pain/refresh'].includes(path);
    if(!(settingsPath&&method==='GET'||getPath&&method==='GET'||refreshPath&&method==='POST'))return null;
    let operation=null,scope=null,published=null,structureSignature=null;
    try{
      if(settingsPath){query(url,[]);const state=await settings();return json(path==='/api/watchlist-settings'?state.watch:state.market);}
      if(['/api/watchlist','/api/refresh','/api/market','/api/market/refresh'].includes(path))query(url,[]);
      if(path==='/api/structure-daily')query(url,[]);
      if(archivePath){
        query(url,path.endsWith('/index')?['symbol']:['symbol','date','id']);
        const symbol=url.searchParams.get('symbol');if(!ticker(symbol))throw Error('INVALID_QUERY');
        if(!path.endsWith('/index')){
          if(url.searchParams.has('date')===url.searchParams.has('id'))throw Error('INVALID_QUERY');
          if(url.searchParams.has('date')&&!validDate(url.searchParams.get('date'))||url.searchParams.has('id')&&!/^[a-f0-9]{64}$/.test(url.searchParams.get('id')))throw Error('INVALID_QUERY');
        }
        const symbols=new Set((await settings()).symbols);if(!symbols.has(symbol))return json({error:'SYMBOL_NOT_PUBLISHED'},403);
      }
      if(path==='/api/symbol'){
        query(url,['symbol','refresh']);const symbol=url.searchParams.get('symbol');if(!ticker(symbol)||url.searchParams.has('refresh')&&!['0','1'].includes(url.searchParams.get('refresh')))throw Error('INVALID_QUERY');
        published=(await settings()).symbols;if(!published.includes(symbol))return json({error:'SYMBOL_NOT_PUBLISHED'},403);
        if(url.searchParams.get('refresh')==='1')operation='symbol:'+symbol;
      }
      if(path.startsWith('/api/oi-summaries')){
        query(url,path.endsWith('/history')?['symbols','date']:['symbols']);const raw=url.searchParams.get('symbols');scope=raw?.split(',');
        if(!raw||raw.length>440||!scope.length||scope.length>40||scope.some(symbol=>!ticker(symbol))||new Set(scope).size!==scope.length||url.searchParams.has('date')&&!validDate(url.searchParams.get('date')))throw Error('INVALID_QUERY');
        published=(await settings()).symbols;if(scope.some(symbol=>!published.includes(symbol)))return json({error:'SYMBOL_NOT_PUBLISHED'},403);scope.sort();
      }
      if(path==='/api/cboe'||path==='/api/cboe/refresh'){query(url,['date']);if(url.searchParams.has('date')&&!validDate(url.searchParams.get('date')))throw Error('INVALID_QUERY');}
      if(path.startsWith('/api/cboe/history')){query(url,['end','range']);if(url.searchParams.has('end')&&!validDate(url.searchParams.get('end'))||url.searchParams.has('range')&&!['126','252','all'].includes(url.searchParams.get('range')))throw Error('INVALID_QUERY');}
      if(structurePath){
        const gamma=path.startsWith('/api/gamma-exposure'),allowed=gamma?['symbol','window']:['symbol','expiry'];let values;
        if(refreshPath){query(url,[]);if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('INVALID_QUERY');const text=await request.clone().text();if(text.length>2048)throw Error('INVALID_QUERY');try{values=JSON.parse(text);}catch{throw Error('INVALID_QUERY');}if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(key=>!allowed.includes(key)))throw Error('INVALID_QUERY');}
        else{query(url,allowed);values=Object.fromEntries(url.searchParams);}
        if(!ticker(values.symbol)||gamma&&values.window!==undefined&&!['nearest','7d','30d','all'].includes(values.window)||!gamma&&values.expiry!==undefined&&!validDate(values.expiry))throw Error('INVALID_QUERY');
        const symbols=new Set((await settings()).symbols);if(!symbols.has(values.symbol))return json({error:'SYMBOL_NOT_PUBLISHED'},403);
        if(refreshPath){operation=gamma?'gamma':'max_pain';structureSignature=values.symbol+'|'+(gamma?values.window||'30d':values.expiry||'nearest');}
      }
      if(refreshPath&&!structurePath){
        if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('INVALID_QUERY');const body=await request.clone().text();if(body.length>2048)throw Error('INVALID_QUERY');const value=JSON.parse(body);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length)throw Error('INVALID_QUERY');
        operation=({'/api/refresh':'core','/api/oi-summaries/refresh':'oi','/api/cboe/refresh':'cboe','/api/cboe/history/refresh':'cboe_history','/api/market/refresh':'macro'})[path];
      }
    }catch(error){return json({error:error.message==='INVALID_QUERY'?'INVALID_PUBLIC_QUERY':'PUBLIC_SETTINGS_UNAVAILABLE'},error.message==='INVALID_QUERY'?400:503);}
    if(!operation){
      // A normal Cboe GET may otherwise fetch an upstream cache miss. Public
      // date navigation only reads verified saved records; explicit POST owns
      // the sixty-second network refresh budget.
      if(path==='/api/cboe'){const headers=new Headers(request.headers);headers.set('x-pcr-cache-only','1');request=new Request(request,{headers});}
      return respond(await proxied(request));
    }
    const signature=structureSignature||(operation==='oi'?published.join(','):url.pathname+'?'+[...url.searchParams].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+'='+value).join('&'));
    let result=await refresh(operation,signature,()=>operation==='oi'?refreshOi(request,published):proxied(request));
    if(operation==='oi'&&Array.isArray(result.body?.items)){const selected=new Set(scope);const items=result.body.items.filter(item=>selected.has(item.symbol)),errors=(result.body.errors||[]).filter(error=>!error.symbol||selected.has(error.symbol));result={...result,body:{...result.body,items,errors}};}
    return respond(result,result.retry?{'retry-after':String(result.retry)}:{});
  };
}
