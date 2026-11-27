import {pcrSession,validPcrDate} from './rolling-pcr.js';

// Observational rules for already-normalized volume PCRs. Ordering, changes
// and short-window persistence are separate facts, not trading signals.
export const PCR_INTERPRETATION_FIELDS=['r5','r20','r60'];
export const PCR_INTERPRETATION_EPSILON=1e-12;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
function shift(day,n){const value=new Date(day+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+n);return value.toISOString().slice(0,10);}
export function previousPcrSession(day){
  if(!validPcrDate(day))return null;
  let candidate=shift(day,-1);
  for(let count=0;count<14;count++,candidate=shift(candidate,-1))if(pcrSession(candidate))return candidate;
  return null;
}
function change(value,previous){
  if(value===null||previous===null)return {delta:null,direction:'unknown'};
  const raw=value-previous,delta=Math.abs(raw)<=PCR_INTERPRETATION_EPSILON?0:raw;
  return {delta,direction:delta>0?'up':delta<0?'down':'flat'};
}
function orderingOf(values){
  if(PCR_INTERPRETATION_FIELDS.some(field=>values[field]===null))return null;
  const sorted=[...PCR_INTERPRETATION_FIELDS].sort((a,b)=>values[b]-values[a]),groups=[];
  for(const field of sorted){const group=groups.at(-1);if(group&&Math.abs(values[group[0]]-values[field])<=PCR_INTERPRETATION_EPSILON)group.push(field);else groups.push([field]);}
  // Tied labels retain a fixed 5/20/60 order. Grouping uses the group's maximum,
  // so floating tolerance never chains together values farther than epsilon.
  return groups.map(group=>group.sort((a,b)=>PCR_INTERPRETATION_FIELDS.indexOf(a)-PCR_INTERPRETATION_FIELDS.indexOf(b)));
}

export function interpretPcr(input,{date=null}={}){
  if(date!==null&&!validPcrDate(date))throw Error('INVALID_PCR_INTERPRETATION_DATE');
  const rows=new Map();
  for(const row of Array.isArray(input)?input:[])if(validPcrDate(row?.date))rows.set(row.date,{date:row.date,...Object.fromEntries(PCR_INTERPRETATION_FIELDS.map(field=>[field,finite(row[field])]))});
  const requestedDate=date||[...rows.keys()].sort().at(-1)||null;
  // An explicit actual date is exact. Missing current data must not be replaced
  // by an earlier observation, nor by the latest observation in the payload.
  const current=requestedDate?rows.get(requestedDate)||null:null,actualDate=current?.date||null;
  const sessionAnchor=actualDate!==null&&pcrSession(actualDate);
  const previousDate=actualDate?previousPcrSession(actualDate):null,previous=previousDate?rows.get(previousDate)||null:null;
  const fields=Object.fromEntries(PCR_INTERPRETATION_FIELDS.map(field=>{
    const value=current?.[field]??null,prior=previous?.[field]??null;
    return [field,{value,previous:prior,...(sessionAnchor?change(value,prior):{delta:null,direction:'unknown'}),reason:value===null?'current_unavailable':!sessionAnchor?'non_session_anchor':!previous?'missing_previous_session':prior===null?'previous_unavailable':null}];
  }));
  const dates=actualDate?[actualDate]:[];
  while(dates.length&&dates.length<4){const prior=previousPcrSession(dates[0]);if(!prior)break;dates.unshift(prior);}
  const missingDates=dates.filter(day=>!rows.has(day));
  const missingValues=dates.flatMap(day=>{
    const row=rows.get(day);if(!row)return [];
    const missing=['r5','r20'].filter(field=>row[field]===null);return missing.length?[{date:day,fields:missing}]:[];
  });
  const complete=sessionAnchor&&dates.length===4&&!missingDates.length&&!missingValues.length;
  const sameThree=direction=>complete&&dates.slice(1).every((day,index)=>['r5','r20'].every(field=>change(rows.get(day)[field],rows.get(dates[index])[field]).direction===direction));
  const insufficient=!sessionAnchor||PCR_INTERPRETATION_FIELDS.some(field=>fields[field].value===null||fields[field].previous===null);
  let state='mixed';
  if(insufficient)state='insufficient';
  else if(sameThree('up'))state='continuation_up';
  else if(sameThree('down'))state='continuation_down';
  else if(['up','down'].includes(fields.r5.direction)&&fields.r20.direction===fields.r5.direction)state='early_alignment_'+fields.r5.direction;
  else if(['up','down'].includes(fields.r5.direction))state='short_term_'+fields.r5.direction;
  else if(PCR_INTERPRETATION_FIELDS.every(field=>fields[field].direction==='flat'))state='flat';
  return {requestedDate,actualDate,previousDate,ordering:current?orderingOf(current):null,fields,state,
    continuation:{requiredComparisons:3,dates,complete,missingDates,missingValues,reason:!actualDate?'missing_current':!sessionAnchor?'non_session_anchor':missingDates.length?'missing_session':missingValues.length?'missing_value':null}};
}
