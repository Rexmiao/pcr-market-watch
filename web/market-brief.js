import {getLanguage} from './i18n.js';
import {createChartLibraryController} from './chart-library.js';

export function briefMacroFacts(market) {
  const quotes=['sp500','nasdaq','dow'].map(id=>market?.quotes?.find(row=>row.id===id)).filter(row=>Number.isFinite(row?.price)&&Number.isFinite(row?.changePercent));
  return {quotes,up:quotes.filter(row=>row.changePercent>0).length,down:quotes.filter(row=>row.changePercent<0).length};
}

export function briefPCRFacts(history) {
  const row=(history?.rows||[]).findLast(item=>item.available!==false&&['index','total','etp','equity'].some(key=>Number.isFinite(item[key]?.daily)));
  return {date:row?.date||null,series:['index','total','etp','equity'].filter(key=>Number.isFinite(row?.[key]?.r20)&&Number.isFinite(row?.[key]?.r60)).map(key=>({key,r20:row[key].r20,r60:row[key].r60}))};
}

const BRIEF_MARKETS=['sp500','nasdaq','dow','oil','gold','bitcoin'];
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_.:-]{0,79}$/.test(value)?value:null;
function briefCheck(path,options,response,body){
  const url=new URL(path,'https://brief.invalid'),pathname=url.pathname;
  const source=pathname==='/api/watchlist-settings'?'profile':pathname.startsWith('/api/cboe/history')?'cboe':pathname==='/api/watchlist'||pathname==='/api/refresh'||pathname==='/api/symbol'?'occ':pathname.startsWith('/api/market')?'market':pathname==='/api/brief-quotes/status'?'stockStatus':pathname==='/api/brief-quotes'?'stocks':null;
  if(!source)return null;
  const symbol=url.searchParams.get('symbol'),symbols=(url.searchParams.get('symbols')||symbol||'').split(',').filter(value=>/^[A-Z][A-Z0-9.]{0,9}$/.test(value));
  const refresh=options?.method==='POST'||url.searchParams.get('refresh')==='1';
  return {key:source+':'+(refresh?'refresh':'read')+':'+symbols.join(','),source,refresh,symbols,ok:response?.ok===true,httpStatus:response?.status||0,code:safeCode(body?.code)||safeCode(body?.error?.code)||safeCode(body?.error)||null,operation:body?.refresh?.status||body?.refreshStatus||body?.status||null,errorCount:Array.isArray(body?.refresh?.errors)?body.refresh.errors.length:Array.isArray(body?.errors)?body.errors.length:0,retryAfterSeconds:Number.isFinite(body?.retryAfterSeconds)?body.retryAfterSeconds:null};
}

