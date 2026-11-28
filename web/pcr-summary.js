import {getLanguage} from './i18n.js';
import {cboeMetricLabel} from './cboe-model.js';
import {summaryEntries,summaryRow,validSummaryDate} from './pcr-summary-model.js';
import {renderPcrInterpretation,clearPcrInterpretationHelp} from './pcr-interpretation-view.js';

const words={
  zh:{title:'PCR 变化摘要',intro:'跟随市场参考和关注名单；比较各行自己的实际数据日，不把 PCR 当作真实多空持仓比例。',date:'截至所选日期',dateHint:'日期与下方关注名单的日期选择同步。',loading:'正在读取已保存的参考与名单…',empty:'市场参考和关注名单暂无项目。',partial:'部分记录尚未加载或没有缓存；缺失值留空，未自动向来源刷新。',sourceNote:'Cboe 分类与 OCC 标的口径独立。5／20／60 日值沿用各自的合计成交量规则；分位只比较该行实际数据日前最多 252 个有效 20 日 PCR。',deltaNote:'变动＝单日 PCR－前一交易日单日 PCR，单位为倍，不是百分比。前一交易日缺失则留空。',slide:'表格宽于当前屏幕：左右滑动查看其余列，首列固定。',vs:'对比',stripTitle:'PCR 快照',stripNoteCboe:'Cboe 分类 · 单日 Put／Call 成交量比 · 截至所选日期，卡片右上为各自数据日',stripNoteMarket:'市场参考 · 单日 Put／Call 成交量比 · 截至所选日期，卡片右上为各自数据日',stripLink:'查看完整摘要',stripNoDelta:'无前一交易日对比',reading:'20／60 日比较与 5／20／60 日解读',openMarket:'查看市场历史：',openMarketHint:'在下方“市场历史”中选中此项；只读取已保存数据，不刷新来源，也不保存视图偏好。',name:'类别／标的',actual:'实际数据日',daily:'单日 PCR',change:'较前一交易日（倍）',p5:'5 日 PCR',p5Help:'5 日 PCR＝窗口内合计 Put 成交量 ÷ 合计 Call 成交量，不是每日 PCR 的算术平均。Cboe 使用 5 个预期交易日，OCC 使用最近 5 个已记录活动日；窗口不足或 Call 合计为 0 时留空。',p20:'20 日 PCR',p60:'60 日 PCR',rank:'20 日历史分位',cboe:'Cboe 分类汇总',market:'市场参考 · 股票与 ETF',watch:'关注标的',none:'未取得',waiting:'正在读缓存',noCache:'暂无可用缓存',retained:'本次读取失败，保留原记录',checked:'查询',samples:'样本',insufficient:'样本不足',previous:'对比',missingPrevious:'缺前一交易日记录',previousUnavailable:'前日 PCR 不可用',currentUnavailable:'当日 PCR 不可用',higher:'20 日 PCR 高于 60 日 PCR：最近 20 日的 Put 相对 Call 成交量比最近 60 日更高，表示近期 Put 交易相对更活跃；不等于净看空头寸，也不代表价格一定下跌。',lower:'20 日 PCR 低于 60 日 PCR：最近 20 日的 Put 相对 Call 成交量比最近 60 日更低，表示近期 Put 相对活跃度减弱；不等于净看多头寸，也不代表价格一定上涨。',equal:'20 日 PCR 等于 60 日 PCR：两个窗口的 Put／Call 成交量比例相同；不代表市场多空持仓相等或价格不会波动。',unknownTrend:'20 日或 60 日有效数据不足，无法比较；缺失值不当作 0。',trendHint:'标签比较的是 20 日与 60 日成交量 PCR；悬停或聚焦标签查看解释。'},
  en:{title:'PCR change summary',intro:'Follows your market references and watchlist. Each row keeps its own activity date; PCR is not a ratio of actual long/short positions.',date:'Through selected date',dateHint:'Uses the watchlist date selector below.',loading:'Loading saved references and watchlist…',empty:'There are no market references or watched symbols.',partial:'Some records are not loaded or cached. Missing values remain blank; sources are not refreshed automatically.',sourceNote:'Cboe categories and OCC symbols have separate coverage. Each source retains its aggregate-volume 5/20/60-session rules. Percentiles use up to 252 valid 20-session PCRs before that row’s actual date.',deltaNote:'Change = daily PCR minus the previous trading session’s daily PCR, in ratio units, not percent. Missing previous sessions remain blank.',slide:'The table is wider than this screen: scroll sideways for the remaining columns; the first column stays in place.',vs:'vs',stripTitle:'PCR snapshot',stripNoteCboe:'Cboe categories · daily put/call volume ratio · through the selected date; each card shows its own activity date',stripNoteMarket:'Market references · daily put/call volume ratio · through the selected date; each card shows its own activity date',stripLink:'Full summary',stripNoDelta:'No prior-session comparison',reading:'20 vs 60 · 5/20/60-session reading',openMarket:'Open market history: ',openMarketHint:'Selects this item in Market history below. Reads saved data only; does not refresh sources or save view preferences.',name:'Category / symbol',actual:'Actual activity date',daily:'Daily PCR',change:'Change vs prior session',p5:'5-session PCR',p5Help:'5-session PCR = total put volume ÷ total call volume in the window, not the arithmetic mean of daily PCRs. Cboe requires 5 expected sessions; OCC uses the latest 5 recorded activity sessions. Insufficient windows or zero total call volume remain blank.',p20:'20-session PCR',p60:'60-session PCR',rank:'20-session percentile',cboe:'Cboe category aggregates',market:'Market references · Stocks and ETFs',watch:'Watched symbols',none:'Unavailable',waiting:'Reading cache',noCache:'No available cache',retained:'Read failed; original record retained',checked:'Checked',samples:'Samples',insufficient:'Insufficient sample',previous:'Compared with',missingPrevious:'Previous session is missing',previousUnavailable:'Prior PCR is unavailable',currentUnavailable:'Daily PCR is unavailable',higher:'20-session PCR is above 60-session PCR: put volume relative to call volume is higher in the recent 20-session window. Puts are relatively more active; this is not net bearish positioning or a forecast of falling prices.',lower:'20-session PCR is below 60-session PCR: put volume relative to call volume is lower in the recent 20-session window. Puts are relatively less active; this is not net bullish positioning or a forecast of rising prices.',equal:'20-session PCR equals 60-session PCR: the windows have the same put/call volume ratio. This does not mean equal long/short positions or no price volatility.',unknownTrend:'Insufficient valid 20-session or 60-session data to compare. Missing observations are not zero.',trendHint:'Labels compare 20-session and 60-session volume PCR. Hover or focus a label for an explanation.'}
};
const validInstrument=value=>value&&Array.isArray(value.rows)&&value.rows.some(row=>validSummaryDate(row?.date));
const stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;

