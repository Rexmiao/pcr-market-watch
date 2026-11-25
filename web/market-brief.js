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

export function createMarketBriefController({fetcher=globalThis.fetch,onChange=()=>{}}={}) {
  const state={busy:false,phase:'initial',market:null,marketFailure:false,stockStatus:null,stockFailure:false,stockQuotes:new Map(),stockCheckedAt:null};
  const library=createChartLibraryController({fetcher,notifyMarketRefresh:false,onChange:()=>onChange(state)});
  state.library=library;
  let active=null;
  const emit=()=>onChange(state);
  async function request(path,post=false) {
    try {const response=await fetcher(path,{method:post?'POST':'GET',credentials:'same-origin',signal:AbortSignal.timeout(60000),...(post?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});return {ok:response.ok,body:await response.json()};}
    catch {return {ok:false,body:{}};}
  }
  async function market(refresh=false) {
    const result=await request(refresh?'/api/market/refresh':'/api/market',refresh),incoming=result.body;
    state.marketFailure=!result.ok||incoming.status==='failed'||incoming.status==='partial';
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
    const result=await request('/api/providers/moomoo/status');
    state.stockStatus=result.ok?result.body:{configured:false};emit();
  }
  async function stocks() {
    state.stockFailure=false;
    if(!state.stockStatus?.configured){state.stockFailure=state.stockQuotes.size>0;emit();return;}
    const symbols=(library.state.profile?.items||[]).map(row=>row.symbol);
    for(let offset=0;offset<symbols.length;offset+=20) {
      const selected=symbols.slice(offset,offset+20),result=await request('/api/providers/moomoo/quotes?symbols='+encodeURIComponent(selected.join(',')));
      const quotes=result.body.data?.basic_qot_list;
      if(!result.ok||!Array.isArray(quotes)){state.stockFailure=true;continue;}
      const found=new Set();
      for(const quote of quotes) {
        const symbol=String(quote.security?.code||'').replace(/^US\./,'');
        if(selected.includes(symbol)&&Number.isFinite(quote.cur_price)) {state.stockQuotes.set(symbol,{...quote,checkedAt:result.body.checkedAt});found.add(symbol);}
      }
      if(selected.some(symbol=>!found.has(symbol)))state.stockFailure=true;
      state.stockCheckedAt=result.body.checkedAt||state.stockCheckedAt;emit();
    }
  }
  function run(refresh) {
    if(active)return active;
    state.busy=true;state.phase=refresh?'refreshing':'loading';emit();
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
  zh:{title:'市场解读',documentTitle:'市场解读 · PCR 观察台',dashboard:'PCR 观察台',options:'期权异动',charts:'图表目录',eyebrow:'价格与 PCR',subtitle:'看价格强弱，也看 Put 相对 Call 的成交活跃度。',refresh:'更新解读数据',refreshing:'正在更新…',loading:'正在读取已发布数据…',ready:'解读依据本页已加载的数据。各项日期分别显示。',failure:'部分来源检查失败或仍有缺口，已保留可用数据及其日期。',facts:'已加载数据怎么读',watchlist:'当前关注名单',watchNote:'单日、20／60 日为 OCC 完整日成交量 PCR。',empty:'关注名单为空，请到观察台添加标的。',uninitialized:'关注名单尚未设置，请先到观察台保存名单。',profileError:'暂时无法读取关注名单，未改用默认名单。',symbol:'标的',daily:'单日 PCR／日期',p20:'20 日 PCR',p60:'60 日 PCR',price:'moomoo 价格',quoteTime:'报价时间',table:'关注名单 PCR 与可用价格',macroMissing:'三大指数报价尚未完整取得，暂不作价格方向判断。',macro:'三大指数：{values}。{direction}；仅反映各自报价时点相对前收的表现。',macroPartial:'已取得 {count}/3 项指数报价：{values}。缺失项不参与判断。',allUp:'三项均上涨',allDown:'三项均下跌',mixed:'涨跌分化或持平',pcrMissing:'Cboe 的 20／60 日数据覆盖尚不足，暂不比较相对活跃度。',pcr:'Cboe {date}：{values}。20 日高于 60 日表示近期 Put 相对 Call 的成交更活跃，不能直接当作多空持仓比例或买卖信号。',comparison:'{key} 20日 {p20} {sign} 60日 {p60}',dates:'宏观行情检查 {market} · Cboe 数据 {date}，快照检查 {cboe}',noMoomoo:'当前环境没有可用的 moomoo 本地连接，个股价格留空；上方宏观行情来自 Yahoo Finance。',moomoo:'个股价格来自 moomoo；常规时段、盘后和夜盘分开显示，缺少独立时戳时不推定时间。',mooFailed:'部分 moomoo 报价未能更新，已有价格保留其原始时间。',quoteCheck:'moomoo 请求检查：{checked}；请求时间不等于成交时间。',regular:'常规',after:'盘后',overnight:'夜盘',noIndependent:'盘后／夜盘独立时间未提供',retained:'保留数据',short:'本页尚未连接最新正式股票空头报告，不据 PCR 推算实时空头股数。',back:'返回 PCR 观察台',archive:'查看 11/23 保存的市场解读',names:{sp500:'标普500',nasdaq:'纳斯达克综合',dow:'道琼斯'}},
  en:{title:'Market brief',documentTitle:'Market brief · PCR Dashboard',dashboard:'PCR Dashboard',options:'Options activity',charts:'Chart library',eyebrow:'Prices and PCR',subtitle:'Read price strength alongside relative put and call activity.',refresh:'Update brief data',refreshing:'Updating…',loading:'Loading published observations…',ready:'This brief uses the data loaded on this page. Each dataset keeps its own date.',failure:'Some sources failed or still have gaps. Available data and its dates are retained.',facts:'Reading the loaded data',watchlist:'Current watchlist',watchNote:'Daily and 20/60-session PCR use completed-day OCC option volume.',empty:'Your watchlist is empty. Add symbols on the dashboard.',uninitialized:'Set up and save your watchlist on the dashboard first.',profileError:'The saved watchlist could not be read; no default list was substituted.',symbol:'Symbol',daily:'Daily PCR / date',p20:'20-session PCR',p60:'60-session PCR',price:'moomoo price',quoteTime:'Quote time',table:'Watchlist PCR and available prices',macroMissing:'The three major index quotes are unavailable, so no price-direction assessment is made.',macro:'Major indexes: {values}. {direction}, measured against each source’s previous close at its quoted time.',macroPartial:'{count}/3 index quotes available: {values}. Missing observations are excluded.',allUp:'All three advanced',allDown:'All three declined',mixed:'Performance was mixed or flat',pcrMissing:'Cboe coverage is insufficient for a 20/60-session activity comparison.',pcr:'Cboe {date}: {values}. A 20-session PCR above the 60-session PCR indicates more recent relative put activity. It is not a long/short position share or a trading signal.',comparison:'{key}: 20-day {p20} {sign} 60-day {p60}',dates:'Macro quotes checked {market} · Cboe activity {date}, snapshot checked {cboe}',noMoomoo:'No local moomoo connection is available here. Stock prices remain blank; the macro quotes above come from Yahoo Finance.',moomoo:'Stock prices come from moomoo. Regular, after-hours, and overnight sessions are separate; missing independent timestamps are not inferred.',mooFailed:'Some moomoo quotes could not be updated. Retained observations keep their original times.',quoteCheck:'moomoo request checked: {checked}; retrieval time is not trade time.',regular:'Regular',after:'After-hours',overnight:'Overnight',noIndependent:'No independent after-hours/overnight timestamp provided',retained:'Retained data',short:'This page has no current official stock short-interest feed. PCR is not used to estimate a real-time short-share balance.',back:'Back to PCR Dashboard',archive:'View the saved Nov 23 market brief',names:{sp500:'S&P 500',nasdaq:'Nasdaq Composite',dow:'Dow Jones'}},
};

WORDS.zh.price='moomoo 常规时段价格';
WORDS.en.price='moomoo regular-session price';
WORDS.zh.quoteTime='常规报价时点（美东）';
WORDS.en.quoteTime='Regular quote time (ET)';

export function mountMarketBrief(documentRoot=document) {
  const button=documentRoot.getElementById('brief-refresh');if(!button)return null;
  const find=id=>documentRoot.getElementById(id),w=()=>WORDS[getLanguage()==='en'?'en':'zh'];
  const text=(key,values={})=>w()[key].replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));
  const number=value=>Number.isFinite(value)?value.toFixed(2):'—';
  const time=value=>{if(!value)return '—';const stamp=new Date(typeof value==='number'?value*1000:value);return Number.isFinite(stamp.valueOf())?new Intl.DateTimeFormat(getLanguage()==='en'?'en-US':'zh-CN',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp)+' ET':String(value);};
  const controller=createMarketBriefController({onChange:render});
  function render(state=controller.state) {
    for(const [id,key]of Object.entries({'brief-title':'title','brief-nav-dashboard':'dashboard','brief-nav-options':'options','brief-nav-current':'title','brief-nav-charts':'charts','brief-eyebrow':'eyebrow','brief-subtitle':'subtitle','brief-facts-title':'facts','brief-watchlist-title':'watchlist','brief-watchlist-note':'watchNote','brief-symbol-head':'symbol','brief-daily-head':'daily','brief-p20-head':'p20','brief-p60-head':'p60','brief-price-head':'price','brief-time-head':'quoteTime','brief-short-note':'short','brief-dashboard-link':'back','brief-archive-link':'archive'}))find(id).textContent=text(key);
    documentRoot.title=text('documentTitle');find('brief-table-region').setAttribute('aria-label',text('table'));
    button.disabled=state.busy;button.textContent=text(state.busy?'refreshing':'refresh');
    const records=state.library.records(),source=state.library.state;
    const failure=state.marketFailure||state.stockFailure||source.profileError||records.some(row=>['failed','retained','cooldown'].includes(row.operation))||['failed','partial','cooldown'].includes(source.cboe.operation);
    find('brief-status').className='status'+(failure?' error':'');find('brief-status').textContent=text(state.busy?'loading':failure?'failure':'ready');
    const macro=briefMacroFacts(state.market),values=macro.quotes.map(quote=>w().names[quote.id]+' '+(quote.changePercent>0?'+':'')+number(quote.changePercent)+'%'+(quote.stale?' ('+text('retained')+')':'')).join(' · ');
    find('brief-price-summary').textContent=macro.quotes.length===3?text('macro',{values,direction:text(macro.up===3?'allUp':macro.down===3?'allDown':'mixed')}):macro.quotes.length?text('macroPartial',{count:macro.quotes.length,values}):text('macroMissing');
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
        if(index===5&&quote&&[quote.after_market,quote.overnight].some(session=>session&&!session.update_time&&!session.update_timestamp)){const note=documentRoot.createElement('small');note.textContent=text('noIndependent');cell.append(note);}row.append(cell);
      });body.append(row);
    }
    find('brief-moomoo-note').textContent=text(state.stockFailure?'mooFailed':state.stockStatus?.configured?'moomoo':'noMoomoo');
    find('brief-quote-check').textContent=state.stockCheckedAt?text('quoteCheck',{checked:time(state.stockCheckedAt)}):'';
  }
  button.addEventListener('click',()=>controller.refresh());window.addEventListener('pcr-language-change',()=>render());
  render();controller.load();return controller;
}

if(typeof document!=='undefined')mountMarketBrief();
