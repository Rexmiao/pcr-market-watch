// Cboe's published daily volume PCR. This feed is separate from ticker-level OCC volume.
const CBOE_SOURCE = 'https://www.cboe.com/markets/us/options/market-statistics/daily';
const CBOE_FIRST_DATE = '2019-10-07';
const CBOE_TTL = 5 * 60 * 1000;
const cboeMemory = new Map();
const cboeActive = new Map();
const cboeAttempts = new Map();
const cboeHistoryMemory = new Map();
const cboeHistoryActive = new Map();
const cboeHistoryAttempts = new Map();
const cboeHistoryUnpublished = new Map();
const CBOE_HISTORY_LIMIT = 4096;
const CBOE_HISTORY_BATCH = 15;
const CBOE_BASE_KEYS = ['total', 'index', 'etp'];
const CBOE_METRICS = {
  total: ['TOTAL PUT/CALL RATIO', 'SUM OF ALL PRODUCTS'],
  index: ['INDEX PUT/CALL RATIO', 'INDEX OPTIONS'],
  etp: ['EXCHANGE TRADED PRODUCTS PUT/CALL RATIO', 'EXCHANGE TRADED PRODUCTS'],
  equity: ['EQUITY PUT/CALL RATIO', 'EQUITY OPTIONS'],
};

function cboeEquityMetric(metrics, candidate) {
  const name=CBOE_METRICS.equity[0],empty=()=>({name,ratio:null,put:null,call:null,derived:false,source:'unavailable',method:'No verified equity ratio or usable category-volume residual.'});
  if(candidate===undefined||candidate===null||candidate.derived===true||candidate.source==='unavailable') {
    if(!CBOE_BASE_KEYS.every(key=>cboeMetricHasVolume(metrics[key])))return empty();
    const p=BigInt(metrics.total.put)-BigInt(metrics.index.put)-BigInt(metrics.etp.put),c=BigInt(metrics.total.call)-BigInt(metrics.index.call)-BigInt(metrics.etp.call),max=BigInt(Number.MAX_SAFE_INTEGER);
    if(p<0n||c<0n||p>max||c>max)return empty();
    const put=Number(p),call=Number(c);
    return {name,ratio:call>0?Number((put/call).toFixed(2)):null,put,call,derived:true,
      source:'derived_from_cboe_category_volumes',derivation:'total_minus_index_minus_etp',
      method:'Put and Call separately equal TOTAL minus INDEX minus ETP; daily PCR is their ratio rounded to two decimals, not a directly retained published equity PCR.'};
  }
  const absent=candidate.put===null&&candidate.call===null,complete=cboeMetricHasVolume(candidate);
  if(candidate.name!==name||!Number.isFinite(candidate.ratio)||candidate.ratio<0||(!absent&&!complete)||
    (complete&&candidate.call>0&&Math.abs(candidate.put/candidate.call-candidate.ratio)>0.011))return empty();
  return {name,ratio:candidate.ratio,put:candidate.put,call:candidate.call,derived:false,source:'cboe_published',method:'Official EQUITY PUT/CALL RATIO and EQUITY OPTIONS volumes when available.'};
}

