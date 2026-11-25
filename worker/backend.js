// Public OCC data only. Cboe OI is an explicitly dated, immutable seed snapshot.
const SYMBOLS = ["NVDA", "MU", "SPY", "QQQ", "DIA", "AVGO", "AMD"];
const LABELS = {NVDA:"NVDA", MU:"MU", SPY:"SPY", QQQ:"QQQ（NQ参考）", DIA:"DIA（道指）", AVGO:"AVGO", AMD:"AMD"};
const SOURCE = "https://marketdata.theocc.com/volume-query";
const COOLDOWN = 30000;
const active = new Map();
const memory = new Map();
const attempts = new Map();
const symbolMemory = new Map();
const symbolAttempts = new Map();
const symbolLoads = new Map();
const symbolBudgets = new Map();
const SYMBOL_CACHE_TTL = 5 * 60 * 1000;
const SYMBOL_HISTORY_MONTHS = 16;
const MAX_SYMBOL_LOADS = 2;
const SYMBOL_LOADS_PER_MINUTE = 12;
const CATALOG = [
  ["NVDA","NVIDIA","英伟达"],["MU","Micron","美光"],["SPY","SPDR S&P 500 ETF","标普500"],
  ["QQQ","Invesco Nasdaq 100 ETF","纳指100"],["DIA","SPDR Dow Jones ETF","道指"],
  ["AVGO","Broadcom","博通"],["AMD","Advanced Micro Devices","超微半导体"],
  ["SNDK","Sandisk","闪迪"],["AAPL","Apple","苹果"],["MSFT","Microsoft","微软"],
  ["AMZN","Amazon","亚马逊"],["GOOGL","Alphabet","谷歌"],["GOOG","Alphabet Class C","谷歌C类"],
  ["META","Meta Platforms","脸书"],["TSLA","Tesla","特斯拉"],["PLTR","Palantir","帕兰提尔"],
  ["INTC","Intel","英特尔"],["NFLX","Netflix","奈飞"],["COIN","Coinbase",""],
  ["IWM","iShares Russell 2000 ETF","罗素2000"],["SMH","VanEck Semiconductor ETF","半导体ETF"],
  ["SOXX","iShares Semiconductor ETF","半导体ETF"],["XLK","Technology Select Sector ETF","科技ETF"],
];
const OI_NOTICE = "OI仅为原有单次缓存，实际结算日未披露；更新按钮只更新OCC成交量，不更新OI或股票空头持仓。";

