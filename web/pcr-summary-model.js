import {withFiveSessionPcr} from './rolling-pcr.js';
import {interpretPcr} from './pcr-interpretation.js';
import {historyContext} from './history-context.js';
import {normalizeMarketEntry,marketEntryId} from './market-pcr-settings.js';
import {normalizeTicker} from './watchlist-model.js';

const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export function validSummaryDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const stamp=Date.parse(value+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;}
function shift(day,n){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);}
const dow=day=>new Date(day+'T12:00:00Z').getUTCDay();
function nthMonday(year,month,n){const first=`${year}-${String(month).padStart(2,'0')}-01`;return shift(first,(8-dow(first))%7+7*(n-1));}
const observed=day=>dow(day)===6?shift(day,-1):dow(day)===0?shift(day,1):day;
function easter(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
// Same U.S. session rules as worker/backend.js: UTC-midday arithmetic keeps
// weekends/DST independent of the device time zone. Unknown closures yield a
// missing comparison, rather than borrowing a previous available observation.
export function summaryTradingSession(day){
  if(!validSummaryDate(day)||[0,6].includes(dow(day)))return false;
  const year=Number(day.slice(0,4)),jan1=`${year}-01-01`;let memorial=`${year}-05-31`;while(dow(memorial)!==1)memorial=shift(memorial,-1);
  const thanksgiving=shift(`${year}-11-01`,(11-dow(`${year}-11-01`))%7+21);
  const holidays=[dow(jan1)===0?shift(jan1,1):jan1,nthMonday(year,1,3),nthMonday(year,2,3),shift(easter(year),-2),memorial,observed(`${year}-07-04`),nthMonday(year,9,1),thanksgiving,observed(`${year}-12-25`)];
  if(year>=2022)holidays.push(observed(`${year}-06-19`));
  if(year===2025)holidays.push('2025-01-09');
  return !holidays.includes(day);
}
export function previousSummarySession(day){if(!validSummaryDate(day))return null;let previous=shift(day,-1);for(let count=0;count<14;count++,previous=shift(previous,-1))if(summaryTradingSession(previous))return previous;return null;}

export function summaryEntries(marketItems=[],watchItems=[]){
  const macros=[],references=[],watch=[],seen=new Set();
  for(const value of Array.isArray(marketItems)?marketItems.slice(0,40):[]){let entry;try{entry=normalizeMarketEntry(value);}catch{continue;}const id=marketEntryId(entry);if(seen.has(id))continue;seen.add(id);(entry.type==='cboe'?macros:references).push({...entry,id,group:entry.type==='cboe'?'cboe':'market'});}
  for(const value of Array.isArray(watchItems)?watchItems.slice(0,40):[]){const symbol=normalizeTicker(typeof value==='string'?value:value?.symbol);if(!symbol)continue;const id='symbol:'+symbol;if(seen.has(id))continue;seen.add(id);watch.push({type:'symbol',symbol,id,group:'watch'});}
  return [...macros,...references,...watch];
}
export function summaryRecords(entry,{instrument=null,cboeHistory=null}={}){
  const byDate=new Map(),source=entry.type==='cboe'?cboeHistory?.rows:instrument?.rows;
  const fiveRows=withFiveSessionPcr((Array.isArray(source)?source:[]).map(row=>entry.type==='cboe'?{...(row[entry.id]||row[entry.key]),date:row.date,available:row.available}:row),{strictSessions:entry.type==='cboe',expectedSessionDates:cboeHistory?.expectedSessionDates});
  const fiveByDate=new Map(fiveRows.map(row=>[row.date,row]));
  for(const row of Array.isArray(source)?source:[]){
    if(!validSummaryDate(row?.date))continue;
    if(entry.type==='cboe'&&row.available===false)continue;
    const values=entry.type==='cboe'?(row[entry.id]||row[entry.key]):row;
    let daily=null;
    if(entry.type==='cboe')daily=values?.c===0?null:finite(values?.daily);
    else if(finite(values?.p)!==null&&finite(values?.c)!==null&&values.c>0)daily=values.p/values.c;
    const five=fiveByDate.get(row.date);byDate.set(row.date,{date:row.date,daily,r5:five?.r5??null,p5:five?.p5??null,c5:five?.c5??null,r5Reason:five?.r5Reason??null,derived5:five?.derived5===true,r20:values?.c20===0?null:finite(values?.r20),r60:values?.c60===0?null:finite(values?.r60),derived:values?.derived===true,derived20:values?.derived20===true,derived60:values?.derived60===true});
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function summaryRow(entry,{date=null,instrument=null,cboeHistory=null,checkedAt=null,loading=false,failed=false}={}){
  const rows=summaryRecords(entry,{instrument,cboeHistory}),requested=validSummaryDate(date)?date:rows.at(-1)?.date||null;
  const context=historyContext(rows,{date:requested,field:'r20',range:'all'}),actualDate=context.actualDate,point=context.point;
  const priorDate=actualDate?previousSummarySession(actualDate):null,previous=priorDate?rows.find(row=>row.date===priorDate):null;
  const original=actualDate?rows.find(row=>row.date===actualDate):null,priorRank=rows.filter(row=>actualDate&&row.date<actualDate&&row.r20!==null).slice(-252);
  const daily=point?.daily??null,old=previous?.daily??null,delta=daily!==null&&old!==null?daily-old:null;
  return {...entry,requestedDate:requested,actualDate,previousDate:priorDate,daily,r5:point?.r5??null,p5:original?.p5??null,c5:original?.c5??null,r5Reason:original?.r5Reason??null,r20:point?.r20??null,r60:point?.r60??null,
    interpretation:interpretPcr(actualDate?rows:[],{date:actualDate}),
    delta:delta!==null&&Math.abs(delta)<1e-12?0:delta,comparison:!point?'no_data':daily===null?'current_unavailable':!previous?'missing_previous':old===null?'previous_unavailable':'available',
    percentile:context.stats.r20.percentile,samples:context.stats.r20.sampleCount,comparisonSamples:252,
    trend:point?.r20!==null&&point?.r20!==undefined&&point?.r60!==null&&point?.r60!==undefined?(point.r20>point.r60?'higher':point.r20<point.r60?'lower':'equal'):'unknown',
    source:entry.type==='cboe'?'Cboe':'OCC',derived:original?.derived===true||original?.derived5===true||original?.derived20===true||original?.derived60===true||priorRank.some(row=>row.derived20),checkedAt,loading,failed};
}