function cboeCalendarDate() {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cboeShift(day, amount) {
  const value = new Date(day + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function cboeWeekday(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); }
function cboeEaster(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function cboeRegularSession(day) {
  if ([0,6].includes(cboeWeekday(day))) return false;
  const y=Number(day.slice(0,4)),nthMonday=(month,n)=>{const first=`${y}-${String(month).padStart(2,'0')}-01`;return cboeShift(first,(8-cboeWeekday(first))%7+7*(n-1));};
  const observed=value=>cboeWeekday(value)===6?cboeShift(value,-1):cboeWeekday(value)===0?cboeShift(value,1):value;
  let memorial=`${y}-05-31`;while(cboeWeekday(memorial)!==1)memorial=cboeShift(memorial,-1);
  const jan1=`${y}-01-01`,nov1=`${y}-11-01`,thanksgiving=cboeShift(nov1,(11-cboeWeekday(nov1))%7+21);
  const holidays=[cboeWeekday(jan1)===0?cboeShift(jan1,1):jan1,nthMonday(1,3),nthMonday(2,3),cboeShift(cboeEaster(y),-2),memorial,observed(`${y}-07-04`),nthMonday(9,1),thanksgiving,observed(`${y}-12-25`)];
  if(y>=2022)holidays.push(observed(`${y}-06-19`));
  if(y===2025)holidays.push('2025-01-09');
  return !holidays.includes(day);
}
function cboeSessionCalendar(seed) {
  const supplied=seed?.expectedSessionDates;
  const days=Array.isArray(supplied)&&supplied.length&&supplied.every(cboeValidDate)?[...new Set(supplied)].sort():[];
  const set=new Set(days);
  return day=>days.length&&day>=days[0]&&day<=days.at(-1)?set.has(day):cboeRegularSession(day);
}
function cboeHistoryClock(seed, now=new Date()) {
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const marketDate=`${values.year}-${values.month}-${values.day}`,minute=Number(values.hour)*60+Number(values.minute),session=cboeSessionCalendar(seed),y=marketDate.slice(0,4),nov1=`${y}-11-01`,thanksgiving=cboeShift(nov1,(11-cboeWeekday(nov1))%7+21);
  const early=marketDate===cboeShift(thanksgiving,1)||marketDate.endsWith('-12-24')||marketDate.endsWith('-07-03');
  const close=early?13*60:16*60,marketOpen=session(marketDate)&&minute>=570&&minute<close;
  let completed=marketDate;if(!session(completed)||minute<close)completed=cboeShift(completed,-1);
  while(!session(completed))completed=cboeShift(completed,-1);
  return {marketDate,marketOpen,completedSession:completed};
}
function cboeSessionsThrough(day,count,session) {
  const dates=[];for(let d=day;d>=CBOE_FIRST_DATE&&dates.length<count;d=cboeShift(d,-1))if(session(d))dates.unshift(d);
  return dates;
}
function cboeSessionsBetween(first,last,session) {
  const dates=[];for(let d=first;d<=last;d=cboeShift(d,1))if(session(d))dates.push(d);return dates;
}

function cboeValidDate(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const stamp = Date.parse(day + 'T12:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === day;
}

function cboeSnapshot(payload, expectedDate) {
  if (!payload || !cboeValidDate(payload.selectedDate)) throw Error('Cboe returned no verified activity date.');
  if (expectedDate && payload.selectedDate !== expectedDate) throw Error('Cboe returned a different activity date.');
  if (payload.optionsData === null) return null;
  if (!Array.isArray(payload.optionsData?.ratios)) throw Error('Cboe returned an unexpected statistics format.');
  const ratios = new Map(payload.optionsData.ratios.map(row => [row.name, row.value]));
  const metrics = {};
  for (const key of CBOE_BASE_KEYS) {
    const [name,table]=CBOE_METRICS[key];
    const text = ratios.get(name);
    if (typeof text !== 'string' || !/^\d+(?:\.\d+)?$/.test(text)) throw Error('A Cboe PCR field is missing.');
    const ratio = Number(text);
    if (!Number.isFinite(ratio) || ratio < 0) throw Error('Cboe returned an invalid PCR.');
    const row = payload.optionsData[table]?.find(item => item.name === 'VOLUME');
    const validVolume = row && Number.isSafeInteger(row.put) && row.put >= 0 && Number.isSafeInteger(row.call) && row.call >= 0;
    if (validVolume && row.call > 0 && Math.abs(row.put / row.call - ratio) > 0.011) throw Error('Cboe ratio does not match its published volumes.');
    metrics[key] = {name, ratio, put: validVolume ? row.put : null, call: validVolume ? row.call : null};
  }
  const [equityName,equityTable]=CBOE_METRICS.equity,equityText=ratios.get(equityName);
  const equityRow=payload.optionsData[equityTable]?.find(item=>item.name==='VOLUME');
  const equityVolume=cboeMetricHasVolume(equityRow);
  const equityCandidate=equityText===undefined?undefined:{name:equityName,
    ratio:typeof equityText==='string'&&/^\d+(?:\.\d+)?$/.test(equityText)?Number(equityText):NaN,
    put:equityVolume?equityRow.put:null,call:equityVolume?equityRow.call:null};
  metrics.equity=cboeEquityMetric(metrics,equityCandidate);
  return {date: payload.selectedDate, sourceUrl: CBOE_SOURCE + '?dt=' + payload.selectedDate, metrics};
}

function parseCboePage(html, expectedDate) {
  if (typeof html !== 'string' || html.length > 3000000) throw Error('Cboe response is invalid or too large.');
  const chunks = [];
  const pattern = /self\.__next_f\.push\((\[.*?\])\)<\/script>/gs;
  for (const match of html.matchAll(pattern)) {
    try {
      const chunk = JSON.parse(match[1]);
      if (Array.isArray(chunk) && typeof chunk[1] === 'string') chunks.push(chunk[1]);
    } catch { /* Ignore unrelated or incomplete rendering chunks. */ }
  }
  for (const line of chunks.join('').split('\n')) {
    if (!line.includes('"optionsData"')) continue;
    let value;
    try { value = JSON.parse(line.slice(line.indexOf(':') + 1)); } catch { continue; }
    const payload = value?.[3]?.data;
    if (payload && Object.hasOwn(payload, 'optionsData')) return {snapshot: cboeSnapshot(payload, expectedDate), selectedDate: payload.selectedDate};
  }
  throw Error('The official Cboe daily statistics payload is unavailable.');
}

function cboeJson(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...extra,
  }});
}

function cboeVerifiedSnapshot(value, day) {
  if (!value || !cboeValidDate(value.date) || (day && value.date !== day)) return null;
  const metrics = {};
  for (const key of CBOE_BASE_KEYS) {
    const [name]=CBOE_METRICS[key];
    const metric = value.metrics?.[key];
    if (!metric || metric.name !== name || !Number.isFinite(metric.ratio) || metric.ratio < 0) return null;
    const absent = metric.put === null && metric.call === null;
    const complete = Number.isSafeInteger(metric.put) && metric.put >= 0 && Number.isSafeInteger(metric.call) && metric.call >= 0;
    if (!absent && !complete) return null;
    if (complete && metric.call > 0 && Math.abs(metric.put / metric.call - metric.ratio) > 0.011) return null;
    metrics[key] = {name, ratio: metric.ratio, put: metric.put, call: metric.call};
  }
  metrics.equity=cboeEquityMetric(metrics,value.metrics?.equity);
  return {date: value.date, sourceUrl: CBOE_SOURCE + '?dt=' + value.date, metrics};
}

function cboeVerifiedRecord(value, day) {
  if (value?.schemaVersion !== 1 || !Number.isFinite(Date.parse(value.checkedAt))) return null;
  const snapshot = cboeVerifiedSnapshot(value.snapshot, day);
  return snapshot ? {schemaVersion: 1, snapshot, checkedAt: value.checkedAt} : null;
}

function cboeNewerRecord(candidate, current) {
  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.snapshot.date !== current.snapshot.date) return candidate.snapshot.date > current.snapshot.date ? candidate : current;
  return Date.parse(candidate.checkedAt) > Date.parse(current.checkedAt) ? candidate : current;
}