function nyParts(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, minute:Number(p.hour)*60+Number(p.minute)};
}
function shift(day, n) { const d = new Date(day+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
function dow(day) { return new Date(day+"T12:00:00Z").getUTCDay(); }
function nthMonday(year, month, n) { const first=`${year}-${String(month).padStart(2,"0")}-01`; return shift(first,(8-dow(first))%7+7*(n-1)); }
function observed(day) { return dow(day)===6 ? shift(day,-1) : dow(day)===0 ? shift(day,1) : day; }
function easter(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function isSession(day) {
  if ([0,6].includes(dow(day))) return false;
  const y=Number(day.slice(0,4)), jan1=`${y}-01-01`;
  let memorial=`${y}-05-31`; while(dow(memorial)!==1) memorial=shift(memorial,-1);
  const thanksgiving=shift(`${y}-11-01`,(11-dow(`${y}-11-01`))%7+21);
  const holidays=[dow(jan1)===0?shift(jan1,1):jan1,nthMonday(y,1,3),nthMonday(y,2,3),shift(easter(y),-2),memorial,observed(`${y}-07-04`),nthMonday(y,9,1),thanksgiving,observed(`${y}-12-25`)];
  if(y>=2022) holidays.push(observed(`${y}-06-19`));
  // Announced exceptional closure relevant to the bundled history.
  if(y===2025) holidays.push("2025-01-09");
  return !holidays.includes(day);
}
function closeMinute(day) {
  const y=day.slice(0,4), thanksgiving=shift(`${y}-11-01`,(11-dow(`${y}-11-01`))%7+21);
  return day===shift(thanksgiving,1)||day.endsWith("-07-03")||day.endsWith("-12-24") ? 13*60 : 16*60;
}
function completedSession(now=new Date()) {
  const local=nyParts(now); let d=local.date;
  if(!isSession(d)||local.minute<closeMinute(d)) d=shift(d,-1);
  while(!isSession(d)) d=shift(d,-1);
  return d;
}
function validDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+"T00:00:00Z"))&&new Date(day+"T00:00:00Z").toISOString().slice(0,10)===day; }
function normalizeRows(rows) {
  const seen=new Set();
  return rows.map(r=>{ const date=r.date,p=r.put_sides??r.p,c=r.call_sides??r.c;
    if(!validDay(date)||!Number.isSafeInteger(p)||!Number.isSafeInteger(c)||p<0||c<0||seen.has(date)) throw Error("持久化成交量数据无效或日期重复");
    seen.add(date); return {date,put_sides:p,call_sides:c};
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
function rawFromSeed(seed) {
  const supplied=seed.raw||seed.occ||seed;
  const data={};
  for(const symbol of SYMBOLS) {
    const rows=supplied.data?.[symbol]||seed.instruments?.[symbol]?.rows;
    if(!Array.isArray(rows)||!rows.length) throw Error(`缺少${symbol}种子数据`);
    data[symbol]=normalizeRows(rows);
  }
  const through=SYMBOLS.map(s=>data[s].at(-1).date).sort()[0];
  return {through,retrieved_at:supplied.retrieved_at||seed.checkedAt||null,source:SOURCE,units:"contract sides",data};
}
function ratio(p,c) { return c>0?p/c:null; }
function freshness(sourceLatestDate,now=new Date()) {
  const local=nyParts(now),completed=completedSession(now);
  const marketOpen=isSession(local.date)&&local.minute>=9*60+30&&local.minute<closeMinute(local.date);
  const status=!sourceLatestDate||sourceLatestDate<completed?"pending_source":marketOpen?"market_open":"current";
  const message=status==="pending_source"?`已结束的最近交易日为${completed}，OCC数据目前截至${sourceLatestDate||"尚无记录"}；源尚未提供对应完整日数据，发布时间以源实际返回为准。`:status==="market_open"?`美股交易时段内；此处为截至${sourceLatestDate}的完整日数据，不含今日盘中成交。`:`OCC数据截至最近已完成交易日${sourceLatestDate}。`;
  return {completedSession:completed,marketDate:local.date,sourceLatestDate:sourceLatestDate||null,status,message};
}
function coverageFor(rows,extra={}) {
  const last=rows.at(-1);
  return {firstDate:rows[0]?.date||null,lastDate:last?.date||null,sessionCount:rows.length,
    rolling20Available:last?.r20!=null,rolling60Available:last?.r60!=null,rankAvailable:last?.rank!=null,
    rankComparisonSessions:252,minimumSessionsForRank:272,
    method:"按OCC有活动记录日期计算；缺失日期不补零，20/60日为所获记录窗口，分位比较此前252个有效20日PCR。",...extra};
}
function makeInstrument(symbol,source,seed={},now=new Date(),coverageExtra={}) {
  if(!source.length)throw Error(`缺少${symbol}活动记录`);
  const prior=[],rows=[],sums={20:{p:0,c:0},60:{p:0,c:0}};
  for(let i=0;i<source.length;i++) {
    const v=source[i],r={date:v.date,p:v.put_sides,c:v.call_sides,daily:ratio(v.put_sides,v.call_sides),r1:ratio(v.put_sides,v.call_sides)};
    for(const n of [20,60]) {
      sums[n].p+=v.put_sides;sums[n].c+=v.call_sides;
      if(i>=n){sums[n].p-=source[i-n].put_sides;sums[n].c-=source[i-n].call_sides;}
      r[`p${n}`]=i>=n-1?sums[n].p:null;r[`c${n}`]=i>=n-1?sums[n].c:null;
      r[`r${n}`]=i>=n-1?ratio(r[`p${n}`],r[`c${n}`]):null;
    }
    r.rank=null;
    if(r.r20!==null&&prior.length>=252){let below=0,equal=0;for(let k=prior.length-252;k<prior.length;k++){if(prior[k]<r.r20)below++;else if(prior[k]===r.r20)equal++;}r.rank=(below+.5*equal)/252;}
    if(r.r20!==null)prior.push(r.r20);
    rows.push(r);
  }
  const last=rows.at(-1),monday=shift(last.date,-((dow(last.date)+6)%7)),week=rows.filter(r=>r.date>=monday);
  const volume=(p,c,dateLabel)=>({p,c,ratio:ratio(p,c),dateLabel});
  const oiArray=seed.oiSnapshots||seed.oi||[];
  let oi=seed.instruments?.[symbol]?.oi||null;
  const original=Array.isArray(oiArray)?oiArray.find(x=>x.symbol===symbol):oiArray[symbol];
  if(original) {
    const v=original.standard_root_only||original,p=v.put_open_interest,c=v.call_open_interest;
    oi={p,c,ratio:ratio(p,c),putShare:p+c>0?p/(p+c):null,callShare:p+c>0?c/(p+c):null,source:original.source_url,fetchedAt:original.fetched_at_utc,quoteTimestamp:original.api_timestamp,settlementDate:null,dateLabel:"原有单次缓存；实际OI结算日未披露"};
  }
  if(oi)oi={...oi,refreshed:false,settlementDate:null};
  return {label:seed.instruments?.[symbol]?.label||LABELS[symbol]||symbol,rows,
    volumes:{day:volume(last.p,last.c,last.date),week:volume(week.reduce((a,x)=>a+x.p,0),week.reduce((a,x)=>a+x.c,0),`${week[0].date}—${last.date}`),
      "20":volume(last.p20,last.c20,rows.length>=20?`${rows.at(-20).date}—${last.date}`:"数据不足20日"),
      "60":volume(last.p60,last.c60,rows.length>=60?`${rows.at(-60).date}—${last.date}`:"数据不足60日")},oi,
    coverage:coverageFor(rows,coverageExtra),freshness:freshness(last.date,now)};
}
function makeView(raw, seed, refresh=seed.refresh||{status:"not_checked",checkedAt:null,message:"尚未进行本次在线检查"}, now=new Date()) {
  const calendarDate=nyParts(now).date;
  const out={schemaVersion:1,asof:raw.through,queryDate:seed.queryDate??null,oiQueryDate:seed.oiQueryDate||seed.queryDate||null,calendarDate,checkedAt:refresh.checkedAt,sourceRetrievedAt:raw.retrieved_at,source:SOURCE,units:"contract sides",oiNotice:OI_NOTICE,refresh,freshness:freshness(raw.through,now),instruments:{}};
  for(const symbol of SYMBOLS) {
    out.instruments[symbol]=makeInstrument(symbol,raw.data[symbol].filter(r=>r.date<=raw.through),seed,now);
  }
  if(seed.shortInterest) out.shortInterest=seed.shortInterest;
  return out;
}
function csvLine(line) {
  const fields=[];let value="",quoted=false;
  for(let i=0;i<line.length;i++) { const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===","&&!quoted){fields.push(value);value="";}else value+=ch; }
  if(quoted) throw Error("OCC CSV引号未闭合");fields.push(value);return fields;
}
function parseMonth(text,symbol,month,upTo) {
  const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/),header=csvLine(lines.shift()||"");
  if(header.slice(0,7).join(",")!=="quantity,underlying,symbol,actype,porc,exchange,actdate") throw Error(`${symbol}/${month}：OCC未返回预期CSV`);
  const totals=new Map(),seen=new Set();
  for(const line of lines) {
    if(!line.trim()) continue; const row=csvLine(line);
    if(row.length<7||row.slice(7).some(x=>x.trim())) throw Error(`${symbol}/${month}：CSV列异常`);
    const [quantity,underlying,root,account,pc,exchange,stamp]=row;
    const dateParts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(stamp),q=Number(quantity);
    if(!dateParts||underlying!==symbol||!root||!exchange||!["C","F","M"].includes(account)||!["P","C"].includes(pc)||!/^\d+$/.test(quantity)||!Number.isSafeInteger(q)) throw Error(`${symbol}/${month}：CSV记录无效`);
    const day=`${dateParts[3]}-${dateParts[1]}-${dateParts[2]}`;
    if(!validDay(day)||day.replaceAll("-","").slice(0,6)!==month) throw Error(`${symbol}/${month}：活动日期异常`);
    const key=row.slice(1,7).join("|");if(seen.has(key)) throw Error(`${symbol}/${month}：记录重复`);seen.add(key);
    if(day>upTo) continue;
    const t=totals.get(day)||{date:day,put_sides:0,call_sides:0};t[pc==="P"?"put_sides":"call_sides"]+=q;totals.set(day,t);
  }
  return normalizeRows([...totals.values()]);
}
function monthsBetween(first,last) {
  const result=[];let y=Number(first.slice(0,4)),m=Number(first.slice(4));
  while(`${y}${String(m).padStart(2,"0")}`<=last) {result.push(`${y}${String(m).padStart(2,"0")}`);if(++m===13){y++;m=1;}}
  return result;
}
function monthOf(day) {return day.slice(0,7).replace("-","");}
function jobsFor(raw,now) {
  const jobs=[],current=monthOf(nyParts(now).date);
  for(const symbol of SYMBOLS) {
    const rows=raw.data[symbol],known=new Set(rows.map(r=>monthOf(r.date))),last=monthOf(rows.at(-1).date);
    for(const month of monthsBetween(monthOf(rows[0].date),current)) if(month>=last||!known.has(month)) jobs.push({symbol,month});
  }
  // Cloudflare has per-request subrequest limits. Never silently publish partial backfills.
  if(jobs.length>42) throw Error("数据缓存已过旧，所需补取超过本次更新限额；旧数据保持可用，请更新网站种子数据。");
  return jobs;
}
async function fetchMonth(symbol,month,signal,fetcher=fetch) {
  const url=new URL(SOURCE);for(const [k,v] of Object.entries({reportDate:month+"01",format:"csv",volumeQueryType:"O",symbolType:"U",symbol,reportType:"M"}))url.searchParams.set(k,v);
  const ctl=new AbortController(),abort=()=>ctl.abort();signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)ctl.abort();
  const timeout=setTimeout(abort,15000);
  try {const response=await fetcher(url.toString(),{headers:{Accept:"text/csv"},signal:ctl.signal,redirect:"manual"});if(response.status<200||response.status>=300)throw Error(`${symbol}/${month}：OCC HTTP ${response.status}`);const body=await response.text();if(body.length>2000000)throw Error("OCC响应过大");return body;}finally{clearTimeout(timeout);signal?.removeEventListener("abort",abort);}
}
async function refreshRaw(previous,now,fetcher=fetch) {
  const raw=structuredClone(previous),upTo=completedSession(now),jobs=jobsFor(raw,now);
  if(previous.through>upTo) throw Error("系统时间早于已有数据日期，保留旧数据");
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
  let cursor=0;
  try {
    await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
      while(cursor<jobs.length) {
        if(ctl.signal.aborted)throw Error("OCC更新超时");const job=jobs[cursor++],{symbol,month}=job;
        const body=await fetchMonth(symbol,month,ctl.signal,fetcher),incoming=parseMonth(body,symbol,month,upTo),old=raw.data[symbol].filter(r=>monthOf(r.date)===month),dates=new Set(incoming.map(r=>r.date));
        if(old.some(r=>!dates.has(r.date)))throw Error(`${symbol}/${month}：源返回日期缺失，保留旧数据`);
        raw.data[symbol]=normalizeRows([...raw.data[symbol].filter(r=>monthOf(r.date)!==month),...incoming]);
      }
    }));
  } catch(error) {ctl.abort();throw error;} finally {clearTimeout(timer);}
  const latest=SYMBOLS.map(s=>raw.data[s].at(-1)?.date);
  if(latest.some(x=>!x))throw Error("OCC未返回完整七标的数据");
  if(new Set(latest).size!==1) return {raw:previous,status:"unchanged",message:"OCC各标的最新日期尚未齐全，保留上一份完整数据。"};
  raw.through=latest[0];if(raw.through<previous.through)throw Error("OCC返回旧数据，保留上一份完整数据");
  const changed=JSON.stringify(raw.data)!==JSON.stringify(previous.data),status=raw.through>previous.through?"updated":changed?"revised":"unchanged";
  raw.retrieved_at=now.toISOString();
  return {raw,status,message:status==="updated"?`已更新至${raw.through}。`:status==="revised"?"已同步OCC历史修订；最新活动日期未改变。":`源暂无更新，数据仍截至${raw.through}。`};
}
function cacheKey(request) {return new Request(new URL("/__pcr_internal_cache__/complete-v1",request.url).toString());}
function checkTime(data) {
  let latest=0;
  for(const value of [data?.checkedAt,data?.refresh?.checkedAt]) {const parsed=typeof value==="string"?Date.parse(value):NaN;if(Number.isFinite(parsed))latest=Math.max(latest,parsed);}
  return latest;
}
function newerData(candidate,current) {
  const candidateDay=candidate?.asof,currentDay=current?.asof;
  if(!validDay(candidateDay))return false;
  if(!validDay(currentDay))return true;
  return candidateDay>currentDay||(candidateDay===currentDay&&checkTime(candidate)>checkTime(current));
}
async function readState(request,seed) {
  const key=new URL(request.url).origin;
  let state=memory.get(key)||null;
  try {const cached=await globalThis.caches?.default?.match(cacheKey(request));if(cached){const candidate=await cached.json();if(candidate.version===1&&candidate.raw?.data&&candidate.data?.instruments&&(!state||newerData(candidate.data,state.data)))state=candidate;}}catch{}
  if(!state||newerData(seed,state.data)) {
    const raw=rawFromSeed(seed),checked=checkTime(seed),refresh={...(seed.refresh||{status:"not_checked",message:"尚未进行本次在线检查"}),checkedAt:checked?new Date(checked).toISOString():null};
    const candidate=makeView(raw,seed,refresh);
    if(!state||newerData(candidate,state.data))state={...(state||{}),version:1,raw,data:candidate,lastAttempt:state?.lastAttempt||null,lastResult:state?.lastResult||null,nextAllowedAt:state?.nextAllowedAt||0};
  }
  // A GET must not race a concurrent refresh by writing an older seed to Cache.
  memory.set(key,state);return state;
}
async function saveState(request,state) {
  // Cache access is optional on some Workers hosts; keep validated data in memory.
  try {if(globalThis.caches?.default) await caches.default.put(cacheKey(request),new Response(JSON.stringify(state),{headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=2592000"}}));}catch{}
  memory.set(new URL(request.url).origin,state);
}
function json(body,status=200,extra={}) {return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extra}});}
function calendarView(data,now=new Date()) {
  const instruments=Object.fromEntries(Object.entries(data.instruments).map(([symbol,value])=>[symbol,{...value,coverage:value.coverage||coverageFor(value.rows),freshness:freshness(value.rows.at(-1)?.date||data.asof,now)}]));
  return {...data,calendarDate:nyParts(now).date,freshness:freshness(data.asof,now),instruments};
}
function normalizeSymbol(value) {
  if(typeof value!=="string"||value.length>32)return null;
  const symbol=value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)?symbol:null;
}
function searchSymbols(query,seed) {
  const q=query.trim(),needle=q.toUpperCase(),catalog=new Map(CATALOG.map(([symbol,name,chinese])=>[symbol,{symbol,name,chinese,label:chinese?`${symbol} · ${chinese}`:`${symbol} · ${name}`,kind:"catalog",canQuery:true}]));
  for(const [symbol,value] of Object.entries(seed.instruments||{}))if(normalizeSymbol(symbol))catalog.set(symbol,{...(catalog.get(symbol)||{symbol,name:symbol}),label:value.label||symbol,kind:"catalog",canQuery:true});
  const results=[...catalog.values()].filter(x=>!q||`${x.symbol} ${x.name} ${x.chinese||''} ${x.label}`.toUpperCase().includes(needle)).sort((a,b)=>(a.symbol===needle?-1:b.symbol===needle?1:a.symbol.startsWith(needle)?-1:b.symbol.startsWith(needle)?1:a.symbol.localeCompare(b.symbol)));
  const direct=normalizeSymbol(q);
  if(direct&&!results.some(x=>x.symbol===direct))results.push({symbol:direct,label:`${direct} · 查询OCC以确认数据`,name:direct,kind:"direct",canQuery:true});
  return {query:q,results:results.slice(0,10),scope:"seed_and_small_catalog",message:"仅检索已保存及少量常用标的名称；也可直接输入代码查询OCC。候选不代表已验证有上市期权或历史数据。"};
}
function monthShift(month,offset) {
  const date=new Date(`${month.slice(0,4)}-${month.slice(4)}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+offset);
  return date.toISOString().slice(0,7).replace("-","");
}
function symbolCacheKey(request,symbol) {return new Request(new URL(`/__pcr_internal_cache__/symbol-v1/${encodeURIComponent(symbol)}`,request.url).toString());}
function rememberSymbol(key,state) {
  symbolMemory.delete(key);symbolMemory.set(key,state);
  while(symbolMemory.size>32)symbolMemory.delete(symbolMemory.keys().next().value);
}
async function readSymbolState(request,symbol) {
  const key=new URL(request.url).origin+"|"+symbol;
  let state=symbolMemory.get(key)||null;
  try {
    const response=await globalThis.caches?.default?.match(symbolCacheKey(request,symbol));
    if(response) {
      const candidate=await response.json();
      if(candidate.version===1&&candidate.symbol===symbol&&Array.isArray(candidate.rows)&&candidate.rows.length) {
        candidate.rows=normalizeRows(candidate.rows);
        if(!state||candidate.rows.at(-1).date>state.rows.at(-1).date||(candidate.rows.at(-1).date===state.rows.at(-1).date&&Date.parse(candidate.checkedAt)>Date.parse(state.checkedAt)))state=candidate;
      }
    }
  }catch{}
  if(state)rememberSymbol(key,state);
  return state;
}
async function saveSymbolState(request,state) {
  // A cache-write outage must not invalidate successfully validated OCC data.
  try {if(globalThis.caches?.default)await caches.default.put(symbolCacheKey(request,state.symbol),new Response(JSON.stringify(state),{headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=2592000"}}));}catch{}
  rememberSymbol(new URL(request.url).origin+"|"+state.symbol,state);
}
function symbolPayload(state,now=new Date(),refresh={status:"cached",message:"使用该标的最近一次完整缓存。"}) {
  const symbol=state.symbol,catalog=CATALOG.find(x=>x[0]===symbol),label=catalog?.[2]?`${symbol} · ${catalog[2]}`:symbol;
  const instrument=makeInstrument(symbol,state.rows,{instruments:{[symbol]:{label}}},now,state.coverage||{});
  return {symbol,instrument,asof:state.rows.at(-1).date,checkedAt:state.checkedAt,calendarDate:nyParts(now).date,source:SOURCE,units:"contract sides",coverage:instrument.coverage,freshness:instrument.freshness,refresh:{...refresh,checkedAt:state.checkedAt},oiNotice:"该标的没有可核实OI来源，OI不提供；更新仅检查OCC完整日成交量。"};
}
async function refreshSymbolRows(symbol,previous,now,fetcher=fetch) {
  const current=monthOf(nyParts(now).date),floor=monthShift(current,1-SYMBOL_HISTORY_MONTHS),upTo=completedSession(now);
  const retained=(previous?.rows||[]).filter(r=>monthOf(r.date)>=floor);
  if(previous?.rows.at(-1)?.date>upTo)throw Error("系统时间早于缓存日期，保留原数据");
  const first=retained.length?monthOf(retained.at(-1).date):floor,jobs=monthsBetween(first,current);
  if(jobs.length>SYMBOL_HISTORY_MONTHS)throw Error("单标的历史请求超出本次限额");
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000),incoming=new Map();
  let cursor=0;
  try {
    await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
      while(cursor<jobs.length) {
        if(ctl.signal.aborted)throw Error("OCC标的查询超时");const month=jobs[cursor++];
        const text=await fetchMonth(symbol,month,ctl.signal,fetcher),rows=parseMonth(text,symbol,month,upTo),dates=new Set(rows.map(r=>r.date));
        if(retained.some(r=>monthOf(r.date)===month&&!dates.has(r.date)))throw Error(`${symbol}/${month}：源返回日期缺失，保留旧数据`);
        incoming.set(month,rows);
      }
    }));
  }catch(error){ctl.abort();throw error;}finally{clearTimeout(timer);}
  const rows=normalizeRows([...retained.filter(r=>!incoming.has(monthOf(r.date))),...[...incoming.values()].flat()]);
  if(!rows.length){const error=new Error("OCC未返回该代码的活动记录；可能代码无效、没有可用期权或尚无所选期间数据。");error.code="NO_OCC_DATA";throw error;}
  const actualDates=new Set(rows.map(r=>r.date));let gaps=0;
  for(let day=rows[0].date;day<=rows.at(-1).date;day=shift(day,1))if(isSession(day)&&!actualDates.has(day))gaps++;
  const coverage={requestedStartDate:`${floor.slice(0,4)}-${floor.slice(4)}-01`,requestedEndDate:upTo,historyMonths:SYMBOL_HISTORY_MONTHS,monthsCheckedThisRequest:jobs.length,emptyMonths:monthsBetween(floor,current).filter(month=>!rows.some(r=>monthOf(r.date)===month)),unobservedSessionsWithinCoverage:gaps};
  const status=!previous||rows.at(-1).date>previous.rows.at(-1).date?"updated":JSON.stringify(rows)!==JSON.stringify(previous.rows)?"revised":"unchanged";
  return {version:1,symbol,rows,checkedAt:now.toISOString(),coverage,status};
}
function symbolRateLimit(origin,nowMs) {
  const running=[...symbolLoads.keys()].filter(key=>key.startsWith(origin+"|")).length;
  if(running>=MAX_SYMBOL_LOADS)return {message:"同时查询的新增标的较多，请稍后重试。",retryAfterSeconds:2};
  let budget=symbolBudgets.get(origin);
  if(!budget||nowMs-budget.startedAt>=60000){budget={startedAt:nowMs,count:0};symbolBudgets.set(origin,budget);}
  if(budget.count>=SYMBOL_LOADS_PER_MINUTE)return {message:"本分钟新增标的查询次数已达上限，请稍后重试。",retryAfterSeconds:Math.max(1,Math.ceil((budget.startedAt+60000-nowMs)/1000))};
  budget.count++;return null;
}
async function handleSymbol(request,seed) {
  const url=new URL(request.url),symbol=url.searchParams.getAll("symbol").length===1?normalizeSymbol(url.searchParams.get("symbol")):null;
  if(!symbol)return json({error:"代码格式无效",message:"请输入1至10位美股代码，仅允许字母、数字及点，首位必须为字母。",code:"INVALID_SYMBOL"},400);
  if(url.searchParams.has("refresh")&&!["0","1"].includes(url.searchParams.get("refresh")))return json({symbol,error:"refresh参数无效",code:"INVALID_REFRESH"},400);
  const now=new Date(),nowMs=Date.now(),key=url.origin+"|"+symbol;
  if(SYMBOLS.includes(symbol)) {
    const state=await readState(request,seed),view=calendarView(state.data,now),instrument=view.instruments[symbol];
    return json({symbol,instrument,asof:instrument.rows.at(-1).date,checkedAt:view.checkedAt,calendarDate:view.calendarDate,source:SOURCE,coverage:instrument.coverage,freshness:instrument.freshness,refresh:{status:"cached",message:"核心关注标的使用完整缓存；请用首页更新按钮统一检查。"}});
  }
  const previous=await readSymbolState(request,symbol),force=url.searchParams.get("refresh")==="1",attempt=symbolAttempts.get(key);
  if(!force&&previous&&nowMs-Date.parse(previous.checkedAt)<SYMBOL_CACHE_TTL)return json(symbolPayload(previous,now));
  // Concurrent requests for the same ticker share the same load, including force-refresh.
  if(symbolLoads.has(key)){const result=await symbolLoads.get(key);return json(result.body,result.httpStatus,result.headers);}
  const retryAfterSeconds=Math.max(0,Math.ceil(((attempt?.nextAllowedAt||0)-nowMs)/1000));
  if(retryAfterSeconds){const body={symbol,error:"查询冷却中",message:"刚刚检查过该标的，请稍后重试。",code:"SYMBOL_COOLDOWN",retryAfterSeconds,...(previous?{data:symbolPayload(previous,now)}:{})};return json(body,429,{"Retry-After":String(retryAfterSeconds)});}
  const limited=symbolRateLimit(url.origin,nowMs);
  if(limited)return json({symbol,error:limited.message,message:limited.message,code:"SYMBOL_RATE_LIMIT",retryAfterSeconds:limited.retryAfterSeconds,...(previous?{data:symbolPayload(previous,now)}:{})},429,{"Retry-After":String(limited.retryAfterSeconds)});
  symbolAttempts.set(key,{at:now.toISOString(),nextAllowedAt:nowMs+COOLDOWN,result:"running"});
  const load=(async()=>{
    try {
      const state=await refreshSymbolRows(symbol,previous,now);
      await saveSymbolState(request,state);
      symbolAttempts.set(key,{at:now.toISOString(),nextAllowedAt:Date.now()+COOLDOWN,result:state.status});
      return {httpStatus:200,body:symbolPayload(state,new Date(),{status:state.status,message:`已检查${symbol}，OCC活动记录截至${state.rows.at(-1).date}。`})};
    }catch(error) {
      symbolAttempts.set(key,{at:now.toISOString(),nextAllowedAt:Date.now()+COOLDOWN,result:"failed"});
      const code=error?.code==="NO_OCC_DATA"?"NO_OCC_DATA":"OCC_SOURCE_ERROR",message=previous?"查询失败，保留该标的上一份完整缓存。":code==="NO_OCC_DATA"?error.message:"OCC标的查询失败，请稍后重试。";
      return {httpStatus:code==="NO_OCC_DATA"?404:502,body:{symbol,error:String(error?.message||error).slice(0,300),message,code,...(previous?{data:symbolPayload(previous,new Date(),{status:"failed",message})}:{})}};
    }
  })();
  symbolLoads.set(key,load);
  try{const result=await load;return json(result.body,result.httpStatus,result.headers);}finally{symbolLoads.delete(key);}
}

export async function handleApi(request,env,ctx,seed) {
  const url=new URL(request.url);if(!url.pathname.startsWith("/api/"))return null;
  if(!["/api/watchlist","/api/status","/api/refresh","/api/search","/api/symbol"].includes(url.pathname))return json({error:"API不存在"},404);
  const origin=request.headers.get("Origin");if(origin&&origin!==url.origin)return json({error:"只接受本站请求"},403);
  if(!["GET","POST"].includes(request.method))return json({error:"不支持的方法"},405);
  if((url.pathname==="/api/refresh")!==(request.method==="POST"))return json({error:"不支持的方法"},405);
  if(url.pathname==="/api/search") {
    const query=url.searchParams.get("q")||"";
    if(query.length>64)return json({error:"搜索内容过长",code:"INVALID_QUERY"},400);
    return json(searchSymbols(query,seed));
  }
  if(url.pathname==="/api/symbol")return handleSymbol(request,seed);
  const state=await readState(request,seed),key=url.origin,attempt=attempts.get(key),nowMs=Date.now();
  const nextAllowed=Math.max(state.nextAllowedAt||0,attempt?.nextAllowedAt||0),retryAfterSeconds=Math.max(0,Math.ceil((nextAllowed-nowMs)/1000));
  if(url.pathname==="/api/watchlist")return json(calendarView(state.data));
  if(url.pathname==="/api/status")return json({refreshing:active.has(key),lastAttempt:attempt?.at||state.lastAttempt,lastResult:attempt?.result||state.lastResult,cooldownSeconds:COOLDOWN/1000,retryAfterSeconds,latestActivityDate:state.data.asof,oiNotice:OI_NOTICE,freshness:freshness(state.data.asof)});
  if(!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))return json({error:"更新请求须使用application/json"},415);
  if(Number(request.headers.get("Content-Length")||0)>1024)return json({error:"请求过大"},413);
  const body=await request.text();if(body.length>1024)return json({error:"请求过大"},413);
  try{if(body){const parsed=JSON.parse(body);if(!parsed||Array.isArray(parsed)||typeof parsed!=="object"||Object.keys(parsed).length)throw Error();}}catch{return json({error:"更新请求应为空JSON对象"},400);}
  if(active.has(key)||retryAfterSeconds)return json({status:"busy",message:active.has(key)?"已有更新正在进行。":"请稍后再试。",retryAfterSeconds:retryAfterSeconds||1},429,{"Retry-After":String(retryAfterSeconds||1)});
  const now=new Date(),at=now.toISOString();attempts.set(key,{at,nextAllowedAt:Date.now()+COOLDOWN,result:"running"});active.set(key,true);
  try {
    const result=await refreshRaw(state.raw,now),refresh={status:result.status,checkedAt:at,latestActivityDate:result.raw.through,message:result.message};
    const data=makeView(result.raw,seed,refresh,now),next={version:1,raw:result.raw,data,lastAttempt:at,lastResult:result.status,nextAllowedAt:Date.now()+COOLDOWN};
    await saveState(request,next);attempts.set(key,{at,nextAllowedAt:next.nextAllowedAt,result:result.status});
    return json({status:result.status,data,message:result.message,oiRefreshed:false,retryAfterSeconds:COOLDOWN/1000});
  }catch(error){attempts.set(key,{at,nextAllowedAt:Date.now()+COOLDOWN,result:"failed"});return json({status:"failed",message:"更新失败，保留上一份完整数据。",error:String(error?.message||error).slice(0,300),data:calendarView(state.data),oiRefreshed:false},502);}finally{active.delete(key);}
}

export const backendTesting={nyParts,isSession,completedSession,parseMonth,rawFromSeed,makeView,makeInstrument,coverageFor,freshness,normalizeSymbol,searchSymbols,refreshSymbolRows,jobsFor,refreshRaw,clearMemory(){active.clear();memory.clear();attempts.clear();symbolMemory.clear();symbolAttempts.clear();symbolLoads.clear();symbolBudgets.clear();}};
