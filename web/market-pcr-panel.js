import {createHistoryComparison} from './history-comparison.js';
import {CBOE_METRICS,marketMetricEntry,isReferenceMetric,referenceHistoryPayload,cboeHistoryView,cboeChartConfig,cboeMetricLabel} from './cboe-model.js';
import {createMarketSettingsController,marketEntryId,normalizeMarketEntry,MARKET_ITEM_LIMIT} from './market-pcr-settings.js';
import {interpretPcr} from './pcr-interpretation.js';
import {renderPcrInterpretation} from './pcr-interpretation-view.js';

const languageKey='pcr-dashboard:language:v1',viewKey='pcr-dashboard:cboe-view:v1';
const cboeSource='https://www.cboe.com/markets/us/options/market-statistics/daily';
const coreSymbols=new Set(['NVDA','MU','SPY','QQQ','DIA','AVGO','AMD']);
const extra={
  zh:{publicTitle:'市场 PCR · 公共参考',publicSubtitle:'查看公开市场参考与历史趋势；可以更新数据，修改参考需要管理员登录。',title:'市场 PCR · 自定参考',subtitle:'自行添加或移除 Cboe 分类、股票与 ETF 参考，各自保留来源和数据日期。',manager:'管理市场参考',managerNote:'这份市场参考与下方个人自选相互独立，最多 40 项；移除不会删除行情历史。',settingsLoading:'正在读取市场参考设置…',settingsLocal:'市场参考已保存至本机数据库。',settingsCloud:'市场参考已保存至云端数据库。',settingsSaving:'正在保存市场参考…',settingsLoadError:'未能读取市场参考设置，管理暂时锁定；重试成功后才能修改。',settingsSaveError:'保存失败，仍保留原有参考，请重试。',settingsConflict:'另一处已更新这份市场参考；已载入新设置，请核对后再操作。',retry:'重新读取设置',remove:'移除 {name}',addMacroLabel:'Cboe 分类',addMacro:'添加分类',allMacros:'四个分类均已加入',tickerLabel:'股票／ETF 代码',tickerPlaceholder:'输入代码，例如 IWM',addTicker:'添加标的',adding:'正在核实行情…',invalidTicker:'请输入 1—10 位有效股票或 ETF 代码。',tickerFailure:'无法取得该代码的有效期权记录，未添加。已有参考仍保留。',duplicate:'该参考已在名单中。',limit:'最多可保存 40 项市场参考，请先移除一项。',personalLabel:'从个人自选中添加',personalPlaceholder:'选择一个个人自选标的',personalReload:'读取个人自选',personalAdd:'加入市场参考',personalFailure:'暂时无法读取个人自选；仍可直接输入代码添加。',personalEmpty:'个人自选暂无可添加的标的',emptyList:'市场参考暂无项目。打开“管理市场参考”即可添加分类、股票或 ETF。',referenceGroup:'股票与 ETF · OCC 成交量',scope:'Cboe 分类仅覆盖其公布范围；股票与 ETF 使用独立的 OCC 成交量数据。PCR＝Put 成交量÷Call 成交量，不是多空持仓人数比例。',referenceLoading:'正在检查所选标的的 OCC 数据，保留已取得的历史记录。',referenceFailure:'所选标的的 OCC 数据暂时不可用，保留最后可用记录；没有借用其他标的或 Cboe 的日期与数值。',occMethod:'5／20／60 日 PCR＝对应窗口内有记录交易日的合计 Put 成交量÷合计 Call 成交量，不是每日 PCR 的算术平均；数据不足留空。青绿色为 5 日、蓝色为 20 日、橘色为 60 日、灰色为单日。',macroPublished:'Cboe 单日卡统计日期',referenceValidated:'已核实 {symbol}，正在保存。'},
  en:{publicTitle:'Market PCR · Published references',publicSubtitle:'View published market references and historical trends. Refresh data here; changing references requires owner sign-in.',title:'Market PCR · Your references',subtitle:'Add or remove Cboe categories, stocks and ETFs, each with its own source and activity date.',manager:'Manage market references',managerNote:'This market list is independent of your personal watchlist below. Save up to 40 references; removing one does not delete price history.',settingsLoading:'Loading market-reference settings…',settingsLocal:'Market references are saved in this computer’s database.',settingsCloud:'Market references are saved in the cloud database.',settingsSaving:'Saving market references…',settingsLoadError:'Market settings could not be loaded. Editing is locked until a successful retry.',settingsSaveError:'Saving failed. The previous references are retained; please retry.',settingsConflict:'This market list changed elsewhere. The latest settings are loaded; review them before editing.',retry:'Reload settings',remove:'Remove {name}',addMacroLabel:'Cboe category',addMacro:'Add category',allMacros:'All four categories are included',tickerLabel:'Stock / ETF ticker',tickerPlaceholder:'Enter a ticker, e.g. IWM',addTicker:'Add reference',adding:'Verifying option data…',invalidTicker:'Enter a valid stock or ETF ticker of 1–10 characters.',tickerFailure:'Valid option records could not be retrieved for this ticker. It was not added; existing references are retained.',duplicate:'This reference is already in the list.',limit:'A maximum of 40 market references can be saved. Remove one first.',personalLabel:'Add from your personal watchlist',personalPlaceholder:'Choose a personal-watchlist symbol',personalReload:'Read personal watchlist',personalAdd:'Add to market references',personalFailure:'The personal watchlist is unavailable. You can still enter a ticker directly.',personalEmpty:'No additional personal-watchlist symbols are available',emptyList:'There are no market references. Open “Manage market references” to add a category, stock or ETF.',referenceGroup:'Stocks and ETFs · OCC volume',scope:'Cboe aggregates cover its published scope; stocks and ETFs use independent OCC volume data. PCR = put volume ÷ call volume, not the number of short versus long positions.',referenceLoading:'Checking OCC data for the selected symbol; available history remains visible.',referenceFailure:'OCC data for this symbol is unavailable. Its last good records are retained; dates or values from another symbol or Cboe are not substituted.',occMethod:'5/20/60-session PCR = total put volume ÷ total call volume over the corresponding recorded-session window, not the mean of daily PCRs. Insufficient windows remain blank. Teal: 5; blue: 20; orange: 60; gray: daily.',macroPublished:'Cboe daily-card activity date',referenceValidated:'Verified {symbol}; saving the reference.'}
};