function cboeSeedSnapshot(seed, day) {
  const rows = Array.isArray(seed?.observations) ? seed.observations : [];
  return rows.map(row => cboeVerifiedSnapshot(row, day)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).at(-1) || null;
}

function cboeCacheKey(request, day) {
  return new Request(new URL('/__pcr_internal_cache__/cboe-v1/' + (day || 'latest'), request.url).toString());
}

async function cboeReadCache(request, day) {
  const key = new URL(request.url).origin + '|' + (day || 'latest');
  let value = cboeVerifiedRecord(cboeMemory.get(key), day);
  try {
    const response = await globalThis.caches?.default?.match(cboeCacheKey(request, day));
    if (response) {
      const candidate = cboeVerifiedRecord(await response.json(), day);
      value = cboeNewerRecord(candidate, value);
    }
  } catch { /* A cache miss must not prevent serving a verified seed. */ }
  return value;
}

function cboeBody(record, seed, requestedDate, extras = {}) {
  const latestSnapshot = cboeSeedSnapshot(seed);
  return {
    schemaVersion: 1,
    requestedDate: requestedDate || record.snapshot?.date || latestSnapshot?.date || null,
    calendarDate: cboeCalendarDate(),
    status: record.snapshot ? 'available' : 'not_published',
    snapshot: record.snapshot || null,
    latestDate: [record.snapshot?.date, latestSnapshot?.date].filter(Boolean).sort().at(-1) || null,
    checkedAt: record.checkedAt || seed?.checkedAt || null,
    sourceUrl: requestedDate ? CBOE_SOURCE + '?dt=' + requestedDate : CBOE_SOURCE,
    coverage: 'Cboe daily volume categories; separate from ticker-level OCC contract-side counts. Legacy EQUITY may be derived from TOTAL minus INDEX minus ETP volumes.',
    method:{equity:'Prefer the official published EQUITY ratio and volumes. Legacy records derive Put and Call separately as TOTAL minus INDEX minus ETP; derived daily PCR is rounded to two decimals and marked derived.'},
    ...extras,
  };
}

