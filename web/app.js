import {mountChart} from 'https://persistent.oaistatic.com/plugins/visualize/charts/1.8.1/element.js';
import {WINDOWS,commonDates,calendarRecordCoverage,calendarMin,calendarMax,getView,buildConfigs,resolveDate,windowLabel,instrumentLabel} from './model.js';
import {getLanguage,t,translatePage,initLanguageToggle} from './i18n.js';
import {createCalendar} from './calendar.js';
import {OI_SOURCE_KEY,readOiSource,mergeOiSummaries,withOiSummaries} from './oi-summary-model.js';
import {moveSearchSelection,selectedSearchSymbol} from './search-model.js';
import {DEFAULT_SYMBOLS,DEFAULT_GROUPS,WATCHLIST_LIMIT,GROUP_LIMIT,normalizeTicker,defaultCategory,initialWatchItems,readWatchSettings,cleanWatchItems,cleanGroups,hasWatchSymbol,changedCategory,withoutGroup} from './watchlist-model.js';
import {interpretPcr} from './pcr-interpretation.js';
import {renderPcrInterpretation} from './pcr-interpretation-view.js';

const $=id=>document.getElementById(id),CORE=DEFAULT_SYMBOLS;
const controls=Object.fromEntries(['date','volume','symbol','range','latest','today','refresh'].map(id=>[id,$(id)]));
const DATA_KEY='pcr-dashboard:last-good:v1',STATE_KEY='pcr-dashboard:selection:v2',EXTRA_KEY='pcr-dashboard:extras:v1',FILTER_KEY='pcr-dashboard:category-filter:v1';
let categoryFilter=readSaved(FILTER_KEY)||'all';
const charts=[];
let baseData=null,data=null,busy=false,adding=null,searchTimer,searchController,lastDateEvent,pendingSymbol=null;
let items=[],groups=[],revision=0,settingsStorage=null,settingsReady=false,settingsSaving=false,settingsLoadError=false,settingsLoading=false,settingsReadOnly=false,visitorCanRefresh=true;
let extras=readSaved(EXTRA_KEY)||{},state={symbol:null,range:'252',volumeWindow:'day',date:null};
if(!extras||typeof extras!=='object'||Array.isArray(extras))extras={};
let noticeState=null,searchStatusState=null,searchResults=[],activeSearchResult=-1,searchOpen=false;
let oiSource=readOiSource(readSaved(OI_SOURCE_KEY)),oiRows=new Map(),oiPayload=null,oiBusy=false,oiFailed=false,oiCooldown=0,oiGeneration=0,oiController=null,oiListSignature=null,oiSelectionSignature=null,oiRowsDate=null,oiArchiveIndex={dates:[],coverageByDate:{}},oiArchiveIndexFailed=false;
function remember(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function readSaved(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function validInstrument(value){return value&&Array.isArray(value.rows)&&value.rows.length>0&&value.rows.every(row=>typeof row.date==='string'&&Number.isFinite(row.p)&&Number.isFinite(row.c));}
function validData(value){return value&&typeof value.asof==='string'&&CORE.every(symbol=>validInstrument(value.instruments?.[symbol]));}
function cachedInstrument(symbol){return baseData?.instruments[symbol]||(validInstrument(extras[symbol]?.instrument)?extras[symbol].instrument:null);}
function categoryOf(symbol){return items.find(item=>item.symbol===symbol)?.category??null;}
function filterMatches(item){return categoryFilter==='all'||(categoryFilter==='unassigned'?item.category===null:item.category===categoryFilter);}
function groupLabel(group){const original=DEFAULT_GROUPS.find(value=>value.id===group.id);return original&&group.name===original.name?t({semi:'categorySemi',etf:'categoryEtf',other:'categoryOther'}[group.id]):group.name;}
function visibleSymbols(){return items.filter(item=>data?.instruments[item.symbol]&&filterMatches(item)).map(item=>item.symbol);}
const number=value=>Number.isFinite(value)?new Intl.NumberFormat(getLanguage()==='en'?'en-US':'zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value):t('insufficient');
function notice(key=null,params={},error=false){noticeState=key?{key,params,error}:null;renderNotice();}
function renderNotice(){const current=noticeState;$('status').hidden=!current;if(current){$('status').className=current.error?'status error':'status';$('status').textContent=t(current.key,current.params);}}
function searchStatus(key=null,params={},error=false){searchStatusState=key?{key,params,error}:null;renderSearchStatus();}
function renderSearchStatus(){const current=searchStatusState;$('search-status').textContent=current?t(current.key,current.params):'';$('search-status').classList.toggle('text-error',!!current?.error);}
function errorKey(error,fallback='refreshFailed'){return ({INVALID_DATE:'invalidDate',DATE_RANGE:'dateRange',INVALID_SYMBOL:'invalidSymbol',HISTORY_TOO_LONG:'historyLong'})[error?.message]||fallback;}
function checkedLabel(stamp){if(!stamp)return t('notChecked');const date=new Date(stamp);return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat(getLanguage()==='en'?'en-US':'zh-CN',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)+(getLanguage()==='en'?' ET':' 美东'):stamp;}
function oiCheckedLabel(stamp){if(!stamp)return t('notChecked');const date=new Date(stamp);return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat(getLanguage()==='en'?'en-CA':'zh-CN',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)+' ET (America/New_York)':t('notChecked');}
function settlementLabel(item){return item?.oiAsOfConfirmed&&item.oiAsOf?t('oiSettlementConfirmed',{date:item.oiAsOf}):t('oiSettlementUnknown');}
function dateScope(){return data&&Object.keys(data.instruments).length?data:baseData;}
function compose(){
  if(!baseData)return;
  const instruments={};for(const item of items){const instrument=cachedInstrument(item.symbol);if(instrument)instruments[item.symbol]=instrument;}
  const latest=Object.values(instruments).map(instrument=>instrument.rows.at(-1).date).sort().at(-1)||baseData.asof;
  const archivedLatest=oiArchiveIndex.dates?.at(-1);const calendarDate=[baseData.calendarDate||baseData.queryDate||latest,archivedLatest||latest].sort().at(-1);
  data=withOiSummaries({...baseData,asof:latest,calendarDate,oiArchiveDates:oiArchiveIndex.dates,instruments},oiRowsDate===state.date?oiRows:new Map(),oiSource);
  for(const instrument of Object.values(data.instruments))if(instrument.oi)instrument.oi.dateLabel=oiSource==='moomoo'?t('oiArchiveTooltip',{date:instrument.oi.observationDate,checked:oiCheckedLabel(instrument.oi.checkedAt),settlement:settlementLabel(instrument.oi),retained:instrument.oi.stale?t('oiSummaryRetained'):''}):t('oiSummarySavedTooltip',{date:baseData.oiQueryDate||baseData.queryDate||t('seeSnapshot')});
  const scope=dateScope(),dates=commonDates(scope);controls.date.min=calendarMin(scope);controls.date.max=calendarMax(scope);
  if(!state.date)state.date=latest;if(state.date<controls.date.min)state.date=controls.date.min;if(state.date>calendarMax(scope))state.date=calendarMax(scope);
  if(!data.instruments[state.symbol])state.symbol=Object.keys(instruments)[0]||null;
}
function setBase(candidate){if(!validData(candidate))throw Error('INVALID_DATA');const wasLatest=!baseData||state.date===baseData.asof;baseData={...candidate,instruments:Object.fromEntries(CORE.map(symbol=>[symbol,candidate.instruments[symbol]]))};if(wasLatest)state.date=baseData.asof;remember(DATA_KEY,baseData);compose();}
function applySavedState(){const selected=readSaved(STATE_KEY);if(!selected||!data)return;if(data.instruments[selected.symbol])state.symbol=selected.symbol;if(['126','252','all'].includes(selected.range))state.range=selected.range;if(Object.hasOwn(WINDOWS,selected.volumeWindow))state.volumeWindow=selected.volumeWindow;if(selected.date){try{resolveDate(dateScope(),selected.date);state.date=selected.date;}catch{}}}
const calendar=createCalendar(selectDate);
function selectDate(date){if(!baseData)return;try{resolveDate(dateScope(),date);state.date=date;render();remember(STATE_KEY,state);notice();}catch(error){notice(errorKey(error),{min:controls.date.min,max:controls.date.max},true);}}
function applySettings(payload){const next=readWatchSettings(payload);if(next.items===null)throw Error('UNINITIALIZED_WATCHLIST');items=next.items;groups=next.groups;revision=next.revision;settingsStorage=next.storage;settingsReadOnly=next.readOnly===true;visitorCanRefresh=next.canRefresh!==false;window.dispatchEvent(new CustomEvent('pcr-access-change',{detail:{authenticated:!settingsReadOnly,publicReadOnly:settingsReadOnly,canRefresh:visitorCanRefresh}}));settingsReady=true;settingsLoadError=false;if(!['all','unassigned',...groups.map(group=>group.id)].includes(categoryFilter))categoryFilter='all';compose();const signature=items.map(item=>item.symbol).join(',');if(signature!==oiListSignature){oiListSignature=signature;void loadOiSummaries(false);}}
async function saveSettings(candidate,{initializing=false,nextGroups=groups}={}){
  if(settingsReadOnly||settingsSaving||(!initializing&&(!settingsReady||settingsLoadError)))return false;
  const desiredGroups=cleanGroups(nextGroups),desired=cleanWatchItems(candidate,desiredGroups);settingsSaving=true;searchStatus('watchSaving');render();
  try{
    const response=await fetch('/api/watchlist-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:desired,groups:desiredGroups,revision}),signal:AbortSignal.timeout(20000)});
    const payload=await response.json();
    if(response.status===409){applySettings(payload);await loadExtras();searchStatus('watchConflict',{},true);return false;}
    if(!response.ok)throw Error('WATCH_SAVE_FAILED');
    applySettings(payload);searchStatus();return true;
  }catch{searchStatus('watchSaveFailed',{},true);return false;}
  finally{settingsSaving=false;render();}
}
async function loadSettings(){
  if(settingsLoading)return;settingsLoading=true;settingsLoadError=false;render();
  try{
    const response=await fetch('/api/watchlist-settings',{credentials:'same-origin',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('WATCH_LOAD_FAILED');const current=readWatchSettings(await response.json());revision=current.revision;settingsStorage=current.storage;settingsReadOnly=current.readOnly===true;visitorCanRefresh=current.canRefresh!==false;
    if(current.items===null){const legacySymbols=readSaved('pcr-dashboard:watchlist:v1'),legacyCategories=readSaved('pcr-dashboard:categories:v1');const saved=await saveSettings(initialWatchItems(legacySymbols,legacyCategories),{initializing:true,nextGroups:DEFAULT_GROUPS});if(!saved&&!settingsReady)throw Error('WATCH_INIT_FAILED');}
    else applySettings(current);
  }catch{settingsLoadError=true;searchStatus('watchLoadFailed',{},true);}
  finally{settingsLoading=false;compose();render();}
}
function renderGroups(){
  const option=(value,label)=>{const element=document.createElement('option');element.value=value;element.textContent=label;return element;};
  $('category-filter').replaceChildren(option('all',t('categoryAll')),...groups.map(group=>option(group.id,groupLabel(group))),option('unassigned',t('categoryUnassigned')));
  $('category-editor').replaceChildren(option('',t('categoryUnassigned')),...groups.map(group=>option(group.id,groupLabel(group))));
  $('delete-group').disabled=settingsReadOnly||!settingsReady||settingsSaving||!!adding||!groups.some(group=>group.id===categoryFilter);
}
function renderWatchlist(){
  const options=[],chips=[],locked=!settingsReady||settingsLoadError||settingsSaving||!!adding;
  for(const item of items){const symbol=item.symbol,instrument=data?.instruments[symbol],loaded=!!instrument;
    if(loaded&&filterMatches(item)){const option=document.createElement('option');option.value=symbol;option.textContent=instrumentLabel(symbol,instrument,getLanguage());options.push(option);}
    const chip=document.createElement('span');chip.className='watchlist-chip';chip.dataset.symbol=symbol;
    const select=document.createElement('button');select.type='button';select.className='watchlist-select';select.textContent=symbol;select.disabled=!loaded||locked;select.classList.toggle('is-active',symbol===state.symbol);select.addEventListener('click',()=>{if(categoryFilter!=='all'&&item.category!==categoryFilter){categoryFilter=item.category||'unassigned';remember(FILTER_KEY,categoryFilter);}state.symbol=symbol;render();remember(STATE_KEY,state);});chip.append(select);
    const remove=document.createElement('button');remove.type='button';remove.className='watchlist-remove';remove.dataset.symbol=symbol;remove.textContent='×';remove.setAttribute('aria-label',t('remove',{symbol}));remove.disabled=settingsReadOnly||locked;remove.hidden=settingsReadOnly;remove.addEventListener('click',()=>removeSymbol(symbol));chip.append(remove);chips.push(chip);
  }
  controls.symbol.replaceChildren(...options);controls.symbol.value=state.symbol||'';controls.symbol.disabled=!options.length;
  $('watchlist').replaceChildren(...chips);$('eyebrow').textContent=t('eyebrow',{count:items.length});$('category-filter').value=categoryFilter;
  $('category-editor').value=state.symbol?(categoryOf(state.symbol)||''):'';$('category-editor').dataset.symbol=state.symbol||'';$('category-editor').disabled=settingsReadOnly||locked||!options.length;
  $('watchlist-storage').textContent=t(settingsSaving?'watchSaving':settingsLoading?'watchLoading':settingsLoadError?'watchStorageUnavailable':settingsReady?(settingsReadOnly?'publicWatchlist':settingsStorage==='cloud'?'watchSavedCloud':'watchSavedLocal'):'watchLoading');
  $('watchlist-retry').hidden=!settingsLoadError;$('watchlist-retry').disabled=settingsLoading||settingsSaving;
}
async function loadOiSummaries(refresh=false){
  const symbols=items.map(item=>item.symbol),selectedDate=state.date,generation=++oiGeneration;
  oiSelectionSignature=symbols.join(',')+'|'+selectedDate;
  oiController?.abort();oiController=null;
  if(oiRowsDate!==selectedDate){oiRows=new Map();oiPayload=null;oiRowsDate=selectedDate;}
  if(!symbols.length||!selectedDate){oiRows=new Map();oiPayload=null;oiBusy=false;oiFailed=false;oiArchiveIndex={dates:[],coverageByDate:{}};compose();render();return;}
  oiController=new AbortController();const controller=oiController;oiBusy=true;oiFailed=false;oiCooldown=0;render();
  const query=new URLSearchParams({symbols:symbols.join(',')}),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(80000)]);
  try{
    let refreshFailed=false;
    if(refresh){
      const response=await fetch('/api/oi-summaries/refresh?'+query,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal});
      const refreshed=await response.json();if(generation!==oiGeneration)return;
      if(response.status===429&&Number.isFinite(refreshed.retryAfterSeconds))oiCooldown=Math.ceil(refreshed.retryAfterSeconds);refreshFailed=(!response.ok&&response.status!==429)||['unavailable','failed','partial'].includes(refreshed.status);
    }
    const dateQuery=new URLSearchParams(query);dateQuery.set('date',selectedDate);
    const [history,index]=await Promise.allSettled([
      fetch('/api/oi-summaries/history?'+dateQuery,{credentials:'same-origin',signal}).then(async response=>({response,payload:await response.json()})),
      fetch('/api/oi-summaries/history?'+query,{credentials:'same-origin',signal}).then(async response=>({response,payload:await response.json()})),
    ]);
    if(generation!==oiGeneration||state.date!==selectedDate)return;
    oiArchiveIndexFailed=index.status!=='fulfilled'||!index.value.response.ok||!Array.isArray(index.value.payload.dates);
    if(!oiArchiveIndexFailed)oiArchiveIndex={dates:index.value.payload.dates.filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort(),coverageByDate:index.value.payload.coverageByDate||{}};
    if(history.status!=='fulfilled'||!history.value.response.ok||!Array.isArray(history.value.payload?.items))throw Error('OI_UNAVAILABLE');
    const payload=history.value.payload;
    oiPayload=payload;oiRows=mergeOiSummaries(new Map(),payload,symbols,{observationDate:selectedDate});
    oiFailed=refreshFailed;
  }catch(error){if(generation!==oiGeneration||state.date!==selectedDate)return;oiRows=mergeOiSummaries(oiRows,null,symbols,{observationDate:selectedDate});oiFailed=true;}
  finally{if(generation===oiGeneration){oiController=null;oiBusy=false;compose();render();}}
}
function renderOiSource(symbols){
  $('oi-source').value=oiSource;
  if(oiSource==='saved'){$('oi-source-status').textContent=t('oiSummarySaved',{date:baseData.oiQueryDate||baseData.queryDate||t('seeSnapshot')});return;}
  const status=oiBusy?t('oiArchiveBusy',{date:state.date}):oiCooldown?t('retryAfter',{seconds:oiCooldown}):oiFailed?t('oiArchiveUnavailable'):!oiRows.size?t('oiArchiveEmpty',{date:state.date}):'';
  const values=symbols.map(symbol=>{const item=oiRowsDate===state.date?oiRows.get(symbol):null;return item?t('oiArchiveItem',{symbol,checked:oiCheckedLabel(item.checkedAt),settlement:settlementLabel(item),retained:item.stale?t('oiSummaryRetained'):''}):t('oiArchiveMissing',{symbol,date:state.date});});
  $('oi-source-status').textContent=[status,...values].filter(Boolean).join(' · ');
}
function freshnessText(){const info=baseData.freshness;if(info?.status==='pending_source')return t('pendingSource',{completed:info.completedSession,latest:info.sourceLatestDate||baseData.asof});if(info?.status==='market_open')return t('marketOpen');if(info?.status==='current')return t('currentSource');return t('sourceLag');}
function renderAccess(){
  for(const id of ['search-form','search-results','search-status','category-editor-label','group-form','group-delete-hint']){const element=$(id);if(element)element.hidden=settingsReadOnly;}
}
function render(){
  renderAccess();if(!baseData){updateButtons();return;}
  compose();const selected=visibleSymbols();if(selected.length&&!selected.includes(state.symbol))state.symbol=selected[0];const language=getLanguage();
  $('overview').hidden=!selected.length;$('category-empty').hidden=!!selected.length;document.querySelector('section[aria-labelledby="history-heading"]').hidden=!selected.length;
  if(selected.length){
    const view=getView(data,state),configs=buildConfigs(data,{...state,language,symbols:selected});
    configs.forEach((config,index)=>{if(charts[index])charts[index].config=config;else charts[index]=mountChart(index?$('history'):$('overview'),config);});
    $('overview-caption').textContent=windowLabel(state.volumeWindow,language)+' · '+view.actualDate;
    $('date-note').textContent=t(!view.hasVolumeDate?'dateNoVolume':state.date===view.actualDate?'dateExact':'dateFallback',{date:state.date,actual:view.actualDate});
    const missingOi=selected.filter(symbol=>!Number.isFinite(data.instruments[symbol]?.oi?.ratio));
    $('oi-note').textContent=oiSource==='moomoo'?t('oiArchiveNote',{date:state.date,volumeDate:view.hasVolumeDate?view.actualDate:t('noRecord')})+(missingOi.length?' '+t('oiMissingSymbols',{symbols:missingOi.join('、')}):''):view.isLatest?t('oiLatest')+(missingOi.length?' '+t('oiMissingSymbols',{symbols:missingOi.join('、')}):''):t('oiHistorical');
    $('history-heading').textContent=instrumentLabel(state.symbol,view.instrument,language)+' · '+t('historyHeading');
    $('daily-value').textContent=view.current?number(view.current.c>0?view.current.p/view.current.c:null):'—';$('daily-date').textContent=view.current?view.actualDate:t('noRecord');
    $('p5-value').textContent=view.current?number(view.current.r5):'—';$('p20-value').textContent=view.current?number(view.current.r20):'—';$('p60-value').textContent=view.current?number(view.current.r60):'—';
    renderPcrInterpretation($('history-pcr-reading'),interpretPcr(view.current?view.instrument.rows:[],{date:view.actualDate}),{language,source:'OCC'});
    $('rank-value').textContent=Number.isFinite(view.current?.rank)?t('rankValue',{rank:new Intl.NumberFormat(language==='en'?'en-US':'zh-CN',{style:'percent',maximumFractionDigits:1}).format(view.current.rank)}):t('rankMissing');
    $('history-note').hidden=!!view.current;$('history-note').textContent=view.current?'':t('instrumentMissing',{symbol:state.symbol,date:view.actualDate});
    $('source-details').textContent=t('coverage',{symbol:state.symbol,start:view.instrument.rows[0].date,end:view.instrument.rows.at(-1).date})+' '+t('recordWindows');
    const dates=view.instrument.rows.map(row=>row.date);$('previous-session').disabled=busy||!dates.some(date=>date<state.date);$('next-session').disabled=busy||!dates.some(date=>date>state.date);
  }else{
    $('category-empty').textContent=t(settingsLoadError?'watchLoadFailed':!settingsReady?'watchLoading':items.length?'categoryEmpty':'watchlistEmpty');
    $('overview-caption').textContent=windowLabel(state.volumeWindow,language);$('date-note').textContent='';$('oi-note').textContent='';$('source-details').textContent=t('recordWindows');$('previous-session').disabled=true;$('next-session').disabled=true;
  }
  controls.date.value=state.date;controls.volume.value=state.volumeWindow;controls.range.value=state.range;renderGroups();renderWatchlist();
  $('freshness').textContent=t(oiSource==='moomoo'?'oiArchiveFreshness':'freshness',{date:baseData.asof,checked:checkedLabel(baseData.checkedAt||baseData.refresh?.checkedAt),oi:oiSource==='moomoo'?oiCheckedLabel(oiPayload?.checkedAt):baseData.oiQueryDate||baseData.queryDate||t('seeSnapshot')});$('source-status').textContent=freshnessText();renderOiSource(selected);
  const additional=items.map(item=>item.symbol).filter(symbol=>!CORE.includes(symbol)&&data.instruments[symbol]);$('extra-freshness').textContent=additional.length?t('customCoverage')+' '+additional.map(symbol=>symbol+': '+data.instruments[symbol].rows.at(-1).date).join(' · '):'';
  const coverage=calendarRecordCoverage(data,items.map(item=>item.symbol)),recorded=coverage.byDate[state.date]||[],missing=coverage.symbols.filter(symbol=>!recorded.includes(symbol));
  $('calendar-coverage-status').textContent=coverage.total?t('calendarSelectedCoverage',{date:state.date,count:recorded.length,total:coverage.total})+(missing.length?' '+t('calendarMissingSymbols',{symbols:missing.join('、')}):''):'';
  calendar.render({selected:state.date,dates:commonDates(data),min:controls.date.min,max:controls.date.max,coverage,oiCoverage:oiArchiveIndexFailed?null:oiArchiveIndex.coverageByDate,oiTotal:items.length});
  $('oi-calendar-status').textContent=oiArchiveIndexFailed?t('oiArchiveIndexUnavailable'):t('oiArchiveCalendarCoverage',{date:state.date,count:oiArchiveCount(state.date),total:items.length});
  controls.refresh.textContent=t(busy?'refreshing':'refresh');renderNotice();renderSearchStatus();renderSearchResults();updateButtons();
  const summaryInstruments={...baseData.instruments},summaryChecked={};for(const [symbol,slot]of Object.entries(extras)){if(validInstrument(slot?.instrument)){summaryInstruments[symbol]=slot.instrument;summaryChecked[symbol]=slot.checkedAt||null;}}
  window.dispatchEvent(new CustomEvent('pcr-summary-watchlist',{detail:{items:items.map(item=>({symbol:item.symbol})),ready:settingsReady,failed:settingsLoadError,date:state.date,minDate:controls.date.min,maxDate:controls.date.max,instruments:summaryInstruments,checkedAt:baseData.checkedAt||baseData.refresh?.checkedAt||null,checkedBySymbol:summaryChecked}}));
  if(oiSource==='moomoo'&&settingsReady&&oiSelectionSignature!==items.map(item=>item.symbol).join(',')+'|'+state.date)void loadOiSummaries(false);
  if(lastDateEvent!==state.date){lastDateEvent=state.date;window.dispatchEvent(new CustomEvent('pcr-date-change',{detail:{date:state.date}}));}
}
function oiArchiveCount(date){const value=oiArchiveIndex.coverageByDate?.[date];return Array.isArray(value)?value.length:Number.isInteger(value?.count)?value.count:Array.isArray(value?.symbols)?value.symbols.length:Array.isArray(value?.completeSymbols)?value.completeSymbols.length:Number.isInteger(value)?value:0;}
function updateButtons(){
  const locked=settingsReadOnly||!baseData||!settingsReady||settingsLoadError||settingsSaving||settingsLoading||!!adding;
  $('search-submit').disabled=locked;
  $('create-group').disabled=locked||!$('group-name').value.trim()||groups.length>=GROUP_LIMIT;
  $('delete-group').disabled=locked||!groups.some(group=>group.id===categoryFilter);
  $('add-symbol').disabled=locked||!pendingSymbol||hasWatchSymbol(items,pendingSymbol);
  $('add-symbol').textContent=t(adding?'adding':pendingSymbol&&hasWatchSymbol(items,pendingSymbol)?'alreadyAdded':pendingSymbol?'addCurrentSymbol':'addSymbolButton',{symbol:pendingSymbol||''});
  controls.refresh.disabled=!visitorCanRefresh||!baseData||busy||!!adding||settingsSaving;$('oi-source').disabled=!baseData;
}
function changed(){if(!data)return;const previous={...state};state={symbol:controls.symbol.value||state.symbol,range:controls.range.value,volumeWindow:controls.volume.value,date:controls.date.value};try{resolveDate(dateScope(),state.date);if(state.symbol&&data.instruments[state.symbol])getView(data,state);render();remember(STATE_KEY,state);notice();}catch(error){state=previous;notice(errorKey(error),{min:controls.date.min,max:controls.date.max},true);}}
for(const id of ['date','volume','symbol','range'])controls[id].addEventListener('change',changed);
$('oi-source').addEventListener('change',()=>{oiSource=readOiSource($('oi-source').value);remember(OI_SOURCE_KEY,oiSource);compose();render();if(oiSource==='moomoo')void loadOiSummaries(false);});
$('category-filter').addEventListener('change',()=>{categoryFilter=$('category-filter').value;remember(FILTER_KEY,categoryFilter);render();remember(STATE_KEY,state);});
$('category-editor').addEventListener('change',async()=>{if(settingsReadOnly||!state.symbol||settingsSaving)return;const saved=await saveSettings(changedCategory(items,state.symbol,$('category-editor').value||null));if(saved)remember(STATE_KEY,state);});
$('group-form').addEventListener('submit',event=>{event.preventDefault();createGroup();});
$('group-name').addEventListener('input',updateButtons);
$('delete-group').addEventListener('click',deleteGroup);
async function createGroup(){
  if(settingsReadOnly||!settingsReady||settingsLoadError||settingsSaving||adding)return;
  const name=$('group-name').value.trim();if(!name||name.length>40){searchStatus('groupNameInvalid',{},true);return;}
  if(groups.some(group=>group.name.toLowerCase()===name.toLowerCase())){searchStatus('groupNameExists',{},true);return;}
  if(groups.length>=GROUP_LIMIT){searchStatus('groupLimit',{limit:GROUP_LIMIT},true);return;}
  const id='custom_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
  const saved=await saveSettings(items,{nextGroups:[...groups,{id,name}]});
  if(saved){categoryFilter=id;remember(FILTER_KEY,categoryFilter);$('group-name').value='';searchStatus('groupCreated',{name});render();}
}
async function deleteGroup(){
  if(settingsReadOnly||!settingsReady||settingsLoadError||settingsSaving||adding||!groups.some(group=>group.id===categoryFilter))return;
  const name=groupLabel(groups.find(group=>group.id===categoryFilter)),next=withoutGroup(items,groups,categoryFilter);
  const saved=await saveSettings(next.items,{nextGroups:next.groups});
  if(saved){categoryFilter='unassigned';remember(FILTER_KEY,categoryFilter);searchStatus('groupRemoved',{name});render();}
}
$('watchlist-retry').addEventListener('click',async()=>{await loadSettings();if(settingsReady){await loadExtras();applySavedState();render();}});
controls.latest.addEventListener('click',()=>selectDate(data?.asof||baseData.asof));controls.today.addEventListener('click',()=>selectDate(baseData.calendarDate||calendarMax(dateScope())));
for(const [id,direction] of [['previous-session',-1],['next-session',1]])$(id).addEventListener('click',()=>{const dates=data.instruments[state.symbol]?.rows.map(row=>row.date)||[];const date=direction<0?dates.findLast(date=>date<state.date):dates.find(date=>date>state.date);if(date)selectDate(date);});
function searchOptionId(index){return 'search-option-'+index;}
function syncSearchAria(){
  const expanded=searchOpen&&searchResults.length>0;
  $('search-results').hidden=!expanded;$('symbol-search').setAttribute('aria-expanded',String(expanded));
  if(expanded&&selectedSearchSymbol(searchResults,activeSearchResult))$('symbol-search').setAttribute('aria-activedescendant',searchOptionId(activeSearchResult));
  else $('symbol-search').removeAttribute('aria-activedescendant');
  for(const [index,option] of [...$('search-results').children].entries()){
    const active=expanded&&index===activeSearchResult;option.classList.toggle('is-active',active);option.setAttribute('aria-selected',String(active));
  }
}
function closeSearchResults(){searchOpen=false;activeSearchResult=-1;syncSearchAria();}
function highlightSearchResult(index,{scroll=true}={}){
  const symbol=selectedSearchSymbol(searchResults,index);if(!symbol)return;
  if(!scroll&&searchOpen&&activeSearchResult===index)return;
  activeSearchResult=index;searchOpen=true;pendingSymbol=symbol;syncSearchAria();updateButtons();
  if(scroll)document.getElementById(searchOptionId(index))?.scrollIntoView({block:'nearest'});
}
function chooseCandidate(symbol){
  const candidate=searchResults.find(result=>result.symbol===symbol);if(!candidate)return;
  clearTimeout(searchTimer);searchController?.abort();pendingSymbol=symbol;$('symbol-search').value=symbol;
  searchResults=[candidate];activeSearchResult=-1;searchOpen=false;searchStatus();renderSearchResults();updateButtons();$('symbol-search').focus({preventScroll:true});
}
function renderSearchResults(){
  const list=$('search-results');list.setAttribute('aria-label',getLanguage()==='en'?'Symbol suggestions':'标的搜索建议');
  if(activeSearchResult>=searchResults.length)activeSearchResult=-1;
  list.replaceChildren(...searchResults.map((result,index)=>{
    const option=document.createElement('li'),description=document.createElement('div'),strong=document.createElement('strong'),detail=document.createElement('span'),status=document.createElement('span');
    option.id=searchOptionId(index);option.dataset.symbol=result.symbol;option.setAttribute('role','option');option.setAttribute('aria-selected',String(searchOpen&&index===activeSearchResult));
    description.className='search-candidate';strong.textContent=result.symbol;detail.className='result-name';detail.textContent=(getLanguage()==='en'?(result.name||result.symbol):(result.label||result.name||result.symbol)).replace(result.symbol+' · ','')+' · '+t(result.kind==='direct'?'directCandidate':'catalogCandidate');description.append(strong,detail);
    status.className='search-option-status';status.textContent=hasWatchSymbol(items,result.symbol)?t('alreadyAdded'):(getLanguage()==='en'?'Select':'选择');
    option.append(description,status);option.addEventListener('pointermove',()=>highlightSearchResult(index,{scroll:false}));option.addEventListener('click',()=>chooseCandidate(result.symbol));
    return option;
  }));
  syncSearchAria();
}
async function search({focus=false}={}){
  if(settingsReadOnly)return;
  clearTimeout(searchTimer);const query=$('symbol-search').value.trim();searchController?.abort();
  if(!query){searchResults=[];pendingSymbol=null;activeSearchResult=-1;searchOpen=false;renderSearchResults();searchStatus();updateButtons();return;}
  if(focus)$('symbol-search').focus({preventScroll:true});
  const controller=new AbortController();searchController=controller;searchStatus('searching');
  try{
    const response=await fetch('/api/search?q='+encodeURIComponent(query),{credentials:'same-origin',signal:controller.signal}),result=await response.json();
    if(!response.ok)throw Error();if(controller!==searchController)return;
    searchResults=Array.isArray(result.results)?result.results:[];activeSearchResult=searchResults.length?0:-1;searchOpen=searchResults.length>0&&(focus||document.activeElement===$('symbol-search'));
    pendingSymbol=selectedSearchSymbol(searchResults,activeSearchResult)||normalizeTicker(query);searchStatus(searchResults.length?null:'searchEmpty');renderSearchResults();updateButtons();
  }catch(error){if(error.name!=='AbortError'){closeSearchResults();searchStatus('loadFailed',{},true);}}
}
function searchInputChanged(event={}){
  if(settingsReadOnly)return;
  clearTimeout(searchTimer);searchController?.abort();searchResults=[];activeSearchResult=-1;searchOpen=false;
  pendingSymbol=event.isComposing?null:normalizeTicker($('symbol-search').value);renderSearchResults();searchStatus();updateButtons();
  if(!event.isComposing)searchTimer=setTimeout(search,300);
}
async function addSearchSelection(){
  if(settingsReadOnly)return;
  if($('search-submit').disabled)return;
  const query=$('symbol-search').value.trim();
  let symbol=(searchOpen?selectedSearchSymbol(searchResults,activeSearchResult):null)||normalizeTicker(query);
  if(!symbol){
    await search({focus:true});
    if($('symbol-search').value.trim()!==query)return;
    symbol=selectedSearchSymbol(searchResults,activeSearchResult);
  }
  if(!symbol)return;
  clearTimeout(searchTimer);searchController?.abort();
  if(searchResults.some(result=>result.symbol===symbol))chooseCandidate(symbol);
  else {pendingSymbol=symbol;$('symbol-search').value=symbol;closeSearchResults();updateButtons();}
  await addSymbol(symbol);
}
$('search-form').addEventListener('submit',event=>{event.preventDefault();search({focus:true});});
$('symbol-search').addEventListener('input',searchInputChanged);
$('symbol-search').addEventListener('compositionend',()=>searchInputChanged());
$('symbol-search').addEventListener('keydown',event=>{
  if(event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&searchResults.length&&(searchOpen||['ArrowDown','ArrowUp'].includes(event.key))){
    event.preventDefault();const current=searchOpen?activeSearchResult:-1;highlightSearchResult(moveSearchSelection(current,event.key,searchResults.length));
  }else if(event.key==='Enter'){
    event.preventDefault();if(!event.repeat)void addSearchSelection();
  }else if(event.key==='Escape'&&searchOpen){event.preventDefault();closeSearchResults();}
  else if(event.key==='Tab')closeSearchResults();
});
document.addEventListener('pointerdown',event=>{if(!$('search-form').contains(event.target)&&!$('search-results').contains(event.target))closeSearchResults();});
$('add-symbol').addEventListener('click',()=>{if(pendingSymbol)addSymbol(pendingSymbol);});
async function fetchExtra(symbol,refresh=false){const response=await fetch('/api/symbol?symbol='+encodeURIComponent(symbol)+(refresh?'&refresh=1':''),{credentials:'same-origin',signal:AbortSignal.timeout(80000)}),payload=await response.json();if(!response.ok){const error=Error('EXTRA_FAILED');error.payload=payload;throw error;}if(payload.symbol!==symbol||!validInstrument(payload.instrument))throw Error('EXTRA_FAILED');return payload;}
function saveExtras(){remember(EXTRA_KEY,extras);}
function keepExtra(symbol,payload){const current=extras[symbol],stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;if(!current||payload.asof>current.asof||(payload.asof===current.asof&&stamp(payload.checkedAt)>=stamp(current.checkedAt)))extras[symbol]=payload;}
async function addSymbol(symbol){
  symbol=normalizeTicker(symbol);if(settingsReadOnly||!symbol||!settingsReady||settingsLoadError||settingsSaving||adding||hasWatchSymbol(items,symbol))return;
  if(items.length>=WATCHLIST_LIMIT){searchStatus('addLimit',{limit:WATCHLIST_LIMIT},true);return;}
  adding=symbol;searchStatus('adding');renderSearchResults();updateButtons();
  try{
    let instrument=cachedInstrument(symbol);if(!instrument){const payload=await fetchExtra(symbol);keepExtra(symbol,payload);saveExtras();instrument=payload.instrument;}
    const saved=await saveSettings([...items,{symbol,category:groups.some(group=>group.id===categoryFilter)?categoryFilter:groups.some(group=>group.id===defaultCategory(symbol))?defaultCategory(symbol):null}]);
    if(saved){compose();state.symbol=symbol;if(categoryFilter!=='all'){categoryFilter=categoryOf(symbol)||'unassigned';remember(FILTER_KEY,categoryFilter);}render();remember(STATE_KEY,state);searchStatus('addSuccess',{symbol,start:instrument.rows[0].date,end:instrument.rows.at(-1).date});}
  }catch(error){searchStatus(error.payload?.retryAfterSeconds?'retryAfter':'addFailed',{symbol,seconds:error.payload?.retryAfterSeconds},true);}
  finally{adding=null;render();}
}
async function removeSymbol(symbol){if(settingsReadOnly||!settingsReady||settingsLoadError||settingsSaving||adding)return;const saved=await saveSettings(items.filter(item=>item.symbol!==symbol));if(saved){compose();render();remember(STATE_KEY,state);}}
async function loadExtras(refresh=false){
  const queue=items.map(item=>item.symbol).filter(symbol=>!CORE.includes(symbol)),failures=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{while(cursor<queue.length){const symbol=queue[cursor++];try{const payload=await fetchExtra(symbol,refresh);if(hasWatchSymbol(items,symbol))keepExtra(symbol,payload);}catch(error){if(error.payload?.data?.symbol===symbol&&validInstrument(error.payload.data.instrument))keepExtra(symbol,error.payload.data);failures.push(symbol);}}}));
  saveExtras();compose();return failures;
}
async function refresh(){
  if(!visitorCanRefresh||busy||adding||settingsSaving)return;busy=true;render();notice('refreshingNotice');if(settingsReadOnly){await loadSettings();if(settingsLoadError){busy=false;render();notice('watchLoadFailed',{},true);return;}}let coreFailed=false;const oiRefresh=loadOiSummaries(true);
  try{const response=await fetch('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(80000),credentials:'same-origin'}),result=await response.json();if(!response.ok||result.status==='failed'){if(result.data&&validData(result.data)&&result.data.asof>=baseData.asof)setBase(result.data);coreFailed=true;notice(result.retryAfterSeconds?'retryAfter':'refreshFailed',{seconds:result.retryAfterSeconds},!result.retryAfterSeconds);}else{if(result.data)setBase(result.data);notice(result.status==='updated'?'refreshUpdated':result.status==='revised'?'refreshRevised':'refreshUnchanged',{date:baseData.asof});}}
  catch(error){coreFailed=true;notice(error.name==='TimeoutError'||error.name==='AbortError'?'timeout':'refreshFailed',{},true);}
  try{const failures=await loadExtras(true);if(failures.length)notice('extraFailed',{symbols:failures.join(', ')},true);else if(!coreFailed)window.dispatchEvent(new CustomEvent('pcr-data-refresh'));}
  finally{await oiRefresh;busy=false;render();remember(STATE_KEY,state);}
}
controls.refresh.addEventListener('click',refresh);
async function initialize(){
  initLanguageToggle();translatePage();const cached=readSaved(DATA_KEY);if(validData(cached)){setBase(cached);applySavedState();render();}
  try{const response=await fetch('/api/watchlist',{credentials:'same-origin'});if(!response.ok)throw Error();const incoming=await response.json();if(!baseData||incoming.asof>=baseData.asof){setBase(incoming);applySavedState();render();}else notice('localNewer');}
  catch{if(!baseData)throw Error('LOAD_FAILED');notice('offline',{},true);}
  await loadSettings();const failures=settingsReady?await loadExtras():[];applySavedState();
  for(const control of Object.values(controls))control.disabled=false;render();if(failures.length)notice('extraFailed',{symbols:failures.join(', ')},true);
}
window.addEventListener('pcr-language-change',()=>{translatePage();render();});
window.addEventListener('pcr-summary-date-select',event=>{if(event.detail?.date)selectDate(event.detail.date);});
initialize().catch(()=>{notice('loadFailed',{},true);$('freshness').textContent=t('notLoaded');});
