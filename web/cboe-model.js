import {withFiveSessionPcr} from './rolling-pcr.js';
import {normalizeMarketEntry,marketEntryId} from './market-pcr-settings.js';
export const CBOE_METRICS=['index','total','etp','equity'];
export const REFERENCE_METRICS=['spy','qqq','dia'];
export const MARKET_METRICS=[...CBOE_METRICS,...REFERENCE_METRICS];
export function marketMetricEntry(value){
  if(value&&typeof value==='object')return normalizeMarketEntry(value);
  if(typeof value!=='string')throw Error('INVALID_MARKET_METRIC');
  if(value.startsWith('cboe:'))return normalizeMarketEntry({type:'cboe',key:value.slice(5)});
  if(value.startsWith('symbol:'))return normalizeMarketEntry({type:'symbol',symbol:value.slice(7)});
  if(CBOE_METRICS.includes(value))return {type:'cboe',key:value};
  return normalizeMarketEntry({type:'symbol',symbol:value});
}
export function isReferenceMetric(metric){try{return marketMetricEntry(metric).type==='symbol';}catch{return false;}}

export const CBOE_COLORS={daily:'#6ca3ba',r5:'#208980',r20:'#2867c7',r60:'#ed842b'};
const names={zh:{index:'指数期权 · INDEX',total:'期权合计 · TOTAL',etp:'ETF／ETP',equity:'个股期权 · EQUITY',spy:'标普 500 · SPY ETF PCR',qqq:'纳指 100 · QQQ ETF PCR',dia:'道指 · DIA ETF PCR',daily:'单日成交量 PCR',r5:'5 日成交量 PCR',r20:'20 日成交量 PCR',r60:'60 日成交量 PCR',date:'日期',series:'曲线',p:'Put 成交量',c:'Call 成交量',axis:'Put / Call（倍）'},en:{index:'Index options · INDEX',total:'Options total · TOTAL',etp:'ETFs / ETPs',equity:'Single-stock options · EQUITY',spy:'S&P 500 · SPY ETF PCR',qqq:'Nasdaq-100 · QQQ ETF PCR',dia:'Dow · DIA ETF PCR',daily:'Daily volume PCR',r5:'5-session volume PCR',r20:'20-session volume PCR',r60:'60-session volume PCR',date:'Date',series:'Series',p:'Put volume',c:'Call volume',axis:'Put / Call (ratio)'}};
export function cboeMetricLabel(metric,language='zh'){
  const entry=marketMetricEntry(metric),words=names[language==='en'?'en':'zh'];
  return entry.type==='cboe'?words[entry.key]:words[entry.symbol.toLowerCase()]&&REFERENCE_METRICS.includes(entry.symbol.toLowerCase())?words[entry.symbol.toLowerCase()]:entry.symbol+(language==='en'?' · volume PCR':' · 成交量 PCR');
}
function rowMetric(row,metric){const entry=marketMetricEntry(metric),id=marketEntryId(entry);return row?.[id]||(entry.type==='cboe'?row?.[entry.key]:row?.[entry.symbol]||(REFERENCE_METRICS.includes(entry.symbol.toLowerCase())?row?.[entry.symbol.toLowerCase()]:null))||null;}