function cboeHistoryKey(request) {return new Request(new URL('/__pcr_internal_cache__/cboe-history-v1/all',request.url).toString());}
function cboeMergeHistoryRecord(records,value) {
  const record=cboeVerifiedRecord(value);
  if(record) {
    const current=records.get(record.snapshot.date);
    // A later ratio-only page must not erase previously verified volume history.
    if(cboeHistoryComplete(current)&&!cboeHistoryComplete(record))return;
    records.set(record.snapshot.date,cboeNewerRecord(record,current));
  }
}
function cboeBoundHistory(records) {
  const ordered=[...records].sort(([a],[b])=>a.localeCompare(b));
  return new Map(ordered.slice(-CBOE_HISTORY_LIMIT));
}
function cboeRememberHistory(request,record) {
  const origin=new URL(request.url).origin,records=new Map(cboeHistoryMemory.get(origin)||[]);
  cboeMergeHistoryRecord(records,record);cboeHistoryMemory.set(origin,cboeBoundHistory(records));
  if(record?.snapshot) {
    cboeMemory.set(origin+'|'+record.snapshot.date,record);
    const latestKey=origin+'|latest';cboeMemory.set(latestKey,cboeNewerRecord(record,cboeMemory.get(latestKey)));
  }
}
async function cboeReadHistory(request,seed) {
  const origin=new URL(request.url).origin,records=new Map();
  const seedAt=Number.isFinite(Date.parse(seed?.checkedAt))?seed.checkedAt:new Date(0).toISOString();
  for(const snapshot of seed?.observations||[])cboeMergeHistoryRecord(records,{schemaVersion:1,snapshot,checkedAt:seedAt});
  for(const record of (cboeHistoryMemory.get(origin)||new Map()).values())cboeMergeHistoryRecord(records,record);
  try {
    const response=await globalThis.caches?.default?.match(cboeHistoryKey(request));
    if(response) {
      const value=await response.json();
      if(value?.schemaVersion===1&&value.kind==='cboe-history'&&Array.isArray(value.records)&&value.records.length<=CBOE_HISTORY_LIMIT)for(const record of value.records)cboeMergeHistoryRecord(records,record);
    }
  }catch{ /* History also works on Workers hosts without a default cache. */ }
  for(const [key,record] of cboeMemory)if(key.startsWith(origin+'|'))cboeMergeHistoryRecord(records,record);
  cboeMergeHistoryRecord(records,await cboeReadCache(request,null));
  const end=new URL(request.url).searchParams.get('end');
  if(end)cboeMergeHistoryRecord(records,await cboeReadCache(request,end));
  const bounded=cboeBoundHistory(records);cboeHistoryMemory.set(origin,bounded);return bounded;
}
async function cboeSaveHistory(request,records) {
  const origin=new URL(request.url).origin,bounded=cboeBoundHistory(records);
  // Source validation, not optional persistent-cache permission, determines success.
  cboeHistoryMemory.set(origin,bounded);
  try {if(globalThis.caches?.default)await caches.default.put(cboeHistoryKey(request),new Response(JSON.stringify({schemaVersion:1,kind:'cboe-history',records:[...bounded.values()]}),{headers:{'content-type':'application/json','cache-control':'public, max-age=2592000'}}));}catch{}
}
function cboeMetricHasVolume(metric) {return metric&&Number.isSafeInteger(metric.put)&&metric.put>=0&&Number.isSafeInteger(metric.call)&&metric.call>=0;}
function cboeHistoryComplete(record) {return record&&Object.keys(CBOE_METRICS).every(key=>cboeMetricHasVolume(record.snapshot.metrics[key]));}
function cboeHistoryPlan(seed,records,end,range='252') {
  const session=cboeSessionCalendar(seed),clock=cboeHistoryClock(seed),dates=[...records.keys()].sort(),asof=dates.at(-1)||null;
  const requestedEnd=end||asof||clock.completedSession,sessionEnd=cboeSessionsThrough(requestedEnd,1,session)[0]||requestedEnd;
  let first=dates[0]||null;
  if(cboeValidDate(seed?.historyStartDate)&&(!first||seed.historyStartDate<first))first=seed.historyStartDate;
  const displayDates=range==='all'?(first&&first<=sessionEnd?cboeSessionsBetween(first,sessionEnd,session):cboeSessionsThrough(sessionEnd,252,session)):cboeSessionsThrough(sessionEnd,Number(range),session);
  const actualEnd=dates.filter(date=>date<=requestedEnd&&session(date)).at(-1)||null;
  const targetEnd=sessionEnd<clock.completedSession?sessionEnd:clock.completedSession;
  const targetDates=range==='all'?displayDates.filter(date=>date<=targetEnd):cboeSessionsThrough(targetEnd,Number(range)+59,session);
  return {session,clock,asof,requestedEnd,sessionEnd,actualEnd,displayDates,targetDates,range};
}
function cboeHistoryView(seed,records,end,range='252') {
  // Normalize legacy three-category records without discarding their valid data.
  records=new Map([...records].map(([date,record])=>[date,cboeVerifiedRecord(record,date)]).filter(([,record])=>record));
  const plan=cboeHistoryPlan(seed,records,end,range),{session,clock,asof,requestedEnd,sessionEnd,actualEnd,displayDates,targetDates}=plan;
  const rowDates=displayDates.filter(date=>actualEnd&&date<=actualEnd);
  // Generate the session grid once. Prefix sums make every window constant-time;
  // valid counts retain strict missing-session semantics. BigInt prevents a large
  // cached volume outside a window from spoiling otherwise safe window totals.
  const firstCalculationDate=rowDates.length?cboeSessionsThrough(rowDates[0],60,session)[0]:null;
  const calculationDates=firstCalculationDate?cboeSessionsBetween(firstCalculationDate,rowDates.at(-1),session):[];
  const dateIndex=new Map(calculationDates.map((date,index)=>[date,index]));
  const pooled={};
  for(const key of Object.keys(CBOE_METRICS)) {
    const p=[0n],c=[0n],valid=[0],derived=[0];
    for(const date of calculationDates) {
      const metric=records.get(date)?.snapshot.metrics[key],complete=cboeMetricHasVolume(metric);
      p.push(p.at(-1)+(complete?BigInt(metric.put):0n));
      c.push(c.at(-1)+(complete?BigInt(metric.call):0n));
      valid.push(valid.at(-1)+(complete?1:0));
      derived.push(derived.at(-1)+(metric?.derived===true?1:0));
    }
    pooled[key]={p,c,valid,derived};
  }
  const maxSafe=BigInt(Number.MAX_SAFE_INTEGER);
  const rows=rowDates.map(date=>{
    const snapshot=records.get(date)?.snapshot,row={date,available:!!snapshot};
    for(const [key,[name]] of Object.entries(CBOE_METRICS)) {
      const metric=snapshot?.metrics[key],entry={name,daily:metric?.ratio??null,dailyText:Number.isFinite(metric?.ratio)?metric.ratio.toFixed(2):null,p:metric?.put??null,c:metric?.call??null,
        derived:metric?.derived===true,source:metric?.source||(metric?'cboe_published':'unavailable'),method:metric?.method||null};
      for(const n of [20,60]) {
        const sums=pooled[key],stop=dateIndex.get(date)+1,start=stop-n;
        let complete=start>=0&&sums.valid[stop]-sums.valid[start]===n,p=null,c=null;
        if(complete) {
          const put=sums.p[stop]-sums.p[start],call=sums.c[stop]-sums.c[start];
          complete=put<=maxSafe&&call<=maxSafe;
          if(complete){p=Number(put);c=Number(call);}
        }
        entry['p'+n]=p;entry['c'+n]=c;entry['r'+n]=complete&&c>0?p/c:null;
        entry['derived'+n]=complete?sums.derived[stop]-sums.derived[start]>0:null;
      }
      row[key]=entry;
    }
    return row;
  });
  const missingDates=displayDates.filter(date=>!records.has(date)),missingVolumeDates=displayDates.filter(date=>records.has(date)&&!cboeHistoryComplete(records.get(date))),warmupMissingDates=targetDates.filter(date=>!cboeHistoryComplete(records.get(date)));
  const status=!rows.length?'unavailable':clock.marketOpen&&requestedEnd===clock.marketDate?'market_open':sessionEnd>=clock.completedSession&&!records.has(clock.completedSession)?'pending_source':missingDates.length||missingVolumeDates.length?'partial':'current';
  const sourceLatestDate=asof,freshness={...clock,sourceLatestDate,status:!asof||asof<clock.completedSession?'pending_source':clock.marketOpen?'market_open':'current'};
  const message=status==='pending_source'?`最近已完成交易日为${clock.completedSession}，已核实Cboe记录目前截至${asof||'无'}；源尚未返回对应完整日数据。`:status==='market_open'?'交易时段内，历史仅到已核实发布日；今日尚无完整日读数。':status==='unavailable'?'所选期间暂无已取得的官方记录，可使用分批更新；不会以其他日期或标的代替。':missingDates.length||missingVolumeDates.length?`所选期间有${missingDates.length}个交易日无已核实记录、${missingVolumeDates.length}日缺少完整成交量；受影响的20/60日窗口留空。`:'所选期间已取得连续的官方日记录；早期20/60日预热不足时仍留空。';
  const checkedAt=[...records.values()].map(record=>record.checkedAt).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||null;
  const metricCoverage=Object.fromEntries(Object.keys(CBOE_METRICS).map(key=>[key,{
    missingVolumeDates:displayDates.filter(date=>!cboeMetricHasVolume(records.get(date)?.snapshot.metrics[key])),
    derivedSessions:displayDates.filter(date=>records.get(date)?.snapshot.metrics[key]?.derived===true).length,
  }]));
  return {schemaVersion:1,rows,asof,requestedEnd,actualEnd,checkedAt,calendarDate:clock.marketDate,source:CBOE_SOURCE,sourceUrl:CBOE_SOURCE,units:'Cboe published option-contract volume',freshness,
    coverage:{range,firstDate:displayDates[0]||null,lastExpectedDate:sessionEnd,availableFirstDate:[...records.keys()].sort()[0]||null,availableLastDate:asof,expectedSessions:displayDates.length,observedSessions:displayDates.length-missingDates.length,missingDates,missingVolumeDates,warmupMissingDates,continuous:missingDates.length===0&&missingVolumeDates.length===0,metrics:metricCoverage,retainedSnapshots:records.size,retentionLimit:CBOE_HISTORY_LIMIT,status,message},
    method:{daily:'Official published daily volume PCR where retained. Legacy EQUITY daily PCR is rounded to two decimals from derived category volumes and explicitly marked derived.',rolling:'Sum of put volume divided by sum of call volume across exactly 20 or 60 consecutive trading sessions. Legacy EQUITY volumes may be TOTAL minus INDEX minus ETP. A missing session or missing volume makes that metric window null.',scope:'INDEX, TOTAL, ETP and EQUITY aggregate categories in the Cboe daily report; not all-U.S.-exchange ticker PCR or open interest.',equity:'Prefer direct published equity data. For legacy three-category records, subtract INDEX and ETP from TOTAL separately for Put and Call; require complete, non-negative safe integer results, with a zero Call denominator yielding null.'}};
}
async function cboeFetchHistoryDay(day,signal) {
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,15000);
  try {
    const response=await fetch(CBOE_SOURCE+'?dt='+day,{headers:{accept:'text/html'},signal:controller.signal,redirect:'manual'});
    if(response.status<200||response.status>=300)throw Error('Cboe HTTP '+response.status);
    const parsed=parseCboePage(await response.text(),day);
    return parsed.snapshot?{schemaVersion:1,snapshot:parsed.snapshot,checkedAt:new Date().toISOString()}:null;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function handleCboeHistory(request,seed,refresh) {
  const url=new URL(request.url),end=url.searchParams.get('end')||null,range=url.searchParams.get('range')||'252';
  if(!['126','252','all'].includes(range)||url.searchParams.getAll('end').length>1||url.searchParams.getAll('range').length>1)return cboeJson({error:'Choose range=126, 252 or all, with a single end date.'},400);
  if(end&&(!cboeValidDate(end)||end<CBOE_FIRST_DATE||end>cboeCalendarDate()))return cboeJson({error:'Choose an end date between 2019-10-07 and the current New York date.'},400);
  const records=await cboeReadHistory(request,seed);
  if(!refresh)return cboeJson(cboeHistoryView(seed,records,end,range));
  if(Number(request.headers.get('content-length')||0)>1024)return cboeJson({error:'Request body is too large.'},413);
  const text=await request.text();if(text.length>1024)return cboeJson({error:'Request body is too large.'},413);
  try{if(text){const value=JSON.parse(text);if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length)throw Error();}}catch{return cboeJson({error:'Use an empty body or an empty JSON object.'},400);}
  const origin=url.origin,requestedEnd=end||cboeHistoryClock(seed).completedSession;
  if(cboeHistoryActive.has(origin))return cboeJson({...cboeHistoryView(seed,records,requestedEnd,range),refresh:{status:'busy',message:'已有一批官方历史数据正在更新。'},retryAfterSeconds:2},429,{'retry-after':'2'});
  const last=cboeHistoryAttempts.get(origin)||0,wait=Math.max(0,Math.ceil((last+30000-Date.now())/1000));
  if(wait)return cboeJson({...cboeHistoryView(seed,records,requestedEnd,range),refresh:{status:'cooldown',message:'请稍后再提交下一批更新。'},retryAfterSeconds:wait},429,{'retry-after':String(wait)});
  const plan=cboeHistoryPlan(seed,records,requestedEnd,range),gaps=plan.targetDates.filter(day=>!cboeHistoryComplete(records.get(day))),candidates=gaps.filter(day=>Date.now()-(cboeHistoryUnpublished.get(origin+'|'+day)||0)>=CBOE_TTL).reverse().slice(0,CBOE_HISTORY_BATCH);
  if(!candidates.length)return cboeJson({...cboeHistoryView(seed,records,requestedEnd,range),refresh:{status:gaps.length?'pending_source':'unchanged',attemptedDates:[],addedDates:[],remainingGaps:gaps.length,message:gaps.length?'尚缺的日期近期已检查但未发布，请稍后再试。':'所选历史及预热区间暂无缺失记录。'}});
  cboeHistoryAttempts.set(origin,Date.now());
  const pending=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),addedDates=[],unpublishedDates=[],errors=[];let cursor=0;
    try {
      await Promise.all(Array.from({length:Math.min(3,candidates.length)},async()=>{
        while(cursor<candidates.length&&!controller.signal.aborted) {
          const day=candidates[cursor++];
          try {
            const record=await cboeFetchHistoryDay(day,controller.signal);
            if(record){cboeMergeHistoryRecord(records,record);cboeRememberHistory(request,record);cboeHistoryUnpublished.delete(origin+'|'+day);addedDates.push(day);}
            else{cboeHistoryUnpublished.set(origin+'|'+day,Date.now());unpublishedDates.push(day);}
          }catch(error){errors.push({date:day,error:String(error?.message||error).slice(0,160)});}
        }
      }));
    }finally{clearTimeout(timer);}
    if(addedDates.length)await cboeSaveHistory(request,records);
    const remainingGaps=plan.targetDates.filter(day=>!cboeHistoryComplete(records.get(day))).length;
    const status=errors.length?addedDates.length?'partial':'failed':unpublishedDates.length?'pending_source':remainingGaps?'partial':'updated';
    return {...cboeHistoryView(seed,records,requestedEnd,range),refresh:{status,attemptedDates:candidates.slice(0,cursor).sort(),addedDates:addedDates.sort(),unpublishedDates:unpublishedDates.sort(),errors,remainingGaps,batchLimit:CBOE_HISTORY_BATCH,message:errors.length?`本批${errors.length}日未能核实；已核实记录保留，缺失窗口继续留空。`:remainingGaps?`本批最多检查${CBOE_HISTORY_BATCH}日，尚缺${remainingGaps}个交易日或成交量记录；请分批更新，不代表历史已补齐。`:'所选历史及预热区间已补齐已发布记录。'},retryAfterSeconds:30};
  })();
  cboeHistoryActive.set(origin,pending);
  try{return cboeJson(await pending);}finally{cboeHistoryActive.delete(origin);}
}