// Each source keeps its own state. Publication waits and cooldowns are not request failures.
export function briefSourceStatuses(state){
  const library=state.library?.state||{},records=state.library?.records?.()||[],checks=[...(state.sourceChecks?.values?.()||[])],sources=[];
  const entry=(id,values={})=>({id,level:'ok',reasons:[],...values});
  const add=(target,reason,level='info',values={})=>{target.reasons.push({reason,...values});if(({ok:0,info:1,warning:2,error:3})[level]>({ok:0,info:1,warning:2,error:3})[target.level])target.level=level;};
  function requests(target,ids){for(const check of checks.filter(check=>ids.includes(check.source))){if(check.httpStatus===429||['cooldown','busy'].includes(check.operation)){add(target,check.operation==='busy'?'busy':'cooldown','warning',{seconds:check.retryAfterSeconds});}else if(!check.ok||check.operation==='failed'||check.errorCount>0){add(target,'failed','error',{httpStatus:check.httpStatus,code:check.code,errorCount:check.errorCount,symbols:check.symbols});}}}
  const profile=entry('profile');if(library.profileError)add(profile,'profileFailed','error');else if(!library.profile?.initialized)add(profile,'uninitialized');else if(!records.length)add(profile,'empty');if(profile.reasons.length)sources.push(profile);
  const market=entry('market',{checkedAt:state.market?.checkedAt,quotes:(state.market?.quotes||[]).filter(quote=>BRIEF_MARKETS.includes(quote.id)&&Number.isFinite(quote.price)&&Number.isFinite(quote.changePercent))});requests(market,['market']);
  const failedQuoteIds=Array.isArray(state.marketFailedQuoteIds)?state.marketFailedQuoteIds:(state.market?.quotes||[]).filter(quote=>BRIEF_MARKETS.includes(quote.id)&&quote.error&&quote.lastAttemptAt).map(quote=>quote.id);
  if(failedQuoteIds.length)add(market,'quoteFailed','error',{ids:failedQuoteIds});
  const missing=BRIEF_MARKETS.filter(id=>!state.market?.quotes?.some(quote=>quote.id===id&&Number.isFinite(quote.price)&&Number.isFinite(quote.changePercent)));
  if(missing.length)add(market,'quotesMissing',state.busy&&!state.market?'info':'warning',{ids:missing});
  if(state.market?.quotes?.some(quote=>quote.stale&&Number.isFinite(quote.price)))add(market,'retained','warning');sources.push(market);
  const occ=entry('occ',{records});requests(occ,['occ']);
  const failed=records.filter(row=>row.operation==='failed');if(failed.length&&!occ.reasons.some(reason=>reason.reason==='failed'))add(occ,'failed','error',{symbols:failed.map(row=>row.symbol)});
  const cooldown=records.filter(row=>row.operation==='cooldown');if(cooldown.length&&!occ.reasons.some(reason=>reason.reason==='cooldown'))add(occ,'cooldown','warning',{symbols:cooldown.map(row=>row.symbol)});
  const waiting=records.filter(row=>['pending_source','market_open'].includes(row.freshness)||['pending_source','busy'].includes(row.operation));if(waiting.length)add(occ,'publicationWait','info',{symbols:waiting.map(row=>row.symbol)});
  const partial=records.filter(row=>row.operation==='partial'||row.freshness==='partial');if(partial.length)add(occ,'partial','warning',{symbols:partial.map(row=>row.symbol)});
  const retained=records.filter(row=>row.operation==='retained');if(retained.length)add(occ,'olderRetained','warning',{symbols:retained.map(row=>row.symbol)});
  const unavailable=records.filter(row=>!row.date);if(unavailable.length&&!state.busy)add(occ,'dataMissing','warning',{symbols:unavailable.map(row=>row.symbol)});if(!records.length)add(occ,library.profile?.initialized&&!library.profileError?'noSymbols':'profileUnavailable');sources.push(occ);
  const cboe=entry('cboe',{date:library.cboe?.date,checkedAt:library.cboe?.checkedAt});requests(cboe,['cboe']);
  const c=library.cboe||{},coverage=c.payload?.coverage||{};
  if(c.operation==='failed'&&!cboe.reasons.some(reason=>reason.reason==='failed'))add(cboe,'failed','error');
  if(['cooldown','busy'].includes(c.operation)&&!cboe.reasons.some(reason=>reason.reason===c.operation))add(cboe,c.operation,'warning');
  const gapDates=new Set([...coverage.missingDates||[],...coverage.missingVolumeDates||[],...coverage.warmupMissingDates||[]]);
  const gaps=Math.max(gapDates.size,Number.isFinite(c.remainingGaps)?c.remainingGaps:0);
  if(gaps>0)add(cboe,'gaps','warning',{count:gaps});
  if(['pending_source','market_open'].includes(c.freshness)||c.operation==='pending_source')add(cboe,'publicationWait');
  if(c.operation==='partial'&&!gaps&&!cboe.reasons.some(reason=>reason.reason==='failed'))add(cboe,'partial','warning');
  if(c.operation==='retained')add(cboe,'olderRetained','warning');if(!c.date)add(cboe,state.busy?'loading':'dataMissing',state.busy?'info':'warning');sources.push(cboe);
  const stocks=entry('stocks',{provider:state.stockStatus?.provider||state.stockProvider||null,checkedAt:state.stockCheckedAt,quotes:[...(state.stockQuotes?.values?.()||[])]});requests(stocks,['stockStatus','stocks']);
  if(state.stockStatus?.configured===false&&!stocks.reasons.some(reason=>reason.reason==='failed'))add(stocks,'notConfigured');
  else if(state.stockStatus?.configured&&state.stockMissingSymbols?.length)add(stocks,'quotesMissing','warning',{symbols:state.stockMissingSymbols});
  if(state.stockSchemaError&&!stocks.reasons.some(reason=>reason.reason==='failed'))add(stocks,'invalidResponse','error');
  if(stocks.quotes.some(quote=>quote.stale))add(stocks,'retained','warning');if(!records.length&&stocks.level==='ok')add(stocks,library.profile?.initialized&&!library.profileError?'noSymbols':'profileUnavailable');else if(state.busy&&!stocks.quotes.length&&!state.stockStatus)add(stocks,'loading');sources.push(stocks);
  return sources.map(source=>({...source,reasons:source.reasons.filter((reason,index,reasons)=>reasons.findIndex(other=>JSON.stringify(other)===JSON.stringify(reason))===index)}));
}

