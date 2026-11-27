// View state only. GET reads saved observations; provider checks require a click.
export const STRUCTURE_WINDOWS=['nearest','7d','30d','all'];
export const validStructureSymbol=value=>typeof value==='string'&&/^[A-Z][A-Z0-9.]{0,9}$/.test(value);
export const validStructureDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;};
export function structureSymbols(watch,market){
  const values=[...(Array.isArray(watch?.items)?watch.items.map(item=>item?.symbol):[]),...(Array.isArray(market?.items)?market.items.filter(item=>item?.type==='symbol').map(item=>item.symbol):[])];
  return [...new Set(values.filter(validStructureSymbol))];
}
export function structureExpiries(...payloads){return [...new Set(payloads.flatMap(payload=>Array.isArray(payload?.availableExpiries)?payload.availableExpiries:[]).filter(validStructureDate))].sort();}
export function chartSegments(rows,xKey,yKey){
  const segments=[];let current=[];
  for(const row of Array.isArray(rows)?rows:[]){if(Number.isFinite(row?.[xKey])&&Number.isFinite(row?.[yKey]))current.push({x:row[xKey],y:row[yKey]});else if(current.length){segments.push(current);current=[];}}
  if(current.length)segments.push(current);return segments;
}
// Price domains change only the viewport. They neither alter provider points
// nor clamp to their extent: a disclosed wall may lie outside returned data.
export function gammaPriceDomain(snapshots,{mode='auto',includeZeros=true}={}){
  if(mode==='all')return undefined;
  const records=(Array.isArray(snapshots)?snapshots:[snapshots]).filter(Boolean),positive=value=>Number.isFinite(value)&&value>0;
  const spots=records.map(snapshot=>snapshot.underlyingPrice).filter(positive);
  if(mode==='near')return spots.length?[spots[0]*.85,spots[0]*1.15]:undefined;
  const levels=records.flatMap(snapshot=>[snapshot.underlyingPrice,snapshot.callWall,snapshot.putWall,...(includeZeros&&Array.isArray(snapshot.zeroGammaPoints)?snapshot.zeroGammaPoints:[])]).filter(positive);
  if(!levels.length)return undefined;
  let min=Math.min(...levels,...spots.map(spot=>spot*.85)),max=Math.max(...levels,...spots.map(spot=>spot*1.15));
  if(!spots.length){const center=(min+max)/2,span=Math.max(max-min,center*.3,1);min=center-span/2;max=center+span/2;}
  const padding=(max-min)*.05;
  return [Math.max(0,min-padding),max+padding];
}
// A narrow adjusted strike may sit close to one neighbor. Size each strike's
// group from its own visible numeric neighborhood instead of shrinking every
// bar to the single smallest gap in the chain. No points are merged or moved.
export function strikeBarWidths(values,{min,max,pixels,series=2,maxWidth=12}={}){
  const strikes=[...new Set(values.filter(Number.isFinite))].sort((a,b)=>a-b),widths=new Map();
  if(!(max>min)||!(pixels>0)||!(series>0))return widths;
  for(let i=0;i<strikes.length;i++){
    const left=i>0?strikes[i]-strikes[i-1]:Infinity,right=i+1<strikes.length?strikes[i+1]-strikes[i]:Infinity;
    const gap=Math.min(left,right),groupWidth=Number.isFinite(gap)?gap/(max-min)*pixels*.8:maxWidth*series;
    widths.set(strikes[i],Math.min(maxWidth,groupWidth/series));
  }
  return widths;
}
export function layoutMarkerLabels(markers,{left,right,rows=4}={}){
  const lanes=Array.from({length:rows},()=>-Infinity);
  return markers.map(marker=>({...marker})).sort((a,b)=>a.screenX-b.screenX).map(marker=>{
    if(!marker.text)return {...marker,labelRow:null};
    const width=Array.from(marker.text).reduce((sum,char)=>sum+(char.charCodeAt(0)>255?11:6.5),0)+8;
    const labelX=Math.max(left,Math.min(right-width,marker.screenX+4));
    const row=lanes.findIndex(end=>labelX>=end+8);
    if(row>=0)lanes[row]=labelX+width;
    return {...marker,labelX,labelWidth:width,labelRow:row>=0?row:null};
  });
}
export function archiveScopeMatches(record,scope){return !!record&&!!scope&&record.kind===scope.kind&&record.scopeKind===scope.scopeKind&&record.scopeKey===scope.scopeKey;}
export function archiveHeaders(value,{symbol,date}={}){
  return (Array.isArray(value)?value:[]).filter(record=>record&&typeof record.id==='string'&&record.id.length<=300&&record.symbol===symbol&&record.observationDate===date&&['gamma','max_pain'].includes(record.kind)&&(['30d','30d_ex_nearest'].includes(record.scopeKey)&&record.scopeKind==='window'||validStructureDate(record.scopeKey)&&record.scopeKind==='expiry')).sort((a,b)=>String(b.queriedAt||'').localeCompare(String(a.queriedAt||'')));
}
// History uses archived headers and immutable record IDs. A missing requested
// date/expiry stays empty; no current vendor query or nearby-date substitution.
const DEFAULT_LIMITS={records:32,recordBytes:8*1024*1024,days:16,dayBytes:2*1024*1024,dayTtlMs:15000};
function freezeJson(value){const stack=[value],seen=new WeakSet();while(stack.length){const item=stack.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);for(const child of Object.values(item))if(child&&typeof child==='object')stack.push(child);Object.freeze(item);}return value;}
function boundedCache({maxEntries,maxBytes,ttl=Infinity,now}){
  const values=new Map();let bytes=0;
  function remove(key){const old=values.get(key);if(old){bytes-=old.bytes;values.delete(key);}}
  return {
    get(key){const entry=values.get(key);if(!entry)return undefined;if(entry.expires<=now()){remove(key);return undefined;}values.delete(key);values.set(key,entry);return entry.value;},
    put(key,value){const size=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(size>maxBytes||maxEntries<1)return false;remove(key);while(values.size>=maxEntries||bytes+size>maxBytes)remove(values.keys().next().value);values.set(key,{value:freezeJson(value),bytes:size,expires:now()+ttl});bytes+=size;return true;},
    clear(){values.clear();bytes=0;},
    info(){return {entries:values.size,bytes,maxEntries,maxBytes,ttlMs:Number.isFinite(ttl)?ttl:null};}
  };
}