export function createPcrSummaryController({fetcher=globalThis.fetch,onChange=()=>{}}={}){
  let watch={items:[],instruments:{},ready:false,date:null},market={items:[],symbols:{},ready:false,history:null,historyBusy:false},generation=0;
  const symbols=new Map(),pending=new Map(),histories=new Map(),attemptedSymbols=new Set();let historyPending=null,recheckHistory=false;
  const state=()=>({watch,market,entries:summaryEntries(market.ready?market.items:[],watch.ready?watch.items:[])});
  function notify(){onChange(state());}
  function date(){return validSummaryDate(watch.date)?watch.date:null;}
  function bestSymbolRecord(symbol,includeCache=true){
    const candidates=[{instrument:watch.instruments?.[symbol],checkedAt:watch.checkedBySymbol?.[symbol]||watch.checkedAt,priority:3},{...market.symbols?.[symbol],priority:2},...(includeCache?[{...symbols.get(symbol),priority:1}]:[])].filter(value=>validInstrument(value.instrument));
    return candidates.sort((a,b)=>(a.instrument.rows.at(-1)?.date||'').localeCompare(b.instrument.rows.at(-1)?.date||'')||stamp(a.checkedAt)-stamp(b.checkedAt)||a.priority-b.priority).at(-1)||null;
  }
  const bestSymbol=symbol=>bestSymbolRecord(symbol)?.instrument||null;
  function history(){
    const day=date(),candidate=market.history;
    const covers=value=>value&&Array.isArray(value.rows)&&(value.requestedEnd>=day||value.rows.at(-1)?.date>=day);
    const candidates=[...(covers(candidate)?[candidate]:[]),histories.get(day)].filter(Boolean);
    return candidates.sort((a,b)=>(a.rows?.findLast(row=>row.date<=day)?.date||'').localeCompare(b.rows?.findLast(row=>row.date<=day)?.date||'')||stamp(a.checkedAt)-stamp(b.checkedAt)).at(-1)||null;
  }
  function rows(){return state().entries.map(entry=>summaryRow(entry,{date:date(),instrument:entry.type==='symbol'?bestSymbol(entry.symbol):null,cboeHistory:history(),checkedAt:entry.type==='cboe'?history()?.checkedAt:bestSymbolRecord(entry.symbol)?.checkedAt,
    loading:entry.type==='cboe'?!!historyPending||market.historyBusy:pending.has(entry.symbol),failed:entry.type==='cboe'?market.historyFailed||histories.get(date())?.failed===true:bestSymbolRecord(entry.symbol)?.failed===true}));}
  function prune(){const desired=new Set(state().entries.filter(entry=>entry.type==='symbol').map(entry=>entry.symbol));for(const [symbol,request]of pending)if(!desired.has(symbol)){request.controller.abort();pending.delete(symbol);}for(const symbol of symbols.keys())if(!desired.has(symbol))symbols.delete(symbol);for(const symbol of attemptedSymbols)if(!desired.has(symbol))attemptedSymbols.delete(symbol);}
  async function loadSymbol(symbol){
    if(pending.has(symbol)||attemptedSymbols.has(symbol)||bestSymbolRecord(symbol,false))return;
    attemptedSymbols.add(symbol);const previous=symbols.get(symbol),controller=new AbortController(),record={controller};pending.set(symbol,record);notify();
    try{const response=await fetcher('/api/symbol?symbol='+encodeURIComponent(symbol),{credentials:'same-origin',headers:{'x-pcr-cache-only':'1'},signal:controller.signal});const payload=await response.json();if(pending.get(symbol)!==record||!state().entries.some(entry=>entry.symbol===symbol))return;
      if(!response.ok||payload.symbol!==symbol)throw Error('SUMMARY_CACHE_UNAVAILABLE');symbols.set(symbol,{instrument:validInstrument(payload.instrument)?payload.instrument:null,checkedAt:payload.checkedAt||null,failed:false});
    }catch{if(pending.get(symbol)===record)symbols.set(symbol,{...(previous||{instrument:null,checkedAt:null}),failed:true});}
    finally{if(pending.get(symbol)===record){pending.delete(symbol);notify();queue();}}
  }
  async function loadHistory(){
    const day=date();if(!day||!recheckHistory&&history()||!state().entries.some(entry=>entry.type==='cboe')||market.historyBusy)return;
    if(historyPending?.day===day)return;historyPending?.controller.abort();const token=++generation,controller=new AbortController();historyPending={day,controller};notify();
    recheckHistory=false;
    try{const response=await fetcher('/api/cboe/history?'+new URLSearchParams({end:day,range:'all'}),{credentials:'same-origin',headers:{'x-pcr-cache-only':'1'},signal:controller.signal});const payload=await response.json();if(token!==generation||day!==date())return;if(!response.ok||!Array.isArray(payload.rows))throw Error('SUMMARY_HISTORY_UNAVAILABLE');histories.set(day,payload);}
    catch{if(token===generation&&day===date()){const previous=histories.get(day);histories.set(day,{...(previous||{}),rows:previous?.rows||[],failed:true});}}
    finally{if(token===generation){historyPending=null;while(histories.size>12)histories.delete(histories.keys().next().value);notify();}}
  }
  function ensure(){prune();void loadHistory();let available=Math.max(0,2-pending.size);for(const entry of state().entries)if(available&&entry.type==='symbol'&&!pending.has(entry.symbol)&&!attemptedSymbols.has(entry.symbol)&&!bestSymbolRecord(entry.symbol,false)){available--;void loadSymbol(entry.symbol);}}
  let queued=false;
  function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;ensure();});}
  return {
    updateWatch(value){watch={...watch,...value};if(historyPending&&historyPending.day!==date()){generation++;historyPending.controller.abort();historyPending=null;}notify();queue();},
    updateMarket(value){market={...market,...value};notify();queue();},
    refresh(){generation++;historyPending?.controller.abort();historyPending=null;recheckHistory=true;for(const request of pending.values())request.controller.abort();pending.clear();attemptedSymbols.clear();notify();queue();},
    get state(){return state();},get rows(){return rows();},
    dispose(){generation++;historyPending?.controller.abort();for(const request of pending.values())request.controller.abort();pending.clear();}
  };
}

