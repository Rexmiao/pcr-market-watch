// Cache-only calculations. These helpers never fetch, fill a missing day or
// change the supplied 20/60-session statistics.
export function validPcrDate(day){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;const value=Date.parse(day+'T12:00:00Z');return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===day;}
const shift=(day,n)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
const weekday=day=>new Date(day+'T12:00:00Z').getUTCDay();
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
// Matches the existing worker Cboe regular-session rules, including the 2025
// national day of mourning. An optional supplied calendar has the same bounds
// semantics as the worker's expectedSessionDates.
export function pcrSession(day){
  if(!validPcrDate(day)||[0,6].includes(weekday(day)))return false;
  const y=Number(day.slice(0,4)),nthMonday=(month,n)=>{const first=`${y}-${String(month).padStart(2,'0')}-01`;return shift(first,(8-weekday(first))%7+7*(n-1));};
  const observed=value=>weekday(value)===6?shift(value,-1):weekday(value)===0?shift(value,1):value;
  let memorial=`${y}-05-31`;while(weekday(memorial)!==1)memorial=shift(memorial,-1);
  const jan1=`${y}-01-01`,nov1=`${y}-11-01`,thanksgiving=shift(nov1,(11-weekday(nov1))%7+21);
  const holidays=[weekday(jan1)===0?shift(jan1,1):jan1,nthMonday(1,3),nthMonday(2,3),shift(easter(y),-2),memorial,observed(`${y}-07-04`),nthMonday(9,1),thanksgiving,observed(`${y}-12-25`)];
  if(y>=2022)holidays.push(observed(`${y}-06-19`));if(y===2025)holidays.push('2025-01-09');
  return !holidays.includes(day);
}
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const raw=(row,key,alias)=>Object.hasOwn(row,key)?row[key]:row[alias];

export function withFiveSessionPcr(input,{strictSessions=false,expectedSessionDates=null}={}){
  const byDate=new Map();for(const row of Array.isArray(input)?input:[])if(validPcrDate(row?.date))byDate.set(row.date,row);
  const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),lookup=new Map(rows.map(row=>[row.date,row]));
  const supplied=Array.isArray(expectedSessionDates)&&expectedSessionDates.length&&expectedSessionDates.every(validPcrDate)?[...new Set(expectedSessionDates)].sort():[],sessions=new Set(supplied);
  const session=day=>supplied.length&&day>=supplied[0]&&day<=supplied.at(-1)?sessions.has(day):pcrSession(day);
  return rows.map((row,index)=>{
    let window=rows.slice(Math.max(0,index-4),index+1),reason=null;
    if(strictSessions){
      const dates=[];for(let day=row.date,guard=0;dates.length<5&&guard<40;day=shift(day,-1),guard++)if(session(day))dates.unshift(day);
      window=dates.map(day=>lookup.get(day));
      if(!session(row.date)||dates.length<5||window.some(value=>!value))reason='missing_session';
    }else if(window.length<5)reason='insufficient_history';
    if(!reason&&window.some(value=>value.available===false||count(raw(value,'p','put'))===null||count(raw(value,'c','call'))===null))reason='missing_volume';
    let p5=null,c5=null,derived5=null;
    if(!reason){
      const puts=window.reduce((sum,value)=>sum+BigInt(raw(value,'p','put')),0n),calls=window.reduce((sum,value)=>sum+BigInt(raw(value,'c','call')),0n),max=BigInt(Number.MAX_SAFE_INTEGER);
      if(puts>max||calls>max)reason='unsafe_volume';else{p5=Number(puts);c5=Number(calls);derived5=window.some(value=>value.derived===true);if(!c5)reason='zero_call';}
    }
    return {...row,p5,c5,r5:c5>0?p5/c5:null,derived5,r5Reason:reason,r5Samples:window.filter(value=>value&&value.available!==false&&count(raw(value,'p','put'))!==null&&count(raw(value,'c','call'))!==null).length};
  });
}