export function validCboeDay(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const stamp=Date.parse(date+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date;}
const amount=value=>Number.isFinite(value)&&value>=0?value:null;
export function referenceHistoryPayload(source,metric){
  const entry=marketMetricEntry(metric);if(entry.type!=='symbol')throw Error('INVALID_REFERENCE_METRIC');
  const id=marketEntryId(entry),instrument=source?.instruments?.[entry.symbol]||(source?.symbol===entry.symbol?source.instrument:null);
  const sourceUrl='https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query';
  const rows=withFiveSessionPcr(instrument?.rows).map(row=>{const value={daily:Number.isFinite(row.p)&&row.p>=0&&Number.isFinite(row.c)&&row.c>0?row.p/row.c:null,p:row.p,c:row.c,p5:row.p5,c5:row.c5,r5:row.r5,r5Reason:row.r5Reason,p20:row.p20??null,c20:row.c20??null,r20:row.r20??null,p60:row.p60??null,c60:row.c60??null,r60:row.r60??null};return {date:row.date,[id]:value,...(REFERENCE_METRICS.includes(entry.symbol.toLowerCase())?{[entry.symbol.toLowerCase()]:value}:{})};});
  return {rows,asof:rows.at(-1)?.date||null,actualEnd:rows.at(-1)?.date||null,calendarDate:source?.calendarDate||null,checkedAt:source?.checkedAt||source?.refresh?.checkedAt||null,sourceType:'occ',symbol:entry.symbol,sourceUrl,coverage:{start:rows[0]?.date||null,end:rows.at(-1)?.date||null}};
}
export function cboeHistoryView(payload,{metric='index',range='252',date=null}={}){
  const entry=marketMetricEntry(metric),canonicalMetric=marketEntryId(entry);
  if(!['126','252','all'].includes(String(range)))throw Error('INVALID_CBOE_RANGE');
  const end=date||payload?.requestedEnd||payload?.asof||payload?.actualEnd||null;
  if(end&&!validCboeDay(end))throw Error('INVALID_CBOE_DATE');
  const seen=new Set();
  const sourceRecords=(Array.isArray(payload?.rows)?payload.rows:[]).filter(row=>validCboeDay(row?.date)&&(!end||row.date<=end)).sort((a,b)=>a.date.localeCompare(b.date)).filter(row=>{if(seen.has(row.date))return false;seen.add(row.date);return true;});
  const five=withFiveSessionPcr(sourceRecords.map(row=>({...rowMetric(row,canonicalMetric),date:row.date,available:row.available})),{strictSessions:entry.type==='cboe',expectedSessionDates:payload?.expectedSessionDates});
  const byDate=new Map(five.map(row=>[row.date,row]));
  const records=sourceRecords.map(row=>{const value=rowMetric(row,canonicalMetric),extra=byDate.get(row.date);if(!value)return row;const enriched={...value,p5:extra.p5,c5:extra.c5,r5:extra.r5,derived5:extra.derived5,r5Reason:extra.r5Reason};return {...row,[canonicalMetric]:enriched,...(entry.type==='cboe'?{[entry.key]:enriched}:REFERENCE_METRICS.includes(entry.symbol.toLowerCase())?{[entry.symbol.toLowerCase()]:enriched}:{})};});
  const visible=String(range)==='all'?records:records.slice(-Number(range));
  const lastRow=records.at(-1)||null,selectedRow=records.find(row=>row.date===end)||null;
  const value=rowMetric(lastRow,canonicalMetric);
  return {metric:canonicalMetric,entry,range:String(range),requestedEnd:end,actualEnd:lastRow?.date||null,selectedRow,lastRow,visible,records,firstDate:records[0]?.date||null,point:value?{daily:amount(value.daily),r5:amount(value.r5),r20:amount(value.r20),r60:amount(value.r60)}:null};
}
export function cboeChartConfig(payload,options={}){
  const view=cboeHistoryView(payload,options),language=options.language==='en'?'en':'zh',words=names[language];
  const rows=view.visible.flatMap(row=>{const value=rowMetric(row,view.metric)||{};return [[row.date,words.daily,amount(value.daily),amount(value.p),amount(value.c)],[row.date,words.r5,amount(value.r5),amount(value.p5),amount(value.c5)],[row.date,words.r20,amount(value.r20),amount(value.p20),amount(value.c20)],[row.date,words.r60,amount(value.r60),amount(value.p60),amount(value.c60)]];});
  return {id:'cboe-history',title:`${isReferenceMetric(view.metric)?'OCC':'Cboe'} ${cboeMetricLabel(view.metric,language)} · ${view.actualEnd||'—'}`,showHeader:false,summary:language==='en'?'Daily PCR based on published volume counts and 5/20/60-session aggregate ratios. Derived categories are identified separately; missing windows remain blank.':'根据已发布成交量形成的单日及 5／20／60 日合计量 PCR；派生类别另作说明，缺失窗口留空。',height:330,columns:[words.date,words.series,'PCR',words.p,words.c],rows,spec:{type:'line',x:words.date,y:'PCR',series:words.series,yLabel:words.axis,startAtZero:false,showLegend:true,colors:{[words.daily]:CBOE_COLORS.daily,[words.r5]:CBOE_COLORS.r5,[words.r20]:CBOE_COLORS.r20,[words.r60]:CBOE_COLORS.r60},valueFormat:{style:'decimal',minimumFractionDigits:2,maximumFractionDigits:3},tooltipFields:[{field:words.p,label:words.p},{field:words.c,label:words.c}]}};
}