function mountSummary(root){
  const create=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  const heading=create('div','section-heading'),headingCopy=create('div'),title=create('h2'),intro=create('p');title.id='pcr-summary-heading';headingCopy.append(title,intro);heading.append(headingCopy);
  const selected=create('div','summary-date'),dateLabel=create('label'),dateCaption=create('span'),dateInput=create('input'),dateHint=create('small');dateInput.type='date';dateInput.id='summary-date-input';dateLabel.htmlFor=dateInput.id;dateLabel.append(dateCaption,dateInput);selected.append(dateLabel,dateHint);
  const status=create('p','metric-note summary-status'),help=create('p','metric-note summary-scroll-hint'),wrap=create('div','summary-table-scroll'),deltaHelp=create('p','metric-note'),trendHelp=create('p','metric-note'),sourceHelp=create('p','metric-note');
  status.setAttribute('role','status');wrap.tabIndex=0;wrap.setAttribute('role','region');root.append(heading,selected,status,help,wrap,deltaHelp,trendHelp,sourceHelp);
  const tooltip=create('div','pcr-info-tooltip');tooltip.id='summary-info-tooltip';tooltip.role='tooltip';tooltip.hidden=true;document.body.append(tooltip);
  let infoOwner=null;
  function info(label,explanation,className=''){
    const button=create('button','pcr-info-trigger '+className,label);button.type='button';button.setAttribute('aria-describedby',tooltip.id);
    const show=()=>{infoOwner={button,show};tooltip.textContent=explanation;tooltip.hidden=false;const rect=button.getBoundingClientRect(),width=Math.min(320,innerWidth-24);tooltip.style.width=width+'px';tooltip.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px';tooltip.style.top=Math.max(12,Math.min(rect.bottom+8,innerHeight-tooltip.offsetHeight-12))+'px';};
    const hide=()=>{tooltip.hidden=true;infoOwner=null;};button.addEventListener('mouseenter',show);button.addEventListener('focus',show);button.addEventListener('mouseleave',()=>{if(document.activeElement!==button)hide();});button.addEventListener('blur',hide);button.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});return button;
  }
  window.addEventListener('scroll',()=>{if(infoOwner?.button===document.activeElement)infoOwner.show();else{tooltip.hidden=true;infoOwner=null;}},{passive:true});
  let scheduled=false;
  const controller=createPcrSummaryController({onChange(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}});
  function render(){
    clearPcrInterpretationHelp(root);
    tooltip.hidden=true;infoOwner=null;
    const language=getLanguage()==='en'?'en':'zh',copy=words[language],locale=language==='en'?'en-US':'zh-CN',state=controller.state,rows=controller.rows;
    const format=value=>Number.isFinite(value)?new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:3}).format(value):'—';
    const time=value=>{if(!stamp(value))return null;return new Intl.DateTimeFormat(locale,{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' ET';};
    title.textContent=copy.title;intro.textContent=copy.intro;root.setAttribute('aria-labelledby',title.id);root.setAttribute('aria-label',copy.title);
    dateCaption.textContent=copy.date;dateHint.textContent=copy.dateHint;dateInput.min=state.watch.minDate||'';dateInput.max=state.watch.maxDate||'';dateInput.disabled=!validSummaryDate(state.watch.date)||!dateInput.min||!dateInput.max;
    if(document.activeElement!==dateInput||dateInput.dataset.currentDate!==state.watch.date)dateInput.value=state.watch.date||'';dateInput.dataset.currentDate=state.watch.date||'';
    status.textContent=state.watch.failed||state.market.failed?(language==='en'?'Some lists could not be read. Available data remain; retry list settings.':'部分名单未能读取；已取得的数据保留，请重试页面中的名单设置。'):!state.watch.ready||!state.market.ready?copy.loading:!rows.length?copy.empty:rows.some(row=>!row.actualDate||row.failed)?copy.partial:'';wrap.setAttribute('aria-label',copy.title);
    // Display only: values keep their previous rounding; figure spaces pad
    // shorter fractions so decimal points line up in right-aligned columns.
    const pad=(text,max)=>{const fraction=text.split('.')[1]?.replace(/\D/g,'').length??0;return text+' '.repeat(Math.max(0,max-fraction));};
    const pcr=value=>Number.isFinite(value)?pad(format(value),3):'—';
    const stateTag=(kind,text)=>{const tag=create('small','summary-state',text);tag.dataset.state=kind;return tag;};
    const table=create('table','summary-table'),caption=create('caption','sr-only',copy.title),thead=create('thead'),header=create('tr');
    const columns=[[copy.name,'summary-col-name'],[copy.actual,'summary-col-date'],[copy.daily,'summary-col-num'],[copy.change,'summary-col-num'],[copy.p5,'summary-col-num'],[copy.p20,'summary-col-num'],[copy.p60,'summary-col-num'],[copy.reading,'summary-col-reading'],[copy.rank,'summary-col-num']];
    for(const [label,className] of columns){const cell=create('th',className);if(label===copy.p5)cell.append(info(label,copy.p5Help,'summary-p5-help'));else cell.textContent=label;cell.scope='col';header.append(cell);}thead.append(header);table.append(caption,thead);
    for(const group of ['cboe','market','watch']){
      const members=rows.filter(row=>row.group===group);if(!members.length)continue;const body=create('tbody'),groupRow=create('tr','summary-group'),groupTitle=create('th');groupTitle.append(create('span',null,copy[group]));groupTitle.colSpan=9;groupTitle.scope='rowgroup';groupRow.append(groupTitle);body.append(groupRow);
      for(const row of members){
        const tr=create('tr');tr.dataset.summaryId=row.id;
        const label=row.type==='cboe'?cboeMetricLabel(row,language):row.symbol;
        const name=create('th','summary-name');name.scope='row';
        if(row.group==='watch')name.append(create('strong',null,label));
        else{const open=create('button','summary-open',label);open.type='button';open.dataset.summaryOpen=row.id;open.setAttribute('aria-label',copy.openMarket+label);open.title=copy.openMarketHint;name.append(open);}
        name.append(create('small','summary-source',row.source+(row.derived?(language==='en'?' · includes derived history':' · 含推算历史'):'')));tr.append(name);
        const actual=create('td','summary-actual');actual.append(create('span','summary-date-value',row.actualDate||'—'));const checked=time(row.checkedAt);if(checked)actual.append(create('small',null,copy.checked+' '+checked));if(!row.actualDate)actual.append(stateTag(row.loading?'loading':'missing',copy[row.loading?'waiting':'noCache']));if(row.failed)actual.append(stateTag(row.actualDate?'stale':'error',row.actualDate?copy.retained:language==='en'?'Read failed':'读取失败'));tr.append(actual);
        tr.append(create('td','summary-number',pcr(row.daily)));
        const change=create('td','summary-number summary-delta');let delta='—';if(Number.isFinite(row.delta)){delta=row.delta===0?pad('0.00',4):(row.delta>0?'+':'−')+(Math.abs(row.delta)<.0001?'<0.0001':pad(new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:4}).format(Math.abs(row.delta)),4));}change.append(create('span',null,delta));
        if(row.previousDate)change.append(create('small','summary-previous',copy.vs+' '+row.previousDate));
        const reason={missing_previous:'missingPrevious',previous_unavailable:'previousUnavailable',current_unavailable:'currentUnavailable'}[row.comparison];if(reason)change.append(stateTag('missing',copy[reason]));tr.append(change);
        tr.append(create('td','summary-number summary-r5',pcr(row.r5)),create('td','summary-number',pcr(row.r20)),create('td','summary-number',pcr(row.r60)));
        const operator={higher:'>',lower:'<',equal:'='}[row.trend],trendLabel=operator?(language==='en'?`20d ${operator} 60d`:`20日 ${operator} 60日`):(language==='en'?'20d vs 60d: —':'20日对60日：—');
        const reading=create('td','summary-reading'),trend=info(trendLabel,copy[row.trend==='unknown'?'unknownTrend':row.trend],'summary-trend-help');trend.setAttribute('aria-label',(language==='en'?'20-session vs 60-session PCR: ':'20 日与 60 日 PCR：')+(operator?trendLabel:'—'));
        const detail=create('div');renderPcrInterpretation(detail,row.interpretation,{language,source:row.source,compact:true,dense:true});reading.append(trend,detail);tr.append(reading);
        const rank=create('td','summary-number summary-rank');rank.append(create('span',null,Number.isFinite(row.percentile)?new Intl.NumberFormat(locale,{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(row.percentile):'—'),create('small',null,`${copy.samples} ${row.samples}/252`));if(row.samples<252)rank.append(stateTag('missing',copy.insufficient));tr.append(rank);body.append(tr);
      }table.append(body);
    }
    renderStrip({rows,copy,language,locale,pcr,pad,stateTag,format});
    wrap.replaceChildren(table);help.textContent=copy.slide;deltaHelp.textContent=copy.deltaNote;trendHelp.textContent=copy.trendHint;sourceHelp.textContent=copy.sourceNote+(rows.some(row=>row.derived)?(language==='en'?' Derived EQUITY history subtracts INDEX and ETP put/call counts from TOTAL separately, then divides; PCRs are not subtracted.':' 标注的 EQUITY 推算历史为 TOTAL 分别减去 INDEX、ETP 的 Put／Call 张数后再相除，不是 PCR 相减。'):'');wrap.hidden=!rows.length;
    measure();
  }
  // Key-metrics strip: the same summary rows (no extra requests), Cboe categories
  // first, else up to four market references. Each card keeps its own date.
  const strip=document.getElementById('pcr-keystrip');
  function renderStrip({rows,copy,language,locale,pcr,stateTag,format}){
    // TOTAL (when selected) leads as the wider card; other items keep list order.
    if(!strip)return;const cboe=rows.filter(row=>row.group==='cboe'),pool=cboe.length?cboe:rows.filter(row=>row.group==='market'),lead=pool.find(row=>row.type==='cboe'&&row.key==='total'),picked=(lead?[lead,...pool.filter(row=>row!==lead)]:pool).slice(0,4);
    strip.hidden=!picked.length;if(!picked.length){strip.replaceChildren();return;}
    const head=create('div','keystrip-head'),titleNode=create('h2',null,copy.stripTitle),note=create('p',null,cboe.length?copy.stripNoteCboe:copy.stripNoteMarket),link=create('a','keystrip-link',copy.stripLink);
    titleNode.id='pcr-keystrip-title';link.href='#pcr-summary';head.append(titleNode,note,link);strip.setAttribute('aria-labelledby',titleNode.id);
    const grid=create('div','keystrip-grid');grid.classList.toggle('has-lead',!!lead);grid.dataset.count=String(picked.length);
    for(const row of picked){
      const card=create('article','keycard'),top=create('div','keycard-top'),label=row.type==='cboe'?cboeMetricLabel(row,language):row.symbol;if(row===lead)card.classList.add('is-lead');
      if(row.loading&&!row.actualDate)card.classList.add('is-loading');
      top.append(create('span','keycard-label',label),create('span','keycard-date',row.actualDate||'—'));
      const value=create('div','keycard-value',Number.isFinite(row.daily)?format(row.daily):'—');
      const delta=create('div','keycard-delta');
      if(Number.isFinite(row.delta)){const sign=row.delta>0?'+':row.delta<0?'−':'',size=Math.abs(row.delta);delta.dataset.direction=row.delta>0?'up':row.delta<0?'down':'flat';
        delta.append(create('span','keycard-arrow',row.delta>0?'▲':row.delta<0?'▼':'■'),create('span',null,sign+(size>0&&size<.0001?'<0.0001':new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:4}).format(size))));
        if(row.previousDate)delta.append(create('small',null,copy.vs+' '+row.previousDate.slice(5)));
        delta.setAttribute('aria-label',copy.change+': '+sign+size+(row.previousDate?' ('+copy.previous+' '+row.previousDate+')':''));}
      else delta.append(stateTag(row.loading?'loading':'missing',row.loading?copy.waiting:copy.stripNoDelta));
      const facts=create('dl','keycard-facts');
      // Short visible labels keep the four facts aligned; full names stay in aria-labels.
      const short=language==='en'?['5d PCR','20d PCR','60d PCR','20d pctl']:['5日 PCR','20日 PCR','60日 PCR','20日分位'];
      for(const [index,[term,text]] of [[copy.p5,pcr(row.r5)],[copy.p20,pcr(row.r20)],[copy.p60,pcr(row.r60)],[copy.rank,Number.isFinite(row.percentile)?new Intl.NumberFormat(locale,{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(row.percentile):'—']].entries()){const item=create('div'),dt=create('dt',null,short[index]);dt.title=term;item.setAttribute('aria-label',term+': '+text.trim());item.append(dt,create('dd',null,text.trim()));facts.append(item);}
      if(row.failed)card.append(stateTag(row.actualDate?'stale':'error',row.actualDate?copy.retained:(language==='en'?'Read failed':'读取失败')));
      card.prepend(top,value,delta,facts);grid.append(card);
    }
    strip.replaceChildren(head,grid);
  }
  // The hint and edge shadows appear only when the table really overflows.
  function measure(){
    const table=wrap.querySelector('table'),overflow=!!table&&!wrap.hidden&&table.scrollWidth>wrap.clientWidth+1;
    help.hidden=!overflow;wrap.classList.toggle('is-overflowing',overflow);
    wrap.classList.toggle('can-scroll-left',overflow&&wrap.scrollLeft>1);wrap.classList.toggle('can-scroll-right',overflow&&wrap.scrollLeft+wrap.clientWidth<wrap.scrollWidth-1);
  }
  wrap.addEventListener('scroll',measure,{passive:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(measure).observe(wrap);else window.addEventListener('resize',measure);
  wrap.addEventListener('click',event=>{const button=event.target.closest?.('button[data-summary-open]');if(button)window.dispatchEvent(new CustomEvent('pcr-summary-open-market',{detail:{id:button.dataset.summaryOpen}}));});
  dateInput.addEventListener('change',()=>{if(dateInput.value&&dateInput.checkValidity()&&validSummaryDate(dateInput.value))window.dispatchEvent(new CustomEvent('pcr-summary-date-select',{detail:{date:dateInput.value}}));});
  window.addEventListener('pcr-summary-watchlist',event=>controller.updateWatch(event.detail||{}));
  window.addEventListener('pcr-summary-market',event=>controller.updateMarket(event.detail||{}));
  window.addEventListener('pcr-data-refresh',()=>controller.refresh());
  window.addEventListener('pcr-language-change',()=>render());
  render();return controller;
}
if(typeof document!=='undefined'){const root=document.getElementById('pcr-summary');if(root)mountSummary(root);}
