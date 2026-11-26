export const MONITOR_PREFERENCES_KEY='pcr-dashboard:options-monitor:v1';
export const DEFAULT_MONITOR_PREFERENCES=Object.freeze({symbol:null,provider:'auto',expiration:'',interval:0,minContracts:500,minVolumeOi:2,type:'all',onlyMatches:false,open:true});

export function monitorNumber(value){return typeof value==='number'&&Number.isFinite(value)?value:null;}
export function monitorSymbol(value){return typeof value==='string'&&/^[A-Z][A-Z0-9.]{0,9}$/.test(value.trim().toUpperCase())?value.trim().toUpperCase():null;}
export function monitorExpiration(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const stamp=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?value:'';
}
export function readMonitorPreferences(input){
  const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return {
    symbol:monitorSymbol(source.symbol),provider:['auto','desktop','webapi'].includes(source.provider)?source.provider:'auto',expiration:monitorExpiration(source.expiration),
    interval:[0,30,60,120].includes(source.interval)?source.interval:0,
    minContracts:Number.isInteger(source.minContracts)&&source.minContracts>=1&&source.minContracts<=1000000?source.minContracts:500,
    minVolumeOi:monitorNumber(source.minVolumeOi)!==null&&source.minVolumeOi>=0.1&&source.minVolumeOi<=1000?source.minVolumeOi:2,
    type:['all','call','put'].includes(source.type)?source.type:'all',
    onlyMatches:source.onlyMatches===true,open:source.open!==false,
  };
}
export function monitorConnectionMode(preferences,payload){
  if(['desktop','webapi'].includes(payload?.connectionMode))return payload.connectionMode;
  if(payload?.provider==='moomoo_webapi'||payload?.coverage?.mode==='provider_symbol_overview')return 'webapi';
  return ['desktop','webapi'].includes(preferences?.provider)?preferences.provider:'auto';
}
export function monitorWatchSymbols(personal,market){
  const values=[...(Array.isArray(personal?.items)?personal.items:[]).map(item=>item?.symbol),
    ...(Array.isArray(market?.items)?market.items:[]).filter(item=>item?.type==='symbol').map(item=>item.symbol)];
  return [...new Set(values.map(monitorSymbol).filter(Boolean))];
}
export function monitorOptionType(value){const type=typeof value==='string'?value.toLowerCase():'';return type==='call'||type==='put'?type:'unknown';}
export function monitorTypeMatches(item,type){return type==='all'||monitorOptionType(item?.optionType)===type;}
export function monitorVolumeOi(contract){
  const volume=monitorNumber(contract?.volume),oi=monitorNumber(contract?.openInterest);
  return volume!==null&&volume>=0&&oi!==null&&oi>0?volume/oi:null;
}
export function monitorEventKey(event){
  return String(event?.id??[event?.contract,event?.fillTime,event?.contracts,event?.price,event?.side].join('|'));
}
export function monitorTradeSide(value){
  const side=typeof value==='string'?value.toLowerCase():'';
  return ['buy','sell','neutral'].includes(side)?side:'unknown';
}
export function formatMonitorTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!/(?:Z|[+-]\d\d:\d\d)$/.test(value)||!monitorExpiration(value.slice(0,10)))return null;
  const instant=new Date(value);if(!Number.isFinite(instant.valueOf()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(instant).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ET (${parts.timeZoneName})`;
}
// Activity metadata must follow its event ID. Contract-level snapshots have different clocks.
export function monitorAlertDetails(alert,contracts,events,{checkedAt=null}={}){
  const activity=alert?.type==='large_trade';
  const event=activity&&typeof alert.eventId==='string'?(Array.isArray(events)?events:[]).find(item=>monitorEventKey(item)===alert.eventId):null;
  const snapshot=!activity?(Array.isArray(contracts)?contracts:[]).find(item=>item?.contract===alert?.contract):null;
  const source=activity?event:snapshot;
  const validTime=value=>formatMonitorTime(value)?value:null;
  return {
    kind:activity?'activity':alert?.type==='interval_volume'?'interval':'snapshot',
    contract:source?{root:monitorSymbol(source.root||source.symbol),optionType:monitorOptionType(source.optionType),expiration:monitorExpiration(source.expiration),strike:monitorNumber(source.strike)}:null,
    side:activity?monitorTradeSide(event?.side):'unknown',sideBasis:'provider_classification',openClose:'unknown',
    fillTime:activity?validTime(event?.fillTime):null,
    observationTime:activity?null:validTime(snapshot?.observationTime),
    previousCheckTime:activity?null:validTime(snapshot?.previousCheckTime),
    checkedAt:activity?null:validTime(checkedAt),
  };
}
export function monitorActivity(contracts,events,preferences){
  const prefs=readMonitorPreferences(preferences),seen=new Set(),alerts=[];
  const append=value=>{if(!seen.has(value.id)){seen.add(value.id);alerts.push(value);}};
  for(const event of Array.isArray(events)?events:[]){
    if(!monitorTypeMatches(event,prefs.type))continue;
    const size=monitorNumber(event.contracts);
    if(size!==null&&size>=prefs.minContracts)append({id:'print|'+monitorEventKey(event),type:'large_trade',contract:event.contract||null,optionType:monitorOptionType(event.optionType),contracts:size,eventId:monitorEventKey(event),time:event.fillTime||null});
  }
  for(const contract of Array.isArray(contracts)?contracts:[]){
    if(!monitorTypeMatches(contract,prefs.type))continue;
    const ratio=monitorVolumeOi(contract),change=monitorNumber(contract.volumeIncreaseSincePreviousCheck);
    if(ratio!==null&&ratio>=prefs.minVolumeOi)append({id:'volume-oi|'+String(contract.contract),type:'volume_oi',contract:contract.contract||null,optionType:monitorOptionType(contract.optionType),ratio,time:contract.observationTime||null});
    if(change!==null&&change>=prefs.minContracts)append({id:'interval-volume|'+String(contract.contract),type:'interval_volume',contract:contract.contract||null,optionType:monitorOptionType(contract.optionType),contracts:change,time:contract.observationTime||null});
  }
  return alerts;
}