export function createStructureArchiveController({fetcher=globalThis.fetch,onChange=()=>{},now=()=>Date.now(),cacheLimits={}}={}){
  const limits={...DEFAULT_LIMITS,...cacheLimits},fresh=()=>({date:'',headers:[],runs:[],gammaId:'',painId:'',gamma:null,pain:null,busy:false,error:null,reset:false,truncated:false});
  const state={symbol:null,index:null,daily:null,busy:false,error:null,primary:fresh(),comparison:fresh()},requests=new Map(),inflight=new Map();let generation=0;
  const recordCache=boundedCache({maxEntries:limits.records,maxBytes:limits.recordBytes,now}),dayCache=boundedCache({maxEntries:limits.days,maxBytes:limits.dayBytes,ttl:limits.dayTtlMs,now}),emit=()=>onChange(state);
  function release(entry,token){if(!entry.consumers.delete(token))return;if(!entry.consumers.size&&!entry.settled){entry.abort.abort();if(inflight.get(entry.key)===entry)inflight.delete(entry.key);}}
  function stop(key){const token=requests.get(key);if(!token)return;requests.delete(key);token.abort.abort();if(token.entry)release(token.entry,token);}
  function invalidate({clearState=false,notify=true}={}){
    generation++;for(const key of [...requests.keys()])stop(key);for(const entry of inflight.values())entry.abort.abort();inflight.clear();recordCache.clear();dayCache.clear();
    state.busy=false;state.primary.busy=false;state.comparison.busy=false;
    if(clearState){state.index=null;state.daily=null;state.error=null;state.primary=fresh();state.comparison=fresh();}
    if(notify)emit();
  }
  async function read(key,path,{cache=null,scope='',validate=()=>true}={}){
    stop(key);const epoch=generation,token={abort:new AbortController(),entry:null,epoch};requests.set(key,token);
    const sharedKey=JSON.stringify([epoch,path,scope]),store=cache==='record'?recordCache:cache==='day'?dayCache:null;
    const check=value=>{if(validate(value)!==true)throw Error('ARCHIVE_INVALID_RESPONSE');return value;};
    try{
      const saved=store?.get(sharedKey);if(saved!==undefined)return check(saved);
      let entry=inflight.get(sharedKey);
      if(!entry){
        entry={key:sharedKey,abort:new AbortController(),consumers:new Set(),settled:false,promise:null};inflight.set(sharedKey,entry);
        entry.promise=(async()=>{try{const response=await fetcher(path,{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([entry.abort.signal,AbortSignal.timeout(30000)])});if(!response.ok)throw Error('ARCHIVE_READ_FAILED');const result=check(await response.json());if(generation!==epoch||entry.abort.signal.aborted)throw Error('ARCHIVE_CANCELLED');store?.put(sharedKey,result);return result;}finally{entry.settled=true;if(inflight.get(sharedKey)===entry)inflight.delete(sharedKey);}})();
      }
      token.entry=entry;entry.consumers.add(token);
      let onAbort;const cancelled=new Promise((_,reject)=>{onAbort=()=>{release(entry,token);reject(Error('ARCHIVE_CANCELLED'));};token.abort.signal.addEventListener('abort',onAbort,{once:true});});
      try{const result=await Promise.race([entry.promise,cancelled]);if(requests.get(key)!==token||generation!==epoch||token.abort.signal.aborted)throw Error('ARCHIVE_CANCELLED');return check(result);}finally{token.abort.signal.removeEventListener('abort',onAbort);release(entry,token);}
    }finally{if(requests.get(key)===token)requests.delete(key);}
  }
  function setSymbol(symbol){if(symbol===state.symbol)return;invalidate({clearState:true,notify:false});state.symbol=validStructureSymbol(symbol)?symbol:null;emit();}
  async function loadRecord(side,kind,id,{manual=false}={}){
    if(!['primary','comparison'].includes(side)||!['gamma','pain'].includes(kind))return false;
    const slot=state[side],field=kind==='gamma'?'gamma':'pain',idField=field+'Id',symbol=state.symbol,date=slot.date,epoch=generation;
    stop(side+':'+field);slot[idField]=id;slot[field]=null;slot.error=null;if(manual)slot.reset=false;emit();if(!id)return true;
    const header=slot.headers.find(record=>record.id===id&&record.kind===(field==='gamma'?'gamma':'max_pain'));if(!header){slot.error='ARCHIVE_RECORD_MISSING';emit();return false;}
    const scope=JSON.stringify([symbol,id,date,header.kind,header.scopeKind,header.scopeKey]);
    const validate=result=>{const record=result?.record;return !!record&&record.id===id&&record.symbol===symbol&&record.observationDate===date&&archiveScopeMatches(record,header)&&!!record.payload&&typeof record.payload==='object';};
    try{const result=await read(side+':'+field,'/api/structure-archive?'+new URLSearchParams({symbol,id}),{cache:'record',scope,validate});if(generation!==epoch||state.symbol!==symbol||state[side]!==slot||slot.date!==date||slot[idField]!==id)return false;slot[field]=result.record;emit();return true;}
    catch{if(generation===epoch&&state.symbol===symbol&&state[side]===slot&&slot.date===date&&slot[idField]===id){slot.error='ARCHIVE_READ_FAILED';emit();}return false;}
  }
  async function loadDay(side,date,{initial=false}={}){
    if(!['primary','comparison'].includes(side)||!state.symbol)return false;
    const old=state[side],reference=side==='comparison'&&!old.date?state.primary:old,preferredGamma=reference.headers.find(record=>record.id===reference.gammaId),preferredPain=reference.headers.find(record=>record.id===reference.painId),symbol=state.symbol,epoch=generation;
    stop(side);stop(side+':gamma');stop(side+':pain');const slot=fresh();state[side]=slot;slot.date=validStructureDate(date)?date:'';emit();if(!slot.date)return true;slot.busy=true;emit();
    try{const result=await read(side,'/api/structure-archive?'+new URLSearchParams({symbol,date:slot.date}),{cache:'day',scope:JSON.stringify([symbol,slot.date]),validate:value=>value?.symbol===symbol&&value?.observationDate===slot.date&&Array.isArray(value.records)});if(generation!==epoch||state.symbol!==symbol||state[side]!==slot)return false;
      slot.headers=archiveHeaders(result.records,{symbol,date:slot.date});slot.runs=Array.isArray(result.runs)?result.runs:[];slot.truncated=result.truncated===true;
      const gammaScope=preferredGamma||{kind:'gamma',scopeKind:'window',scopeKey:'30d'},gamma=slot.headers.find(record=>archiveScopeMatches(record,gammaScope));let pain=preferredPain?slot.headers.find(record=>archiveScopeMatches(record,preferredPain)):null;
      if(initial&&side==='primary'&&!preferredPain){const expiry=slot.headers.filter(record=>record.kind==='max_pain'&&record.scopeKind==='expiry').map(record=>record.scopeKey).sort()[0];pain=slot.headers.find(record=>record.kind==='max_pain'&&record.scopeKey===expiry);}
      slot.reset=!!(preferredGamma&&!gamma||preferredPain&&!pain);emit();await Promise.all([loadRecord(side,'gamma',gamma?.id||''),loadRecord(side,'pain',pain?.id||'')]);return true;
    }catch{if(generation===epoch&&state.symbol===symbol&&state[side]===slot){slot.error='ARCHIVE_READ_FAILED';emit();}return false;}finally{if(generation===epoch&&state.symbol===symbol&&state[side]===slot){slot.busy=false;emit();}}
  }
  async function loadIndex({clearCache=true}={}){
    const symbol=state.symbol;if(!symbol||state.busy)return false;if(clearCache)invalidate({notify:false});const epoch=generation;state.busy=true;state.error=null;emit();
    const values=await Promise.allSettled([read('index','/api/structure-archive/index?'+new URLSearchParams({symbol})),read('daily','/api/structure-daily')]);if(generation!==epoch||state.symbol!==symbol)return false;
    if(values[0].status==='fulfilled'&&values[0].value?.symbol===symbol&&Array.isArray(values[0].value.dates)){state.index={...values[0].value,dates:values[0].value.dates.filter(row=>validStructureDate(row?.date)).sort((a,b)=>b.date.localeCompare(a.date))};}else state.error='ARCHIVE_READ_FAILED';
    if(values[1].status==='fulfilled')state.daily=values[1].value;state.busy=false;emit();
    if(!state.primary.date&&state.index?.dates?.length)await loadDay('primary',state.index.dates[0].date,{initial:true});else if(state.primary.date)await loadDay('primary',state.primary.date);if(state.comparison.date)await loadDay('comparison',state.comparison.date);return !state.error;
  }
  async function loadDaily(){try{const value=await read('daily','/api/structure-daily');state.daily=value;emit();return value;}catch{return null;}}
  return {state,setSymbol,loadIndex,loadDay,loadRecord,loadDaily,invalidate,cacheInfo(){return {generation,records:recordCache.info(),days:dayCache.info(),inflight:inflight.size};},dispose(){invalidate({clearState:true,notify:false});}};
}