export async function handleCboeApi(request, env, ctx, seed = {}) {
  const url = new URL(request.url);
  if (!['/api/cboe', '/api/cboe/refresh','/api/cboe/history','/api/cboe/history/refresh'].includes(url.pathname)) return null;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return cboeJson({error: 'Only same-origin requests are accepted.'}, 403);
  const refresh = url.pathname.endsWith('/refresh');
  if (request.method !== (refresh ? 'POST' : 'GET')) return cboeJson({error: 'Method not allowed.'}, 405);
  if(url.pathname.startsWith('/api/cboe/history'))return handleCboeHistory(request,seed,refresh);
  const day = url.searchParams.get('date') || null;
  if (day && (!cboeValidDate(day) || day < CBOE_FIRST_DATE || day > cboeCalendarDate())) return cboeJson({error: 'Choose a date between 2019-10-07 and the current New York date.'}, 400);
  const key = url.origin + '|' + (day || 'latest');
  const cached = await cboeReadCache(request, day);
  const saved = cboeSeedSnapshot(seed, day);
  const fallback = cboeNewerRecord(cached, saved ? {schemaVersion: 1, snapshot: saved, checkedAt: seed.checkedAt} : null);
  const fresh = fallback && Date.now() - Date.parse(fallback.checkedAt) < CBOE_TTL;
  const seedFresh = saved && fallback?.snapshot.date === saved.date && Date.now() - Date.parse(seed.checkedAt) < CBOE_TTL;
  if (!refresh && (fresh || (saved && day) || seedFresh)) return cboeJson(cboeBody(fallback, seed, day, {cached: true}));
  const lastAttempt = cboeAttempts.get(key) || 0;
  if (cboeActive.has(key)) return await cboeActive.get(key).then(result => cboeJson(result.body, result.status));
  if (Date.now() - lastAttempt < 30000) {
    if (fallback) return cboeJson(cboeBody(fallback, seed, day, {cached: true, refreshStatus: 'cooldown'}));
    return cboeJson({error: 'Please retry shortly.', status: 'busy'}, 429, {'retry-after': '30'});
  }
  // Bound per-isolate memory for arbitrary calendar requests.
  if (cboeMemory.size > 100) cboeMemory.delete(cboeMemory.keys().next().value);
  if (cboeAttempts.size > 120) cboeAttempts.delete(cboeAttempts.keys().next().value);
  cboeAttempts.set(key, Date.now());
  const pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(day ? CBOE_SOURCE + '?dt=' + day : CBOE_SOURCE, {
        headers: {accept: 'text/html'}, signal: controller.signal,
      });
      if (!response.ok) throw Error('Cboe HTTP ' + response.status);
      const parsed = parseCboePage(await response.text(), day);
      // A transient older source page must never replace a newer known latest snapshot.
      if (!day && parsed.snapshot && fallback?.snapshot && parsed.snapshot.date < fallback.snapshot.date) throw Error('Cboe returned an older activity date; the newer verified snapshot was retained.');
      if (!day && !parsed.snapshot && fallback) return {status: 200, body: cboeBody(fallback, seed, null, {status: 'saved', refreshStatus: 'not_published', lastAttemptAt: checkedAt})};
      const record = {schemaVersion: 1, snapshot: parsed.snapshot, checkedAt};
      if (parsed.snapshot) {
        cboeRememberHistory(request,record);
        cboeMemory.set(key, record);
        try {
          if (globalThis.caches?.default) await caches.default.put(cboeCacheKey(request, day), new Response(JSON.stringify(record), {
            headers: {'content-type': 'application/json', 'cache-control': 'public, max-age=2592000'},
          }));
        } catch { /* The response remains valid when cache storage is unavailable. */ }
      }
      return {status: 200, body: cboeBody(record, seed, day || parsed.selectedDate, {cached: false})};
    } catch (error) {
      return {status: fallback ? 200 : 502, body: cboeBody(fallback || {snapshot: null, checkedAt: null}, seed, day, {
        status: fallback ? 'saved' : 'source_unavailable', refreshStatus: 'failed',
        error: String(error?.message || error).slice(0, 160),
      })};
    } finally { clearTimeout(timer); }
  })();
  cboeActive.set(key, pending);
  try { const result = await pending; return cboeJson(result.body, result.status); }
  finally { cboeActive.delete(key); }
}

export const cboeTesting = {parseCboePage,cboeSnapshot,cboeVerifiedSnapshot,cboeEquityMetric,cboeValidDate,cboeRegularSession,cboeSessionCalendar,cboeHistoryClock,cboeHistoryPlan,cboeHistoryView,clearMemory(){cboeMemory.clear();cboeAttempts.clear();cboeActive.clear();cboeHistoryMemory.clear();cboeHistoryActive.clear();cboeHistoryAttempts.clear();cboeHistoryUnpublished.clear();}};