export function mountMarketPcrPanel(root,text){
  for(const language of ['zh','en'])Object.assign(text[language],extra[language]);
  const style=document.createElement('style');
  style.textContent='.cboe-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:20px 0}.cboe-card{border:1px solid var(--border,#dfe5ed);border-radius:10px;padding:18px;min-width:0}.cboe-card h3{font-size:1rem;line-height:1.5}.cboe-value{display:block;font-size:2rem;font-weight:650;margin:12px 0 8px}.cboe-small{font-size:.875rem;line-height:1.75;color:#63718a;overflow-wrap:anywhere}.cboe-date-line{margin:12px 0}.cboe-empty{padding:12px;background:#edf2fa;border-radius:8px;margin-top:12px}.cboe-panel-controls{flex-wrap:wrap}.cboe-detail{margin-bottom:10px}.cboe-trend{border-top:1px solid var(--border,#dfe5ed);padding-top:22px;margin-top:24px}.cboe-trend h3{font-size:1.05rem;margin-bottom:16px}.cboe-history-controls{margin:14px 0 10px}.cboe-history-stats{padding-bottom:14px}.cboe-history-anchor{margin-top:14px;font-weight:500;color:#364965}.cboe-history-chart{min-height:330px;width:100%;min-width:0;max-width:100%;overflow:hidden}.cboe-source-line{margin-top:12px}.market-pcr-manager{margin:18px 0;padding:14px 16px;border:1px solid var(--border,#dfe5ed);border-radius:10px}.market-pcr-manager summary{cursor:pointer;font-weight:600}.market-pcr-items{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.market-pcr-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid #dfe5ed;border-radius:7px;padding:5px 8px;max-width:100%;font-size:.875rem}.market-pcr-chip span{overflow-wrap:anywhere}.market-pcr-chip button{font-size:1.1rem;border:0;background:transparent;color:#53647f;cursor:pointer;line-height:1.2;padding:2px 4px}.market-pcr-manager .controls{margin:14px 0 4px;align-items:flex-end;flex-wrap:wrap}.market-pcr-manager label{min-width:0;flex:1 1 160px}.market-pcr-manager input,.market-pcr-manager select{max-width:100%;min-width:0;width:100%}.market-pcr-manager button{max-width:100%;white-space:normal}.market-pcr-manager p{margin-top:10px}.market-pcr-notice:empty{display:none}[hidden]{display:none!important}@media(max-width:950px){.cboe-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.cboe-grid{grid-template-columns:1fr}.cboe-card{padding:16px}.cboe-panel-controls .button{white-space:normal}.cboe-history-stats{gap:10px}.cboe-history-stats span{font-size:.8125rem}.cboe-history-controls label{min-width:0;flex:1 1 150px}.market-pcr-manager{padding:12px}.market-pcr-manager .controls>.button{flex:1 1 130px}}';
  root.append(style);
  const content=document.createElement('div');
  content.innerHTML=`<div class="section-heading"><div><h2 id="cboe-heading"></h2><p id="cboe-subtitle"></p></div></div>
    <details data-owner-only id="market-pcr-manager" class="market-pcr-manager"><summary id="market-pcr-manager-title"></summary><p id="market-pcr-manager-note" class="cboe-small"></p><div id="market-pcr-items" class="market-pcr-items"></div>
      <p id="market-pcr-settings-status" class="cboe-small" role="status" aria-live="polite"></p><button id="market-pcr-settings-retry" class="button secondary" type="button" hidden></button>
      <div class="controls"><label><span id="market-add-cboe-label"></span><select id="market-add-cboe"></select></label><button id="market-add-cboe-button" class="button secondary" type="button"></button></div>
      <div class="controls"><label><span id="market-symbol-label"></span><input id="market-symbol-input" type="text" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false"></label><button id="market-add-symbol" class="button secondary" type="button"></button></div>
      <div class="controls"><label><span id="market-personal-label"></span><select id="market-personal-select"></select></label><button id="market-add-personal" class="button secondary" type="button"></button><button id="market-personal-reload" class="button secondary" type="button"></button></div><p id="market-pcr-notice" class="cboe-small market-pcr-notice" role="status" aria-live="polite"></p></details>
    <div id="market-pcr-empty" class="cboe-empty" role="status" hidden></div>
    <div class="controls cboe-panel-controls"><label><span id="cboe-date-label"></span><input id="cboe-date" type="date" min="2019-10-07"></label><button id="cboe-latest" class="button secondary" type="button"></button><button id="cboe-refresh" class="button secondary" type="button"></button></div>
    <p id="cboe-date-line" class="cboe-small cboe-date-line" aria-live="polite"></p><p id="cboe-status" class="cboe-small cboe-empty" role="status" aria-live="polite" hidden></p>
    <div id="cboe-card-grid" class="cboe-grid">${CBOE_METRICS.map(key=>`<article id="cboe-${key}-card" class="cboe-card"><h3 id="cboe-${key}-title"></h3><strong class="cboe-value" id="cboe-${key}-value">—</strong><p class="cboe-small cboe-detail" id="cboe-${key}-detail"></p><p class="cboe-small" id="cboe-${key}-volume"></p></article>`).join('')}</div>
    <p id="cboe-scope" class="metric-note"></p>
    <div id="market-etf-reference" class="pcr-navigation-target" role="region" aria-labelledby="cboe-trend-title" tabindex="-1"><div id="cboe-trend" class="cboe-trend"><h3 id="cboe-trend-title"></h3><div class="controls cboe-history-controls"><label><span id="cboe-metric-label"></span><select id="cboe-metric"></select></label><label><span id="cboe-range-label"></span><select id="cboe-range"><option value="126"></option><option value="252"></option><option value="all"></option></select></label></div>
    <p id="cboe-active-source" class="cboe-small" aria-live="polite"></p><p id="cboe-history-date" class="cboe-small" aria-live="polite"></p><p id="cboe-history-status" class="cboe-small cboe-empty" role="status" aria-live="polite" hidden></p><p id="cboe-history-anchor" class="cboe-small cboe-history-anchor"></p>
    <div class="stats pcr-four-stats cboe-history-stats"><div><span id="cboe-daily-label"></span><strong id="cboe-history-daily">—</strong></div><div><span id="cboe-p5-label"></span><strong id="cboe-history-p5">—</strong></div><div><span id="cboe-p20-label"></span><strong id="cboe-history-p20">—</strong></div><div><span id="cboe-p60-label"></span><strong id="cboe-history-p60">—</strong></div></div>
    <div id="cboe-pcr-reading" class="pcr-reading" aria-live="polite"></div><div id="cboe-history-chart" class="chart-host cboe-history-chart"></div><p id="cboe-history-method" class="metric-note"></p><p id="cboe-history-coverage" class="cboe-small cboe-source-line"></p></div></div>
    <p class="cboe-small cboe-source-line"><a id="cboe-source" target="_blank" rel="noopener noreferrer"></a></p>`;
  root.append(content);
  const find=id=>root.querySelector('#'+id);
  let language='zh',metric=null,preferred=null,range='252',requestedDate=null,adding=false,notice=null,personalSymbols=[],personalLoaded=false,personalBusy=false;
  try{language=localStorage.getItem(languageKey)==='en'?'en':'zh';const saved=JSON.parse(localStorage.getItem(viewKey)||'null');if(saved?.metric)preferred=marketEntryId(marketMetricEntry(saved.metric));if(['126','252','all'].includes(saved?.range))range=saved.range;}catch{}
  let snapshotData=null,snapshotBusy=false,snapshotGeneration=0,snapshotKey=null,historyData=null,historyBusy=false,historyError=false,historyRefresh=null,historyGeneration=0,historyKey=null,chart=null,chartLoader=null,chartGeneration=0,initialSelection=true;
  const comparison=createHistoryComparison({root:find('cboe-trend'),onChange:()=>render()});
  const snapshots=new Map(),histories=new Map(),symbolStates=new Map();
  const words=()=>text[language],say=(key,params={})=>(words()[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??''));
  const locale=()=>language==='en'?'en-US':'zh-CN';
  const dateNow=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
  const format=value=>Number.isFinite(value)?new Intl.NumberFormat(locale(),{minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'—';
  const count=value=>Number.isFinite(value)?new Intl.NumberFormat(locale()).format(value):words().missing;
  const checked=value=>{const stamp=value?new Date(value):null;return stamp&&Number.isFinite(stamp.valueOf())?new Intl.DateTimeFormat(locale(),{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp)+' ET':'—';};
  const entry=()=>metric?marketMetricEntry(metric):null;
  const macroItems=()=>settings.state.items.filter(item=>item.type==='cboe');
  const symbolState=symbol=>{if(!symbolStates.has(symbol))symbolStates.set(symbol,{payload:null,busy:false,error:false,retryAfterSeconds:null,generation:0,promise:null});return symbolStates.get(symbol);};
  const activeHistory=()=>!metric?null:isReferenceMetric(metric)?referenceHistoryPayload(symbolState(entry().symbol).payload,metric):historyData;
  const selected=()=>requestedDate||activeHistory()?.asof||(metric&&!isReferenceMetric(metric)?snapshotData?.snapshot?.date:null)||null;
  const editable=()=>!settings.state.readOnly&&settings.state.ready&&!settings.state.loading&&!settings.state.saving&&settings.state.error!=='load'&&!adding;
  function rememberView(){try{localStorage.setItem(viewKey,JSON.stringify({metric,range}));}catch{}}
  const settings=createMarketSettingsController({onChange(){
    const old=metric,ids=settings.state.items.map(marketEntryId);
    if(settings.state.ready){
      if(initialSelection){metric=ids.includes(preferred)?preferred:ids[0]||null;initialSelection=false;}
      else if(!ids.includes(metric))metric=ids[0]||null;
    }
    render();
    if(old!==metric){rememberView();if(metric)void loadSelected();}
  }});

  function renderChart(config){
    const token=++chartGeneration,host=find('cboe-history-chart');
    if(!config||!config.rows.length){host.hidden=true;return;}
    host.hidden=false;
    if(chart){chart.config=config;return;}
    chartLoader ||= import('https://persistent.oaistatic.com/plugins/visualize/charts/1.8.1/element.js');
    chartLoader.then(({mountChart})=>{if(token!==chartGeneration)return;chart=mountChart(host,config);}).catch(()=>{if(token===chartGeneration){find('cboe-history-status').hidden=false;find('cboe-history-status').textContent=words().historyFailure;}});
  }
  function fillOptions(select,options,value){select.replaceChildren(...options);if([...select.options].some(option=>option.value===value))select.value=value;}
  function option(value,label){const node=document.createElement('option');node.value=value;node.textContent=label;return node;}
  function renderManager(){
    const copy=words(),state=settings.state,canEdit=editable();
    for(const [id,key] of Object.entries({'market-pcr-manager-title':'manager','market-pcr-manager-note':'managerNote','market-pcr-settings-retry':'retry','market-add-cboe-label':'addMacroLabel','market-add-cboe-button':'addMacro','market-symbol-label':'tickerLabel','market-add-symbol':'addTicker','market-personal-label':'personalLabel','market-add-personal':'personalAdd','market-personal-reload':'personalReload'}))find(id).textContent=copy[key];
    find('market-symbol-input').placeholder=copy.tickerPlaceholder;
    const chips=state.items.map(item=>{const id=marketEntryId(item),chip=document.createElement('span'),label=document.createElement('span'),remove=document.createElement('button');chip.className='market-pcr-chip';chip.dataset.entryId=id;label.textContent=cboeMetricLabel(id,language);remove.type='button';remove.textContent='×';remove.dataset.removeEntry=id;remove.setAttribute('aria-label',say('remove',{name:label.textContent}));remove.disabled=!canEdit;remove.hidden=state.readOnly;chip.append(label,remove);return chip;});
    find('market-pcr-items').replaceChildren(...chips);find('market-pcr-manager').hidden=state.readOnly;
    let status=state.loading?copy.settingsLoading:state.saving?copy.settingsSaving:state.error==='load'?copy.settingsLoadError:state.error==='save'?copy.settingsSaveError:state.error==='conflict'?copy.settingsConflict:state.ready?copy[state.storage==='cloud'?'settingsCloud':'settingsLocal']:'';
    find('market-pcr-settings-status').textContent=status;find('market-pcr-settings-retry').hidden=!['load','save','conflict'].includes(state.error);find('market-pcr-settings-retry').disabled=state.loading||state.saving||adding;
    const macros=CBOE_METRICS.filter(key=>!state.items.some(item=>item.type==='cboe'&&item.key===key)),macroSelect=find('market-add-cboe'),oldMacro=macroSelect.value;
    fillOptions(macroSelect,macros.length?macros.map(key=>option(key,cboeMetricLabel('cboe:'+key,language))):[option('',copy.allMacros)],oldMacro);
    macroSelect.disabled=!canEdit||!macros.length;find('market-add-cboe-button').disabled=!canEdit||!macros.length;
    find('market-symbol-input').disabled=!canEdit;find('market-add-symbol').disabled=!canEdit||!find('market-symbol-input').value.trim();
    if(adding)find('market-add-symbol').textContent=copy.adding;
    const personal=find('market-personal-select'),oldPersonal=personal.value,available=personalSymbols.filter(symbol=>!state.items.some(item=>item.type==='symbol'&&item.symbol===symbol));
    fillOptions(personal,[option('',personalLoaded&&!available.length?copy.personalEmpty:copy.personalPlaceholder),...available.map(symbol=>option(symbol,symbol))],oldPersonal);
    personal.disabled=!canEdit||personalBusy||!available.length;find('market-add-personal').disabled=!canEdit||!personal.value;find('market-personal-reload').disabled=!canEdit||personalBusy;
    find('market-pcr-notice').textContent=notice?say(notice.key,notice.params):'';
  }
  function publishNavigation(){window.dispatchEvent(new CustomEvent('pcr-market-navigation',{detail:{ready:settings.state.ready&&!settings.state.loading,failed:settings.state.error==='load',macro:macroItems().map(marketEntryId),etf:settings.state.items.filter(item=>item.type==='symbol'&&['SPY','QQQ','DIA'].includes(item.symbol)).map(marketEntryId),selection:metric}}));}
  function render(){
    publishNavigation();
    window.dispatchEvent(new CustomEvent('pcr-summary-market',{detail:{items:settings.state.items,ready:settings.state.ready,failed:settings.state.error==='load',history:historyData,historyBusy,historyFailed:historyError,symbols:Object.fromEntries([...symbolStates].flatMap(([symbol,slot])=>slot.payload?[[symbol,slot.payload]]:[]))}}));
    renderManager();const copy=words(),day=selected(),active=entry(),macros=macroItems();
    for(const [id,key] of Object.entries({'cboe-heading':'title','cboe-subtitle':'subtitle','cboe-date-label':'date','cboe-latest':'latest','cboe-refresh':'refresh','cboe-scope':'scope','cboe-trend-title':'trendTitle','cboe-metric-label':'metric','cboe-range-label':'range','cboe-daily-label':'daily','cboe-p5-label':'p5','cboe-p20-label':'p20','cboe-p60-label':'p60','market-pcr-empty':'emptyList'}))find(id).textContent=copy[key];
    if(settings.state.readOnly){find('cboe-heading').textContent=copy.publicTitle;find('cboe-subtitle').textContent=copy.publicSubtitle;}
    find('market-pcr-empty').hidden=!settings.state.ready||!!settings.state.items.length;
    find('cboe-trend').hidden=!active;find('cboe-date').disabled=!active;find('cboe-date').max=dateNow();find('cboe-date').value=day||'';
    const groups=[];for(const type of ['cboe','symbol']){const items=settings.state.items.filter(item=>item.type===type);if(!items.length)continue;const group=document.createElement('optgroup');group.label=copy[type==='cboe'?'macroGroup':'referenceGroup'];group.append(...items.map(item=>option(marketEntryId(item),cboeMetricLabel(marketEntryId(item),language))));groups.push(group);}
    fillOptions(find('cboe-metric'),groups,metric);find('cboe-range').value=range;
    for(const item of find('cboe-range').options)item.textContent=copy[item.value==='126'?'halfYear':item.value==='252'?'oneYear':'all'];
    const snapshot=snapshotData?.snapshot&&(!day||snapshotData.snapshot.date===day)?snapshotData.snapshot:null;
    find('cboe-card-grid').hidden=!macros.length;find('cboe-date-line').hidden=!macros.length;
    find('cboe-date-line').textContent=`${copy.selected}: ${day||'—'} · ${copy.macroPublished}: ${snapshot?.date||'—'} · ${copy.checked}: ${checked(snapshotData?.checkedAt)}`;
    for(const key of CBOE_METRICS){const value=snapshot?.metrics?.[key];find(`cboe-${key}-card`).hidden=!macros.some(item=>item.key===key);find(`cboe-${key}-title`).textContent=copy[key];find(`cboe-${key}-detail`).textContent=copy[key+'Detail']+(key==='equity'&&value?.derived?' '+copy.equityDerived:'');find(`cboe-${key}-value`).textContent=format(value?.ratio);find(`cboe-${key}-volume`).textContent=`${copy.put}: ${count(value?.put)} · ${copy.call}: ${count(value?.call)}`;}
    let status='';if(macros.length){if(snapshotBusy)status=copy.loading;else if(snapshotData?.refreshStatus==='cooldown')status=say('cooldown',{seconds:snapshotData.retryAfterSeconds});else if(snapshotData?.refreshStatus==='failed')status=snapshot?copy.failure:copy.noSource;else if(snapshotData&&!snapshot)status=copy.empty;else if(snapshot&&snapshot.date<dateNow()&&!requestedDate)status=copy.pending;}
    find('cboe-status').textContent=status;find('cboe-status').hidden=!status;
    const reference=active?.type==='symbol',symbolStatus=reference?symbolState(active.symbol):null;
    find('cboe-refresh').disabled=settings.state.canRefresh===false||!active||(reference?symbolStatus.busy:historyBusy||snapshotBusy);find('cboe-latest').disabled=find('cboe-refresh').disabled;
    if(!active){find('cboe-source').parentElement.hidden=true;renderChart(null);return;}
    const payload=activeHistory(),options={metric,range,date:day,language},view=cboeHistoryView(payload,options);
    find('cboe-active-source').textContent=say('sourceThrough',{source:reference?'OCC':'Cboe',date:payload?.asof||'—',checked:checked(payload?.checkedAt)});
    find('cboe-source').parentElement.hidden=false;find('cboe-source').href=reference?payload.sourceUrl:(day?cboeSource+'?dt='+encodeURIComponent(day):cboeSource);find('cboe-source').textContent=copy[reference?'occSource':'cboeSource'];
    find('cboe-history-method').textContent=reference?copy.occMethod+(['SPY','QQQ','DIA'].includes(active.symbol)?' '+copy.proxyNote:''):copy.methodology+(active.key==='equity'?' '+copy.equityDerived:'');
    find('cboe-history-anchor').textContent=view.actualEnd?say('historyAnchor',{metric:cboeMetricLabel(metric,language),date:view.actualEnd}):'';
    find('cboe-history-date').textContent=view.actualEnd?say(view.requestedEnd===view.actualEnd?'historyExact':'historyThrough',{date:view.actualEnd,requested:view.requestedEnd,actual:view.actualEnd}):copy.historyEmpty;
    find('cboe-history-daily').textContent=format(view.point?.daily);find('cboe-history-p5').textContent=format(view.point?.r5);find('cboe-history-p20').textContent=format(view.point?.r20);find('cboe-history-p60').textContent=format(view.point?.r60);
    const start=payload?.coverage?.start||payload?.coverage?.firstDate||payload?.rows?.[0]?.date,end=payload?.asof||payload?.rows?.at(-1)?.date;
    find('cboe-history-coverage').textContent=start&&end?say('coverage',{start,end}):'';
    let historyStatus='';if(reference){if(symbolStatus.busy)historyStatus=copy.referenceLoading;else if(symbolStatus.retryAfterSeconds)historyStatus=say('cooldown',{seconds:symbolStatus.retryAfterSeconds});else if(symbolStatus.error)historyStatus=copy.referenceFailure;}else if(historyBusy)historyStatus=copy.historyLoading;else if(historyError)historyStatus=copy.historyFailure;else if(historyRefresh?.retryAfterSeconds)historyStatus=say('cooldown',{seconds:historyRefresh.retryAfterSeconds});else if(historyRefresh?.remainingGaps){const attempted=historyRefresh.attemptedDates,added=historyRefresh.addedDates,gaps=historyRefresh.remainingGaps;historyStatus=say('partial',{count:Array.isArray(attempted)?attempted.length:attempted??0,added:Array.isArray(added)?added.length:added??0,gaps:Array.isArray(gaps)?gaps.length:gaps});}
    find('cboe-history-status').textContent=historyStatus;find('cboe-history-status').hidden=!historyStatus;
    const normalizedRows=(view.records||[]).map(row=>{const value=row[metric]||row[active.key]||row[active.symbol]||{};return {date:row.date,daily:value.daily,r5:value.r5,r20:value.r20,r60:value.r60};});
    renderPcrInterpretation(find('cboe-pcr-reading'),interpretPcr(view.actualEnd&&view.lastRow?.available!==false?normalizedRows:[],{date:view.actualEnd}),{language,source:reference?'OCC':'Cboe'});
    renderChart(comparison.update({rows:normalizedRows,metric,date:day,range,language,config:cboeChartConfig(payload,options)}));
  }

  async function loadSnapshot(date=null,force=false){
    if(!macroItems().length)return;
    const key=date||'latest';if(!force&&snapshotKey===key)return;snapshotKey=key;
    const token=++snapshotGeneration;snapshotBusy=true;if(snapshots.has(key))snapshotData=snapshots.get(key);render();
    try{const response=await fetch((force?'/api/cboe/refresh':'/api/cboe')+(date?'?date='+encodeURIComponent(date):''),{method:force?'POST':'GET',credentials:'same-origin',...(force?{headers:{'Content-Type':'application/json'},body:'{}'}:{}),signal:AbortSignal.timeout(22000)}),payload=await response.json();if(token!==snapshotGeneration)return;if(response.status===429&&Number.isFinite(payload.retryAfterSeconds)){snapshotData={...(snapshots.get(key)||{}),refreshStatus:'cooldown',retryAfterSeconds:Math.ceil(payload.retryAfterSeconds)};return;}if(!response.ok&&!Object.hasOwn(payload,'snapshot'))throw Error('SNAPSHOT_UNAVAILABLE');snapshotData=payload;if(payload.snapshot)snapshots.set(key,payload);if(snapshots.size>24)snapshots.delete(snapshots.keys().next().value);}
    catch{if(token===snapshotGeneration){snapshotData={...(snapshots.get(key)||{}),refreshStatus:'failed'};snapshotKey=null;}}
    finally{if(token===snapshotGeneration){snapshotBusy=false;render();}}
  }
  async function loadHistory(date=null,force=false){
    const key=(date||'latest')+'|'+range;if(!force&&historyKey===key)return;historyKey=key;
    const token=++historyGeneration;if(histories.has(key))historyData=histories.get(key);historyBusy=true;historyError=false;historyRefresh=null;render();
    const params=new URLSearchParams({range:'all'});if(date)params.set('end',date);
    try{const response=await fetch((force?'/api/cboe/history/refresh':'/api/cboe/history')+'?'+params,{method:force?'POST':'GET',credentials:'same-origin',headers:force?{'Content-Type':'application/json'}:undefined,...(force?{body:'{}'}:{}),signal:AbortSignal.timeout(force?65000:22000)}),payload=await response.json();if(token!==historyGeneration)return;
      if(!response.ok){const available=Array.isArray(payload.rows)?payload:payload.data;if(Array.isArray(available?.rows)){historyData=available;histories.set(key,available);}if(payload.retryAfterSeconds){historyRefresh={retryAfterSeconds:payload.retryAfterSeconds};return;}throw Error('HISTORY_UNAVAILABLE');}
      if(!Array.isArray(payload.rows))throw Error('HISTORY_UNAVAILABLE');historyData=payload;histories.set(key,payload);if(histories.size>12)histories.delete(histories.keys().next().value);historyRefresh=payload.refresh||null;
    }catch{if(token===historyGeneration){historyError=true;historyKey=null;}}
    finally{if(token===historyGeneration){historyBusy=false;render();}}
  }
  function validSymbolPayload(payload,symbol){return payload?.symbol===symbol&&Array.isArray(payload.instrument?.rows)&&payload.instrument.rows.some(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&Number.isFinite(row.p)&&Number.isFinite(row.c)&&row.p>=0&&row.c>=0&&(row.p>0||row.c>0));}
  function keepSymbol(payload,symbol){
    if(!validSymbolPayload(payload,symbol))return false;const slot=symbolState(symbol),old=slot.payload,day=value=>value?.instrument?.rows?.at(-1)?.date||'',stamp=value=>Date.parse(value?.checkedAt)||0;
    if(!old||day(payload)>day(old)||(day(payload)===day(old)&&stamp(payload)>=stamp(old)))slot.payload=payload;return true;
  }
  async function loadSymbol(symbol,force=false,recheck=false,cacheOnly=false){
    const slot=symbolState(symbol);if(slot.promise)return slot.promise;if(slot.payload&&!force&&!recheck){render();return slot.payload;}
    const token=++slot.generation;slot.busy=true;slot.error=false;slot.retryAfterSeconds=null;render();
    slot.promise=(async()=>{try{
      const refreshCore=force&&coreSymbols.has(symbol),response=await fetch(refreshCore?'/api/refresh':'/api/symbol?'+new URLSearchParams({symbol,...(force?{refresh:'1'}:{})}),{method:refreshCore?'POST':'GET',credentials:'same-origin',headers:refreshCore?{'Content-Type':'application/json'}:cacheOnly?{'x-pcr-cache-only':'1'}:undefined,...(refreshCore?{body:'{}'}:{}),signal:AbortSignal.timeout(force?85000:70000)}),result=await response.json();
      const core=refreshCore?result.data:null,candidate=core?{symbol,instrument:core.instruments?.[symbol],checkedAt:core.checkedAt||core.refresh?.checkedAt,calendarDate:core.calendarDate,asof:core.instruments?.[symbol]?.rows?.at(-1)?.date,source:core.source}:result;
      if(token!==slot.generation)return slot.payload;if(candidate?.data)keepSymbol(candidate.data,symbol);const valid=keepSymbol(candidate,symbol);
      if(response.status===429&&Number.isFinite(result.retryAfterSeconds)){slot.retryAfterSeconds=Math.ceil(result.retryAfterSeconds);return slot.payload;}if(!response.ok||result.status==='failed'||!valid)throw Error('OCC_UNAVAILABLE');return slot.payload;
    }catch{if(token===slot.generation)slot.error=true;return null;}finally{if(token===slot.generation){slot.busy=false;slot.promise=null;render();}}})();return slot.promise;
  }
  async function loadSelected(force=false,cacheOnly=false){
    if(force&&settings.state.readOnly){await settings.load();if(settings.state.error==='load')return;}
    if(!metric){render();return;}
    if(macroItems().length)void loadSnapshot(requestedDate,force&&!isReferenceMetric(metric));
    if(isReferenceMetric(metric))return loadSymbol(entry().symbol,force,false,cacheOnly);
    return loadHistory(requestedDate,force);
  }
  async function addEntry(value){
    if(!editable())return;let candidate;try{candidate=normalizeMarketEntry(value);}catch{notice={key:'invalidTicker'};render();return;}
    const id=marketEntryId(candidate);if(settings.state.items.some(item=>marketEntryId(item)===id)){notice={key:'duplicate'};render();return;}if(settings.state.items.length>=MARKET_ITEM_LIMIT){notice={key:'limit'};render();return;}
    adding=true;notice=candidate.type==='symbol'?{key:'adding'}:null;render();
    try{
      if(candidate.type==='symbol'&&!await loadSymbol(candidate.symbol)){notice={key:'tickerFailure'};return;}
      // Validation is read-only. Membership changes only after this explicit save,
      // based on the most recently loaded document and its current revision.
      if(!settings.state.ready||settings.state.error==='load')return;
      if(settings.state.items.some(item=>marketEntryId(item)===id)){notice={key:'duplicate'};return;}
      const success=await settings.save([...settings.state.items,candidate]);if(success){metric=id;rememberView();notice=null;if(candidate.type==='symbol')find('market-symbol-input').value='';void loadSelected();}
    }finally{adding=false;render();}
  }
  async function loadPersonal(){
    if(personalBusy||!editable())return;personalBusy=true;render();
    try{const response=await fetch('/api/watchlist-settings',{credentials:'same-origin',signal:AbortSignal.timeout(20000)}),payload=await response.json();if(!response.ok||!Array.isArray(payload.items))throw Error('PERSONAL_UNAVAILABLE');personalSymbols=[...new Set(payload.items.map(item=>item.symbol).filter(symbol=>typeof symbol==='string'))];personalLoaded=true;notice=null;}
    catch{notice={key:'personalFailure'};}finally{personalBusy=false;render();}
  }
  find('market-pcr-items').addEventListener('click',event=>{const button=event.target.closest('[data-remove-entry]');if(!button||!editable())return;notice=null;void settings.save(settings.state.items.filter(item=>marketEntryId(item)!==button.dataset.removeEntry));});
  find('market-pcr-settings-retry').addEventListener('click',()=>{notice=null;void settings.load();});
  find('market-add-cboe-button').addEventListener('click',()=>{const key=find('market-add-cboe').value;if(key)void addEntry({type:'cboe',key});});
  find('market-add-symbol').addEventListener('click',()=>void addEntry({type:'symbol',symbol:find('market-symbol-input').value}));
  find('market-symbol-input').addEventListener('input',event=>{event.target.value=event.target.value.replace(/[a-z]/g,letter=>letter.toUpperCase());notice=null;find('market-add-symbol').disabled=!editable()||!event.target.value.trim();});
  find('market-symbol-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();void addEntry({type:'symbol',symbol:event.target.value});}});
  find('market-personal-reload').addEventListener('click',()=>void loadPersonal());
  find('market-personal-select').addEventListener('change',()=>{find('market-add-personal').disabled=!editable()||!find('market-personal-select').value;});
  find('market-add-personal').addEventListener('click',()=>{const symbol=find('market-personal-select').value;if(symbol)void addEntry({type:'symbol',symbol});});
  find('cboe-date').addEventListener('change',()=>{if(find('cboe-date').checkValidity()&&find('cboe-date').value){requestedDate=find('cboe-date').value;void loadSelected();render();}});
  find('cboe-latest').addEventListener('click',()=>{requestedDate=null;void loadSelected(true);});find('cboe-refresh').addEventListener('click',()=>void loadSelected(true));
  find('cboe-metric').addEventListener('change',()=>{const next=find('cboe-metric').value;if(settings.state.items.some(item=>marketEntryId(item)===next)){metric=next;rememberView();void loadSelected();render();}});
  window.addEventListener('pcr-market-navigate',event=>{
    const group=event.detail?.group;if(!['macro','etf'].includes(group)||!settings.state.ready||settings.state.loading||settings.state.error==='load')return;
    const candidates=settings.state.items.filter(item=>group==='macro'?item.type==='cboe':item.type==='symbol'&&['SPY','QQQ','DIA'].includes(item.symbol)).map(marketEntryId);
    if(!candidates.length)return;const next=candidates.includes(metric)?metric:candidates[0];
    // Quick navigation changes this view only; it never saves list or view preferences.
    if(metric!==next){metric=next;void loadSelected(false,true);render();}
  });
  // A summary row opens the same Measure selection. Like quick navigation it
  // reads saved data only and never saves list or view preferences.
  window.addEventListener('pcr-summary-open-market',event=>{
    const next=event.detail?.id;if(typeof next!=='string'||!settings.state.ready||settings.state.loading||settings.state.error==='load'||!settings.state.items.some(item=>marketEntryId(item)===next))return;
    if(metric!==next){metric=next;void loadSelected(false,true);render();}
    window.dispatchEvent(new CustomEvent('pcr-market-focus-request',{detail:{target:'market-etf-reference'}}));
  });
  window.addEventListener('pcr-market-navigation-request',publishNavigation);
  find('cboe-range').addEventListener('change',()=>{range=find('cboe-range').value;rememberView();if(metric&&!isReferenceMetric(metric))void loadHistory(requestedDate);render();});
  window.addEventListener('pcr-language-change',event=>{language=event.detail?.language==='en'?'en':'zh';render();});window.addEventListener('pcr-theme-change',()=>render());
  window.addEventListener('pcr-date-change',event=>{if(event.detail?.date){requestedDate=event.detail.date;void loadSelected();render();}});
  window.addEventListener('pcr-data-refresh',()=>{if(settings.state.readOnly){void settings.load().then(()=>{if(metric&&isReferenceMetric(metric))void loadSymbol(entry().symbol,false,true);});}else if(metric&&isReferenceMetric(metric))void loadSymbol(entry().symbol,false,true);});
  render();void settings.load();
  return {settings,get selection(){return metric;}};
}