export function createStructureController({fetcher=globalThis.fetch,onChange=()=>{}}={}){
  const fresh=()=>({payload:null,busy:false,error:null,retained:false,retryAt:0});
  const state={symbol:null,window:'30d',expiry:'',gamma:fresh(),pain:fresh()},requests=new Map();
  const emit=()=>onChange(state);
  const signature=kind=>kind==='gamma'?`${state.symbol}|${state.window}`:`${state.symbol}|${state.expiry}`;
  function cancel(kind){requests.get(kind)?.controller.abort();requests.delete(kind);const retryAt=state[kind].retryAt;state[kind]={...fresh(),retryAt};}
  function setSelection(next){
    const symbol=Object.hasOwn(next,'symbol')?(validStructureSymbol(next.symbol)?next.symbol:null):state.symbol;
    const range=Object.hasOwn(next,'window')&&STRUCTURE_WINDOWS.includes(next.window)?next.window:state.window;
    const expiry=Object.hasOwn(next,'expiry')?(validStructureDate(next.expiry)?next.expiry:''):symbol!==state.symbol?'':state.expiry;
    if(symbol!==state.symbol){cancel('gamma');cancel('pain');state.symbol=symbol;state.expiry='';}
    if(range!==state.window){cancel('gamma');state.window=range;}
    if(expiry!==state.expiry){cancel('pain');state.expiry=expiry;}
    emit();
  }
  async function load(kind,refresh=false){
    if(!['gamma','pain'].includes(kind)||!state.symbol||state[kind].busy)return false;
    const slot=state[kind],key=signature(kind),controller=new AbortController(),record={key,controller};requests.set(kind,record);slot.busy=true;slot.error=null;emit();
    const route=kind==='gamma'?'/api/gamma-exposure':'/api/max-pain';
    const query=kind==='gamma'?{symbol:state.symbol,window:state.window}:{symbol:state.symbol,...(state.expiry?{expiry:state.expiry}:{})};
    const current=()=>requests.get(kind)===record&&signature(kind)===key;
    try{
      const response=await fetcher(route+(refresh?'/refresh':'?'+new URLSearchParams(query)),{method:refresh?'POST':'GET',credentials:'same-origin',cache:'no-store',...(refresh?{headers:{'content-type':'application/json'},body:JSON.stringify(query)}:{}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(90000)])});
      const payload=await response.json();if(!current())return false;
      const retry=Number(payload?.retryAfterSeconds||response.headers?.get?.('retry-after'));
      if(response.status===429){slot.retryAt=Date.now()+(Number.isFinite(retry)&&retry>0?Math.min(retry,3600):60)*1000;throw Object.assign(Error('RATE_LIMITED'),{code:'RATE_LIMITED'});}
      if(!response.ok)throw Object.assign(Error('READ_FAILED'),{code:payload?.error?.code||payload?.code||'READ_FAILED'});
      if(!payload||payload.symbol!==state.symbol||payload.kind!==(kind==='gamma'?'gamma':'max_pain')||(kind==='gamma'&&payload.window!==state.window)||(kind==='pain'&&state.expiry&&payload.expiry!==state.expiry))throw Error('MISMATCHED_SCOPE');
      slot.payload=payload;slot.retained=false;if(refresh)slot.retryAt=Date.now()+60000;return true;
    }catch(error){if(current()){slot.error=typeof error?.code==='string'?error.code:'READ_FAILED';slot.retained=slot.payload!==null;}return false;}
    finally{if(current()){slot.busy=false;requests.delete(kind);emit();}}
  }
  return {state,setSelection,load,dispose(){cancel('gamma');cancel('pain');}};
}
