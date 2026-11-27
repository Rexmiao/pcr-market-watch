// Provider OI stays separate from saved historical PCR and the original Cboe snapshot.
export const OI_SOURCE_KEY='pcr-dashboard:oi-source:v1';
export const readOiSource=value=>value==='saved'?'saved':'moomoo';
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
const stamp=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value?value:null;
export function observationDay(stampValue){
  const value=stamp(stampValue);if(!value)return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');
}
// A selected date means the New York day on which this observation was actually queried.
export function mergeOiSummaries(previous,payload,symbols,{observationDate=null}={}){
  const incoming=payload?.provider==='moomoo_webapi'&&Array.isArray(payload.items)?payload.items:[],next=new Map();
  for(const symbol of symbols){
    const matches=incoming.filter(item=>item?.symbol===symbol),item=matches.length===1?matches[0]:null,p=count(item?.putOi),c=count(item?.callOi),old=previous.get(symbol),archived=item?.archived===true&&date(item.observationDate)===observationDate&&observationDay(item.checkedAt)===observationDate;
    if(observationDate&&!archived){if(!payload&&old?.archived&&old.observationDate===observationDate)next.set(symbol,{...old,stale:true,status:'unavailable'});continue;}
    if(p!==null&&c!==null){
      const ratio=c>0&&Number.isFinite(p/c)?p/c:null;
      next.set(symbol,{symbol,p,c,ratio,provider:'moomoo_webapi',checkedAt:stamp(item.checkedAt),oiAsOf:item.oiAsOfConfirmed===true?date(item.oiAsOf):null,oiAsOfConfirmed:item.oiAsOfConfirmed===true&&!!date(item.oiAsOf),archived,observationDate:archived?observationDate:null,oiBasis:item.oiBasis==='previous_session'?'previous_session':'unknown',stale:item.stale===true,status:item.status||payload.status||'current'});
    }else if(old&&(!observationDate||old.observationDate===observationDate))next.set(symbol,{...old,stale:true,status:'unavailable'});
  }
  return next;
}
export function withOiSummaries(data,summaries,source='moomoo'){
  if(source==='saved')return {...data,instruments:Object.fromEntries(Object.entries(data.instruments).map(([symbol,instrument])=>[symbol,{...instrument,oi:instrument.oi?{...instrument.oi}:null}]))};
  return {...data,instruments:Object.fromEntries(Object.entries(data.instruments).map(([symbol,instrument])=>{
    const row=summaries.get(symbol);
    return [symbol,{...instrument,oi:row?{...row,source:'moomoo_webapi',dateLabel:null}:null}];
  }))};
}