export function createMarketBriefController({fetcher=globalThis.fetch,onChange=()=>{}}={}) {
  const state={busy:false,phase:'initial',market:null,marketFailure:false,marketFailedQuoteIds:null,stockStatus:null,stockFailure:false,stockQuotes:new Map(),stockCheckedAt:null,stockProvider:null,stockMissingSymbols:[],stockSchemaError:false,sourceChecks:new Map()};
  const observedFetcher=async(path,options={})=>{try{const response=await fetcher(path,options);let body;try{body=await response.clone().json();}catch{}const check=briefCheck(path,options,response,body);if(check)state.sourceChecks.set(check.key,check);return response;}catch(error){const check=briefCheck(path,options,null,null);if(check)state.sourceChecks.set(check.key,check);throw error;}};
  const library=createChartLibraryController({fetcher:observedFetcher,notifyMarketRefresh:false,onChange:()=>onChange(state)});
  state.library=library;
  let active=null;
  const emit=()=>onChange(state);
  async function request(path,post=false) {
    try {const response=await observedFetcher(path,{method:post?'POST':'GET',credentials:'same-origin',signal:AbortSignal.timeout(60000),...(post?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});return {ok:response.ok,body:await response.json()};}
    catch {return {ok:false,body:{}};}
  }
  async function market(refresh=false) {
    const result=await request(refresh?'/api/market/refresh':'/api/market',refresh),incoming=result.body;
    state.marketFailure=!result.ok||incoming.status==='failed'||incoming.status==='partial';
    state.marketFailedQuoteIds=(Array.isArray(incoming.quotes)?incoming.quotes:[]).filter(quote=>BRIEF_MARKETS.includes(quote?.id)&&quote.error&&quote.lastAttemptAt).map(quote=>quote.id);
    if(Array.isArray(incoming.quotes)) {
      const merged=new Map((state.market?.quotes||[]).map(row=>[row.id,row]));
      for(const quote of incoming.quotes) {
        const prior=merged.get(quote.id);
        if(Number.isFinite(quote.price)&&(!prior||!prior.marketTime||!quote.marketTime||quote.marketTime>=prior.marketTime))merged.set(quote.id,quote);
        else if(prior)merged.set(quote.id,{...prior,stale:true});
      }
      state.market={...incoming,quotes:[...merged.values()]};
    } else if(state.market) {
      state.market={...state.market,quotes:state.market.quotes.map(quote=>({...quote,stale:true}))};
    }
    emit();
  }
  async function stockStatus() {
    const result=await request('/api/brief-quotes/status');
    if(result.ok){const next=result.body.provider;if(state.stockProvider&&next!==state.stockProvider||result.body.configured===false){state.stockQuotes.clear();state.stockCheckedAt=null;}state.stockStatus=result.body;state.stockProvider=next||null;}
    emit();
  }
  async function stocks() {
    state.stockFailure=false;state.stockMissingSymbols=[];state.stockSchemaError=false;
    if(!state.stockStatus?.configured){emit();return;}
    const symbols=(library.state.profile?.items||[]).map(row=>row.symbol);
    for(let offset=0;offset<symbols.length;offset+=20) {
      const selected=symbols.slice(offset,offset+20),result=await request('/api/brief-quotes?symbols='+encodeURIComponent(selected.join(',')));
      const quotes=result.body.data?.basic_qot_list;
      if(!result.ok||!Array.isArray(quotes)){state.stockFailure=true;state.stockSchemaError=state.stockSchemaError||result.ok;for(const symbol of selected){const old=state.stockQuotes.get(symbol);if(old)state.stockQuotes.set(symbol,{...old,stale:true});}continue;}
      const found=new Set();
      for(const quote of quotes) {
        const symbol=String(quote.security?.code||'').replace(/^US\./,'');
        if(selected.includes(symbol)&&Number.isFinite(quote.cur_price)) {state.stockQuotes.set(symbol,{...quote,stale:false,checkedAt:result.body.checkedAt});found.add(symbol);}
      }
      const missing=selected.filter(symbol=>!found.has(symbol));if(missing.length){state.stockFailure=true;state.stockMissingSymbols.push(...missing);for(const symbol of missing){const old=state.stockQuotes.get(symbol);if(old)state.stockQuotes.set(symbol,{...old,stale:true});}}
      state.stockCheckedAt=result.body.checkedAt||state.stockCheckedAt;emit();
    }
  }
  function run(refresh) {
    if(active)return active;
    state.busy=true;state.phase=refresh?'refreshing':'loading';state.sourceChecks.clear();emit();
    active=(async()=>{try {
      await Promise.all([refresh?library.refresh():library.load(),market(refresh),stockStatus()]);
      await stocks();
      if(refresh&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('pcr-data-refresh',{detail:{alreadyRefreshed:true}}));
      state.phase='ready';
    }finally{state.busy=false;active=null;emit();}})();
    return active;
  }
  return {state,load:()=>run(false),refresh:()=>run(true)};
}

const WORDS={
  zh:{title:'市场解读',documentTitle:'市场解读 · PCR 观察台',dashboard:'PCR 观察台',options:'期权异动',reviews:'定时复核',charts:'图表目录',eyebrow:'价格与 PCR',subtitle:'看价格强弱，也看 Put 相对 Call 的成交活跃度。',refresh:'更新解读数据',refreshing:'正在更新…',loading:'正在读取已发布数据…',ready:'解读依据本页已加载的数据。各项日期分别显示。',failure:'部分来源检查失败或仍有缺口，已保留可用数据及其日期。',facts:'已加载数据怎么读',watchlist:'当前关注名单',watchNote:'单日、20／60 日为 OCC 完整日成交量 PCR。',empty:'关注名单为空，请到观察台添加标的。',uninitialized:'关注名单尚未设置，请先到观察台保存名单。',profileError:'暂时无法读取关注名单，未改用默认名单。',symbol:'标的',daily:'单日 PCR／日期',p20:'20 日 PCR',p60:'60 日 PCR',price:'moomoo 价格',quoteTime:'报价时间',table:'关注名单 PCR 与可用价格',macroMissing:'三大指数报价尚未完整取得，暂不作价格方向判断。',macro:'三大指数：{values}。{direction}；仅反映各自报价时点相对前收的表现。',macroPartial:'已取得 {count}/3 项指数报价：{values}。缺失项不参与判断。',allUp:'三项均上涨',allDown:'三项均下跌',mixed:'涨跌分化或持平',pcrMissing:'Cboe 的 20／60 日数据覆盖尚不足，暂不比较相对活跃度。',pcr:'Cboe {date}：{values}。20 日高于 60 日表示近期 Put 相对 Call 的成交更活跃，不能直接当作多空持仓比例或买卖信号。',comparison:'{key} 20日 {p20} {sign} 60日 {p60}',dates:'宏观行情检查 {market} · Cboe 数据 {date}，快照检查 {cboe}',noMoomoo:'当前环境没有可用的 moomoo 本地连接，个股价格留空；上方宏观行情来自 Yahoo Finance。',moomoo:'个股价格来自 moomoo；常规时段、盘后和夜盘分开显示，缺少独立时戳时不推定时间。',mooFailed:'部分 moomoo 报价未能更新，已有价格保留其原始时间。',quoteCheck:'moomoo 请求检查：{checked}；请求时间不等于成交时间。',regular:'常规',after:'盘后',overnight:'夜盘',noIndependent:'盘后／夜盘独立时间未提供',retained:'保留数据',short:'本页尚未连接最新正式股票空头报告，不据 PCR 推算实时空头股数。',back:'返回 PCR 观察台',archive:'查看 11/23 保存的市场解读',names:{sp500:'标普500',nasdaq:'纳斯达克综合',dow:'道琼斯'}},
  en:{title:'Market brief',documentTitle:'Market brief · PCR Dashboard',dashboard:'PCR Dashboard',options:'Options activity',reviews:'Scheduled reviews',charts:'Chart library',eyebrow:'Prices and PCR',subtitle:'Read price strength alongside relative put and call activity.',refresh:'Update brief data',refreshing:'Updating…',loading:'Loading published observations…',ready:'This brief uses the data loaded on this page. Each dataset keeps its own date.',failure:'Some sources failed or still have gaps. Available data and its dates are retained.',facts:'Reading the loaded data',watchlist:'Current watchlist',watchNote:'Daily and 20/60-session PCR use completed-day OCC option volume.',empty:'Your watchlist is empty. Add symbols on the dashboard.',uninitialized:'Set up and save your watchlist on the dashboard first.',profileError:'The saved watchlist could not be read; no default list was substituted.',symbol:'Symbol',daily:'Daily PCR / date',p20:'20-session PCR',p60:'60-session PCR',price:'moomoo price',quoteTime:'Quote time',table:'Watchlist PCR and available prices',macroMissing:'The three major index quotes are unavailable, so no price-direction assessment is made.',macro:'Major indexes: {values}. {direction}, measured against each source’s previous close at its quoted time.',macroPartial:'{count}/3 index quotes available: {values}. Missing observations are excluded.',allUp:'All three advanced',allDown:'All three declined',mixed:'Performance was mixed or flat',pcrMissing:'Cboe coverage is insufficient for a 20/60-session activity comparison.',pcr:'Cboe {date}: {values}. A 20-session PCR above the 60-session PCR indicates more recent relative put activity. It is not a long/short position share or a trading signal.',comparison:'{key}: 20-day {p20} {sign} 60-day {p60}',dates:'Macro quotes checked {market} · Cboe activity {date}, snapshot checked {cboe}',noMoomoo:'No local moomoo connection is available here. Stock prices remain blank; the macro quotes above come from Yahoo Finance.',moomoo:'Stock prices come from moomoo. Regular, after-hours, and overnight sessions are separate; missing independent timestamps are not inferred.',mooFailed:'Some moomoo quotes could not be updated. Retained observations keep their original times.',quoteCheck:'moomoo request checked: {checked}; retrieval time is not trade time.',regular:'Regular',after:'After-hours',overnight:'Overnight',noIndependent:'No independent after-hours/overnight timestamp provided',retained:'Retained data',short:'This page has no current official stock short-interest feed. PCR is not used to estimate a real-time short-share balance.',back:'Back to PCR Dashboard',archive:'View the saved Nov 23 market brief',names:{sp500:'S&P 500',nasdaq:'Nasdaq Composite',dow:'Dow Jones'}},
};

WORDS.zh.price='moomoo 常规时段价格';
WORDS.en.price='moomoo regular-session price';
WORDS.zh.quoteTime='常规报价时点（美东）';
WORDS.en.quoteTime='Regular quote time (ET)';
Object.assign(WORDS.zh,{sourceHeading:'来源状态与日期',sourceLoading:'正在读取该来源。',sourceProfileUnavailable:'关注名单尚未读取，暂不推定标的范围。',sourceFailure:'以下来源检查失败：{sources}。可用记录保留原日期，具体原因见下方。',sourceWarning:'部分来源处于冷却、数据补齐或保留状态，具体范围与日期见下方。',sourceWaiting:'数据已按各来源日期载入；部分完整日记录仍在等待发布。',sourceProfile:'关注名单',sourceMarket:'Yahoo Finance · 宏观行情',sourceOcc:'OCC · 关注名单成交量',sourceCboe:'Cboe · 市场 PCR',sourceStocks:'moomoo · 个股报价',sourceCloud:'moomoo 云端 API · 个股报价',sourceDesktop:'moomoo 桌面接口 · 个股报价',levelOk:'已取得记录',levelInfo:'说明',levelWarning:'待处理 / 保留',levelError:'检查失败',sourceFailed:'请求检查失败{details}。',sourceNetwork:'网络或超时',sourceErrorCount:'{count} 项未能核实',sourceCooldown:'查询冷却中{seconds}，不是数据源报错。',sourceRetrySeconds:'，约 {seconds} 秒后可重试',sourceBusy:'已有查询正在进行。',sourcePublicationWait:'等待源发布完整日记录；现有数据日期保持不变。',sourcePartial:'仅部分记录可用；未取得的项目继续留空。',sourceGaps:'历史及预热范围仍有 {count} 个交易日缺口；受影响的滚动窗口留空。',sourceRetained:'部分报价保留上次值，来源时间没有更新。',sourceOlderRetained:'来源返回了更旧记录，继续保留已核实的较新日期。',sourceQuoteFailed:'以下行情项目未能更新：{symbols}。',sourceQuotesMissing:'尚未取得完整报价：{symbols}。',sourceDataMissing:'尚无可核实数据{symbols}。',sourceNoSymbols:'关注名单为空，没有对应标的需要查询。',sourceNotConfigured:'当前没有已配置的 moomoo 报价连接，个股价格留空。',sourceProfileFailed:'未能读取关注名单，未改用固定默认名单。',sourceUninitialized:'关注名单尚未设置。',sourceEmpty:'关注名单为空。',sourceInvalidResponse:'来源响应没有可识别的报价字段。',sourceSymbols:'标的：{symbols}',sourceDate:'数据截至 {date}；检查 {checked}',sourceQuoteDate:'报价时点：{values}',sourceStockDate:'报价时点：{values}；请求检查 {checked}',sourceNoDate:'日期未披露',sourceNone:'未取得',sourceChecked:'请求检查 {checked}',sourceDetailsSuffix:'（保留）',quoteCheckProvider:'{provider}请求检查：{checked}；请求时间不等于成交时间。'});
Object.assign(WORDS.en,{sourceHeading:'Source status and dates',sourceLoading:'Reading this source.',sourceProfileUnavailable:'The watchlist has not been read; no symbol scope is assumed.',sourceFailure:'These source checks failed: {sources}. Available records retain their original dates; details follow.',sourceWarning:'Some sources are cooling down, incomplete or retaining prior records. Their scope and dates are listed below.',sourceWaiting:'Records are loaded with their source dates. Some completed-day reports are awaiting publication.',sourceProfile:'Watchlist',sourceMarket:'Yahoo Finance · macro quotes',sourceOcc:'OCC · watchlist volume',sourceCboe:'Cboe · market PCR',sourceStocks:'moomoo · stock quotes',sourceCloud:'moomoo cloud API · stock quotes',sourceDesktop:'moomoo desktop · stock quotes',levelOk:'Records available',levelInfo:'Information',levelWarning:'Pending / retained',levelError:'Check failed',sourceFailed:'The request check failed{details}.',sourceNetwork:'network or timeout',sourceErrorCount:'{count} observations could not be verified',sourceCooldown:'The query is cooling down{seconds}; this is not a source error.',sourceRetrySeconds:'; retry in about {seconds} seconds',sourceBusy:'A query is already in progress.',sourcePublicationWait:'Waiting for completed-day source records. Existing activity dates are unchanged.',sourcePartial:'Only some records are available. Missing observations stay blank.',sourceGaps:'There are {count} missing sessions in history or warmup. Affected rolling windows remain blank.',sourceRetained:'Some quotes retain previous values and their original source times.',sourceOlderRetained:'The source returned older records; newer verified dates are retained.',sourceQuoteFailed:'These quote items could not be updated: {symbols}.',sourceQuotesMissing:'Complete quotes have not been retrieved: {symbols}.',sourceDataMissing:'No verified records are available{symbols}.',sourceNoSymbols:'The watchlist is empty; there are no symbols to query.',sourceNotConfigured:'No moomoo quote connection is configured. Stock prices remain blank.',sourceProfileFailed:'The watchlist could not be read; a fixed default list was not substituted.',sourceUninitialized:'The watchlist has not been set up.',sourceEmpty:'The watchlist is empty.',sourceInvalidResponse:'The response had no recognizable quote fields.',sourceSymbols:'Symbols: {symbols}',sourceDate:'Activity through {date}; checked {checked}',sourceQuoteDate:'Quote times: {values}',sourceStockDate:'Quote times: {values}; request checked {checked}',sourceNoDate:'Date not disclosed',sourceNone:'Not retrieved',sourceChecked:'Request checked {checked}',sourceDetailsSuffix:' (retained)',quoteCheckProvider:'{provider} request checked: {checked}; request time is not trade time.'});
WORDS.zh.names.oil='WTI 原油';WORDS.zh.names.gold='黄金';WORDS.en.names.oil='WTI crude';WORDS.en.names.gold='Gold';
WORDS.zh.names.bitcoin='比特币 BTC/USD';WORDS.en.names.bitcoin='Bitcoin BTC/USD';
WORDS.zh.noMoomoo=WORDS.zh.sourceNotConfigured;WORDS.en.noMoomoo=WORDS.en.sourceNotConfigured;

export function mountMarketBrief(documentRoot=document) {
  const button=documentRoot.getElementById('brief-refresh');if(!button)return null;
  const find=id=>documentRoot.getElementById(id),w=()=>WORDS[getLanguage()==='en'?'en':'zh'];
  const text=(key,values={})=>w()[key].replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));
  const number=value=>Number.isFinite(value)?value.toFixed(2):'—';
  const time=value=>{if(!value)return '—';const stamp=new Date(typeof value==='number'?value*1000:value);return Number.isFinite(stamp.valueOf())?new Intl.DateTimeFormat(getLanguage()==='en'?'en-US':'zh-CN',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp)+' ET':String(value);};
  const controller=createMarketBriefController({onChange:render});
  let sourceDetailsManual=false;
  find('brief-source-details').querySelector('summary').addEventListener('click',()=>{sourceDetailsManual=true;});
  const sourceName=source=>text(({profile:'sourceProfile',market:'sourceMarket',occ:'sourceOcc',cboe:'sourceCboe',stocks:source.provider==='moomoo_webapi'?'sourceCloud':source.provider==='moomoo_desktop'?'sourceDesktop':'sourceStocks'})[source.id]);
  const symbolList=reason=>(reason.symbols||reason.ids?.map(id=>w().names[id]||id)||[]).join(' · ');
  function reasonText(reason){
    if(reason.reason==='failed'){const details=[reason.httpStatus?`HTTP ${reason.httpStatus}`:reason.httpStatus===0?text('sourceNetwork'):'',reason.code||'',reason.errorCount?text('sourceErrorCount',{count:reason.errorCount}):'',symbolList(reason)].filter(Boolean).join(' / ');return text('sourceFailed',{details:details?' ('+details+')':''});}
    if(reason.reason==='cooldown')return text('sourceCooldown',{seconds:Number.isFinite(reason.seconds)?text('sourceRetrySeconds',{seconds:reason.seconds}):''});
    const key=({loading:'sourceLoading',profileUnavailable:'sourceProfileUnavailable',busy:'sourceBusy',publicationWait:'sourcePublicationWait',partial:'sourcePartial',gaps:'sourceGaps',retained:'sourceRetained',olderRetained:'sourceOlderRetained',quoteFailed:'sourceQuoteFailed',quotesMissing:'sourceQuotesMissing',dataMissing:'sourceDataMissing',noSymbols:'sourceNoSymbols',notConfigured:'sourceNotConfigured',profileFailed:'sourceProfileFailed',uninitialized:'sourceUninitialized',empty:'sourceEmpty',invalidResponse:'sourceInvalidResponse'})[reason.reason];
    const symbols=symbolList(reason);return text(key,{count:reason.count,symbols:reason.reason==='dataMissing'?(symbols?' ('+symbols+')':''):symbols})+(!['quoteFailed','quotesMissing','dataMissing'].includes(reason.reason)&&symbols?' '+text('sourceSymbols',{symbols}):'');
  }
  function sourceDates(source){
    if(source.id==='occ'){const groups=new Map();for(const row of source.records||[]){const key=(row.date||'—')+'|'+(row.checkedAt||'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}return [...groups.values()].map(rows=>rows.map(row=>row.symbol).join(' · ')+': '+text('sourceDate',{date:rows[0].date||'—',checked:time(rows[0].checkedAt)})).join('； ');}
    if(source.id==='cboe')return text('sourceDate',{date:source.date||'—',checked:time(source.checkedAt)});
    if(source.id==='market')return text('sourceQuoteDate',{values:(source.quotes||[]).map(quote=>w().names[quote.id]+' '+time(quote.marketTime)).join(' · ')||text('sourceNone')})+' · '+text('sourceChecked',{checked:time(source.checkedAt)});
    if(source.id==='stocks')return text('sourceStockDate',{values:(source.quotes||[]).map(quote=>String(quote.security?.code||'').replace(/^US\./,'')+' '+(quote.update_time||time(quote.update_timestamp))+(quote.stale?text('sourceDetailsSuffix'):'')).join(' · ')||text('sourceNone'),checked:time(source.checkedAt)});
    return '';
  }
  function renderSources(state){
    const sources=briefSourceStatuses(state),errors=sources.filter(source=>source.level==='error'),warnings=sources.filter(source=>source.level==='warning'),waiting=sources.some(source=>source.reasons.some(reason=>reason.reason==='publicationWait'));
    find('brief-status').className='status'+(errors.length?' error':warnings.length?' warning':'');
    find('brief-status').textContent=errors.length?text('sourceFailure',{sources:errors.map(sourceName).join(' · ')}):state.busy?text('loading'):warnings.length?text('sourceWarning'):waiting?text('sourceWaiting'):text('ready');
    find('brief-source-status-heading').textContent=text('sourceHeading');if(!sourceDetailsManual)find('brief-source-details').open=!!(errors.length||warnings.length);
    const host=find('brief-source-status');host.replaceChildren();for(const source of sources){const row=documentRoot.createElement('li');row.dataset.level=source.level;const heading=documentRoot.createElement('strong');heading.textContent=sourceName(source);const level=documentRoot.createElement('span');level.className='brief-source-level';level.textContent=text(({ok:'levelOk',info:'levelInfo',warning:'levelWarning',error:'levelError'})[source.level]);row.append(heading,level);for(const reason of source.reasons){const message=documentRoot.createElement('p');message.textContent=reasonText(reason);row.append(message);}const dates=sourceDates(source);if(dates){const note=documentRoot.createElement('p');note.className='brief-source-date';note.textContent=dates;row.append(note);}host.append(row);}
  }
  function renderMacro(macro){
    const host=find('brief-price-summary');host.replaceChildren();if(!macro.quotes.length){host.textContent=text('macroMissing');return;}
    const marker='\u0000',template=macro.quotes.length===3?text('macro',{values:marker,direction:text(macro.up===3?'allUp':macro.down===3?'allDown':'mixed')}):text('macroPartial',{count:macro.quotes.length,values:marker}),parts=template.split(marker);host.append(documentRoot.createTextNode(parts[0]));
    macro.quotes.forEach((quote,index)=>{if(index)host.append(documentRoot.createTextNode(' · '));host.append(documentRoot.createTextNode(w().names[quote.id]+' '));const percent=documentRoot.createElement('strong');percent.textContent=(quote.changePercent>0?'+':'')+number(quote.changePercent)+'%';host.append(percent);if(quote.stale)host.append(documentRoot.createTextNode(' ('+text('retained')+')'));});host.append(documentRoot.createTextNode(parts.slice(1).join(marker)));
  }
  function render(state=controller.state) {
    for(const [id,key]of Object.entries({'brief-title':'title','brief-nav-dashboard':'dashboard','brief-nav-options':'options','brief-nav-reviews':'reviews','brief-nav-current':'title','brief-nav-charts':'charts','brief-eyebrow':'eyebrow','brief-subtitle':'subtitle','brief-facts-title':'facts','brief-watchlist-title':'watchlist','brief-watchlist-note':'watchNote','brief-symbol-head':'symbol','brief-daily-head':'daily','brief-p20-head':'p20','brief-p60-head':'p60','brief-price-head':'price','brief-time-head':'quoteTime','brief-short-note':'short','brief-dashboard-link':'back','brief-archive-link':'archive'}))find(id).textContent=text(key);
    documentRoot.title=text('documentTitle');find('brief-table-region').setAttribute('aria-label',text('table'));
    button.disabled=state.busy;button.textContent=text(state.busy?'refreshing':'refresh');
    const records=state.library.records(),source=state.library.state;
    renderSources(state);renderMacro(briefMacroFacts(state.market));
    const pcr=briefPCRFacts(source.cboe.payload);
    find('brief-pcr-summary').textContent=pcr.series.length?text('pcr',{date:pcr.date,values:pcr.series.map(row=>text('comparison',{key:row.key==='etp'?'ETF/ETP':row.key.toUpperCase(),p20:number(row.r20),p60:number(row.r60),sign:row.r20>row.r60?'>':row.r20<row.r60?'<':'='})).join(' · ')}):text('pcrMissing');
    find('brief-source-dates').textContent=text('dates',{market:time(state.market?.checkedAt),date:pcr.date||'—',cboe:time(source.cboe.checkedAt)});
    const profile=source.profile;find('brief-empty').hidden=records.length>0;
    find('brief-empty').textContent=text(source.profileError?'profileError':profile?.initialized?'empty':'uninitialized');
    const body=find('brief-watchlist-rows');body.replaceChildren();
    for(const record of records) {
      const row=documentRoot.createElement('tr'),pcr=record.instrument?.rows?.at(-1),quote=state.stockQuotes.get(record.symbol);
      const daily=pcr?.c>0?pcr.p/pcr.c:null;
      const values=[record.symbol,number(daily),number(pcr?.r20),number(pcr?.r60),quote?number(quote.cur_price):'—',quote?(quote.update_time||time(quote.update_timestamp)):'—'];
      values.forEach((value,index)=>{const cell=documentRoot.createElement(index===0?'th':'td');if(index===0)cell.scope='row';cell.textContent=value;
        if(index===1){const date=documentRoot.createElement('small');date.textContent=record.date||'—';cell.append(date);}
        if(index===4&&quote){for(const [key,label]of [['after_market','after'],['overnight','overnight']])if(Number.isFinite(quote[key]?.price)){const extra=documentRoot.createElement('small');extra.className='brief-price-extra';extra.textContent=text(label)+' '+number(quote[key].price);cell.append(extra);}}
        if(index===5&&quote){if(quote.stale){const retained=documentRoot.createElement('small');retained.textContent=text('retained');cell.append(retained);}if([quote.after_market,quote.overnight].some(session=>session&&!session.update_time&&!session.update_timestamp)){const note=documentRoot.createElement('small');note.textContent=text('noIndependent');cell.append(note);}}row.append(cell);
      });body.append(row);
    }
    find('brief-moomoo-note').textContent=text(state.stockFailure?'mooFailed':state.stockStatus?.configured?'moomoo':'noMoomoo');
    find('brief-quote-check').textContent=state.stockCheckedAt?text('quoteCheckProvider',{provider:sourceName({id:'stocks',provider:state.stockStatus?.provider||state.stockProvider}),checked:time(state.stockCheckedAt)}):'';
  }
  button.addEventListener('click',()=>controller.refresh());window.addEventListener('pcr-language-change',()=>render());
  render();controller.load();return controller;
}

if(typeof document!=='undefined')mountMarketBrief();
