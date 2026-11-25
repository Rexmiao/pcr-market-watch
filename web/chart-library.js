import {getLanguage} from './i18n.js';

// This list identifies the server's core cache; it never supplies a user's list.
const CORE = new Set(['NVDA','MU','SPY','QQQ','DIA','AVGO','AMD']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay=value=>{if(typeof value!=='string'||!DAY.test(value))return false;const stamp=Date.parse(value+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;};

export async function libraryPool(items,limit,visit) {
  let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(next<items.length)await visit(items[next++]);
  }));
}

function profileSnapshot(body) {
  if(!body||typeof body.initialized!=='boolean'||(body.initialized&&!Array.isArray(body.items)))return null;
  const items=body.initialized?body.items:[];
  if(items.some(item=>!item||typeof item.symbol!=='string'||!/^[A-Z][A-Z0-9.]{0,9}$/.test(item.symbol)))return null;
  return {initialized:body.initialized,items:[...new Map(items.map(item=>[item.symbol,item])).values()],revision:body.revision,storage:body.storage};
}

export function createChartLibraryController({fetcher=globalThis.fetch,onChange=()=>{},timeoutMs=80000,notifyMarketRefresh=true}={}) {
  const state={profile:null,profileError:false,rows:new Map(),cboe:{date:null,checkedAt:null,freshness:null,operation:null},busy:false,phase:'initial',profileChanged:false};
  let active=null;
  const emit=()=>onChange(state);
  async function request(path,method='GET') {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetcher(path,{method,credentials:'same-origin',signal:controller.signal,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
      const body=await response.json();
      return {ok:response.ok,status:response.status,body};
    } catch {return {ok:false,status:0,body:{}};}
    finally {clearTimeout(timer);}
  }
  async function readProfile() {
    const response=await request('/api/watchlist-settings'),profile=response.ok?profileSnapshot(response.body):null;
    state.profileError=!profile;
    if(profile)state.profile=profile;
    emit();return !!profile;
  }
  function keepRow(symbol,payload,operation) {
    const previous=state.rows.get(symbol)||{date:null,checkedAt:null,freshness:null,operation:null};
    const date=payload?.instrument?.rows?.at(-1)?.date||payload?.asof;
    const valid=validDay(date);
    const rollback=valid&&previous.date&&date<previous.date;
    const next=valid&&!rollback?{...previous,date,instrument:payload.instrument||previous.instrument,checkedAt:payload.checkedAt||payload.refresh?.checkedAt||previous.checkedAt,freshness:payload.freshness?.status||payload.instrument?.freshness?.status||null}:previous;
    state.rows.set(symbol,{...next,...(rollback?{operation:'retained'}:operation?{operation}:{}),...(!valid&&!previous.date?{unavailable:true}:{unavailable:false})});emit();
  }
  function coreRows(body,operation) {
    const payload=body?.instruments?body:body?.data;
    for(const item of state.profile?.items||[])if(CORE.has(item.symbol)) {
      const instrument=payload?.instruments?.[item.symbol];
      keepRow(item.symbol,instrument?{instrument,checkedAt:payload.checkedAt||payload.refresh?.checkedAt,freshness:instrument.freshness||payload.freshness}:null,operation||(!instrument?'failed':null));
    }
  }
  function operationFor(response,source) {
    if(!response.ok)return response.status===429?'cooldown':'failed';
    const status=source==='cboe'?response.body.refresh?.status:response.body.status||response.body.refresh?.status;
    return ['updated','unchanged','revised','partial','pending_source','cooldown','busy','failed'].includes(status)?status:'checked';
  }
  async function readCore() {
    const response=await request('/api/watchlist');
    coreRows(response.body,response.ok?null:'failed');
  }
  async function readSymbol(symbol,force=false) {
    const response=await request('/api/symbol?symbol='+encodeURIComponent(symbol)+(force?'&refresh=1':''));
    keepRow(symbol,response.body.instrument?response.body:response.body.data,force?operationFor(response,'occ'):response.ok?null:response.status===429?'cooldown':'failed');
  }
  function keepCboe(response,refresh=false) {
    const payload=response.body?.data?.rows?response.body.data:response.body;
    const date=payload?.asof||payload?.coverage?.availableLastDate;
    const valid=validDay(date),rollback=valid&&state.cboe.date&&date<state.cboe.date;
    if(valid&&!rollback)state.cboe={...state.cboe,date,payload,checkedAt:payload.checkedAt||state.cboe.checkedAt,freshness:payload.freshness?.status||payload.coverage?.status||null};
    if(refresh||!response.ok||rollback)state.cboe.operation=rollback?'retained':operationFor(response,'cboe');
    state.cboe.remainingGaps=payload?.refresh?.remainingGaps??payload?.coverage?.warmupMissingDates?.length??payload?.coverage?.missingDates?.length??null;
    emit();
  }
  async function readCboe() {keepCboe(await request('/api/cboe/history?range=252'));}
  async function readDates() {
    const extra=(state.profile?.items||[]).filter(item=>!CORE.has(item.symbol));
    await Promise.all([readCore(),readCboe(),libraryPool(extra,2,item=>readSymbol(item.symbol))]);
  }
  function run(phase,work) {
    if(active)return active;
    state.busy=true;state.phase=phase;state.profileChanged=false;emit();
    active=(async()=>{
      try {await work();state.phase=phase==='refreshing'?'refreshed':'ready';}
      finally {state.busy=false;active=null;emit();}
    })();
    return active;
  }
  return {
    state,
    records() {return (state.profile?.items||[]).map(item=>({symbol:item.symbol,...(state.rows.get(item.symbol)||{})}));},
    load() {return run('loading',async()=>{await readProfile();await readDates();});},
    refresh() {return run('refreshing',async()=>{
      if(notifyMarketRefresh&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('pcr-data-refresh'));
      const known=await readProfile(),profile=known?state.profile:null;
      const items=profile?.items||[],core=items.filter(item=>CORE.has(item.symbol)),extra=items.filter(item=>!CORE.has(item.symbol));
      for(const item of items)keepRow(item.symbol,null,'loading');
      state.cboe.operation='loading';emit();
      await Promise.all([
        core.length?(async()=>{const result=await request('/api/refresh','POST');coreRows(result.body,operationFor(result,'occ'));})():Promise.resolve(),
        libraryPool(extra,2,item=>readSymbol(item.symbol,true)),
        (async()=>keepCboe(await request('/api/cboe/history/refresh?range=252','POST'),true))(),
      ]);
      const priorRevision=profile?.revision;
      await readProfile();
      state.profileChanged=!!profile&&state.profile?.revision!==priorRevision;
      await readDates();
    });},
  };
}

const COPY={
  zh:{refresh:'更新数据',refreshing:'正在更新…',heading:'当前数据状态',copy:'按各来源实际发布的日期显示，不把检查日期当作数据日期。',symbol:'关注标的',date:'OCC 数据截至',checked:'上次检查（美东）',result:'状态',table:'当前名单的 OCC 数据日期',count:'{count} 个关注标的',uninitialized:'关注名单尚未设置，请先到观察台添加标的。',empty:'关注名单为空。可以到观察台搜索股票或 ETF，再添加到名单。',profileError:'无法读取数据库中的关注名单，请稍后重试。',profileRetained:'暂时无法重新读取名单，仍显示上次读取的名单。',loading:'正在读取关注名单和各来源的数据日期…',running:'正在检查当前名单的 OCC 数据与 Cboe 已发布记录；原数据日期在检查期间保留。',ready:'数据日期分别列出。需要检查新记录时，可使用“更新数据”。',finished:'本次检查已完成，结果分别列在下方；没有新记录的来源保留原日期。',profileChanged:'关注名单在更新期间发生变化，已重新读取。新增标的可再次检查更新。',cboe:'Cboe · INDEX／TOTAL／ETP',cboeDate:'已核实数据截至 {date} · 上次检查 {checked}',scope:'更新仅检查 OCC 成交量和 Cboe 官方日记录；历史图表、OI 持仓快照、市场解读中的报价不会随之更新。',gap:'尚有 {count} 个交易日缺口，受影响的滚动窗口留空。',available:'可用',checkedStatus:'已检查',updated:'已取得新记录',unchanged:'已检查，暂无新记录',revised:'已同步历史修订',partial:'部分更新，保留已核实记录',pending_source:'等待源发布',market_open:'交易中，尚无今日完整日记录',cooldown:'源查询冷却中，请稍后重试',busy:'已有更新正在进行',failed:'检查失败，保留上次可用数据',retained:'源返回较旧记录，保留较新数据',unavailable:'尚无可核实数据',loadingStatus:'正在检查…'},
  en:{refresh:'Update data',refreshing:'Updating…',heading:'Current data status',copy:'Each source keeps its actual activity date. A check time is not a data date.',symbol:'Watchlist symbol',date:'OCC data through',checked:'Last checked (ET)',result:'Status',table:'OCC activity dates for your watchlist',count:'{count} watchlist symbols',uninitialized:'Your watchlist has not been set up. Add symbols on the dashboard first.',empty:'Your watchlist is empty. Search for stocks or ETFs on the dashboard and add them to your list.',profileError:'The database watchlist could not be read. Please retry later.',profileRetained:'The watchlist could not be reloaded. The last successfully read list is retained.',loading:'Loading your watchlist and source data dates…',running:'Checking OCC data for your watchlist and Cboe daily records; existing data dates remain visible.',ready:'Source dates are shown separately. Use Update data to check for new records.',finished:'Checks completed. Individual results are listed below; dates remain unchanged when no new records are available.',profileChanged:'Your watchlist changed during the update and has been reloaded. Newly added symbols can be checked again.',cboe:'Cboe · INDEX / TOTAL / ETP',cboeDate:'Verified data through {date} · Last checked {checked}',scope:'Updates check OCC volume and official Cboe daily records. Saved charts, OI snapshots, and quotes in the market brief are not refreshed.',gap:'{count} trading sessions remain missing; affected rolling windows stay blank.',available:'Available',checkedStatus:'Checked',updated:'New records retrieved',unchanged:'Checked; no new records',revised:'Historical revisions synchronized',partial:'Partial update; verified records retained',pending_source:'Waiting for source publication',market_open:'Market open; today’s full-day data is not available',cooldown:'Source request cooling down; retry later',busy:'An update is already running',failed:'Check failed; last good data retained',retained:'Source returned older records; newer data retained',unavailable:'No verified data available',loadingStatus:'Checking…'},
};

COPY.zh.failedNoData='检查失败，尚无可核实的数据';
COPY.en.failedNoData='Check failed; no verified data is available';
COPY.zh.cboe='Cboe · INDEX／TOTAL／ETF/ETP／EQUITY';
COPY.en.cboe='Cboe · INDEX / TOTAL / ETF/ETP / EQUITY';
COPY.zh.scope='更新会检查当前名单的 OCC 成交量、Cboe 官方日记录及行情条；固定历史页面、OI 快照与旧市场解读的报价不随之更新。';
COPY.en.scope='Updates check OCC volume for your list, Cboe daily records, and the market strip. Saved pages, OI snapshots, and quotes in archived briefs are unchanged.';

export function mountChartLibrary(documentRoot=document) {
  const button=documentRoot.getElementById('library-refresh');
  if(!button)return null;
  const find=id=>documentRoot.getElementById(id);
  const words=()=>COPY[getLanguage()==='en'?'en':'zh'];
  const fill=(key,values={})=>words()[key].replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));
  const checkedLabel=value=>{const date=new Date(value);return value&&Number.isFinite(date.valueOf())?new Intl.DateTimeFormat(getLanguage()==='en'?'en-US':'zh-CN',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'—';};
  const statusLabel=record=>{
    if(record.operation==='failed'&&!record.date)return words().failedNoData;
    const key=record.operation==='loading'?'loadingStatus':record.operation||record.freshness||record.date&&'available'||'unavailable';
    const primary=words()[key]||words().available;
    return record.freshness==='pending_source'&&!['pending_source','failed','loading','cooldown','retained'].includes(record.operation)?primary+' · '+words().pending_source:primary;
  };
  const controller=createChartLibraryController({onChange:render});
  function render(state=controller.state) {
    button.disabled=state.busy;button.textContent=fill(state.phase==='refreshing'?'refreshing':'refresh');
    for(const [id,key] of Object.entries({'library-data-heading':'heading','library-data-copy':'copy','library-symbol-head':'symbol','library-date-head':'date','library-check-head':'checked','library-result-head':'result','library-cboe-heading':'cboe','library-refresh-scope':'scope'}))find(id).textContent=fill(key);
    find('library-table-region').setAttribute('aria-label',fill('table'));
    const profile=state.profile,items=profile?.items||[];
    find('library-profile').textContent=profile?.initialized?fill('count',{count:items.length})+(items.length?' · '+items.map(item=>item.symbol).join(' · '):''):profile?fill('uninitialized'):fill(state.profileError?'profileError':'loading');
    const empty=!profile?.initialized||items.length===0;
    find('library-empty').hidden=!empty;
    find('library-empty').textContent=fill(!profile?state.profileError?'profileError':'loading':profile.initialized?'empty':'uninitialized');
    find('library-profile-note').textContent=state.profileError?fill(profile?'profileRetained':'profileError'):state.profileChanged?fill('profileChanged'):'';
    const problem=state.profileError||controller.records().some(record=>['failed','retained','cooldown'].includes(record.operation))||['failed','retained','partial','cooldown'].includes(state.cboe.operation);
    find('library-status').className='status'+(problem?' error':'');
    find('library-status').textContent=fill(state.phase==='loading'?'loading':state.phase==='refreshing'?'running':state.phase==='refreshed'?'finished':'ready');
    const body=find('library-symbol-rows');body.replaceChildren();
    for(const record of controller.records()) {
      const row=documentRoot.createElement('tr');
      [record.symbol,record.date||'—',checkedLabel(record.checkedAt),statusLabel(record)].forEach((text,index)=>{const cell=documentRoot.createElement(index===0?'th':'td');if(index===0)cell.scope='row';cell.textContent=text;row.append(cell);});body.append(row);
    }
    find('library-cboe-date').textContent=fill('cboeDate',{date:state.cboe.date||'—',checked:checkedLabel(state.cboe.checkedAt)});
    find('library-cboe-state').textContent=statusLabel(state.cboe)+(state.cboe.remainingGaps>0?' · '+fill('gap',{count:state.cboe.remainingGaps}):'');
  }
  button.addEventListener('click',()=>controller.refresh());
  globalThis.window?.addEventListener('pcr-language-change',()=>render());
  render();controller.load();
  return controller;
}

if(typeof document!=='undefined')mountChartLibrary();
