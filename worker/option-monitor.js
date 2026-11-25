// Public market-data normalization. No trading intent or opening/closing inference.
export function monitorNumber(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const number=Number(value);return Number.isFinite(number)&&number>=0?number:null;
}
export function monitorSymbol(value) {
  const symbol=String(value||'').trim().toUpperCase().replace(/^US\./,'');
  if(!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol))throw Error('INVALID_SYMBOL');
  return symbol;
}
export function monitorDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('INVALID_DATE');
  return value;
}
export function monitorToday(now=Date.now()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function monitorCode(security) {
  const value=typeof security==='string'?security:security?.code;
  return typeof value==='string'?'US.'+value.toUpperCase().replace(/^US\./,''):null;
}
export function monitorContract(code) {
  const match=String(code||'').match(/^US\.([A-Z][A-Z0-9.]*?)(\d{6})([CP])(\d{1,12})$/);
  if(!match)return null;
  const [,root,date,type,strike]=match,expiration=`20${date.slice(0,2)}-${date.slice(2,4)}-${date.slice(4,6)}`;
  try{monitorDate(expiration);}catch{return null;}
  return {contract:code,root,optionType:type==='C'?'CALL':'PUT',expiration,strike:Number(strike)/1000};
}
export function monitorChain(data,symbol,expiration) {
  const result=new Map();let visited=0;
  function visit(value,depth=0) {
    if(!value||typeof value!=='object'||depth>12||++visited>100000)return;
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
    const code=monitorCode(value.security),parsed=monitorContract(code);
    if(parsed&&parsed.root===symbol&&parsed.expiration===expiration)result.set(code,parsed);
    for(const [name,child] of Object.entries(value))if(name!=='security')visit(child,depth+1);
  }
  visit(data);return [...result.values()];
}
export function selectMonitorContracts(contracts,referencePrice,maxStrikes=20) {
  const strikes=[...new Set(contracts.map(c=>c.strike))].sort((a,b)=>a-b);
  const center=Number.isFinite(referencePrice)&&referencePrice>0?referencePrice:strikes[Math.floor(strikes.length/2)];
  const chosen=new Set([...strikes].sort((a,b)=>Math.abs(a-center)-Math.abs(b-center)||a-b).slice(0,maxStrikes));
  return contracts.filter(c=>chosen.has(c.strike)).sort((a,b)=>a.strike-b.strike||a.optionType.localeCompare(b.optionType)).slice(0,maxStrikes*2);
}
export function monitorTimestamp(value) {
  let number=monitorNumber(value);if(number===null||number===0)return null;
  const milliseconds=number>1e14?number/1000:number>1e11?number:number*1000;
  return milliseconds>=946684800000&&milliseconds<4102444800000?new Date(milliseconds).toISOString():null;
}
export function normalizeMonitorContracts(selected,snapshots,previous=null,now=Date.now()) {
  const lookup=new Map(snapshots.map(s=>[monitorCode(s.basic?.security||s.security),s]));
  const old=new Map((previous?.contracts||[]).map(c=>[c.contract,c]));
  return selected.map(contract=>{
    const snapshot=lookup.get(contract.contract),basic=snapshot?.basic||{},option=snapshot?.option_ex_data||snapshot?.option_extend_data||{};
    const volume=monitorNumber(basic.volume),openInterest=monitorNumber(option.open_interest??option.option_open_interest);
    const prior=old.get(contract.contract),time=monitorTimestamp(basic.update_timestamp);
    const sameObservationDay=previous?.observedDate&&previous.observedDate===monitorToday(now)&&volume!==null&&prior?.volume!==null&&prior?.volume!==undefined;
    return {...contract,volume,openInterest,iv:monitorNumber(option.implied_volatility??option.option_implied_volatility),price:monitorNumber(basic.cur_price),
      observationTime:time,providerTimeRaw:typeof basic.update_time==='string'?basic.update_time.slice(0,64):null,
      volumeOiRatio:volume!==null&&openInterest>0?volume/openInterest:null,
      volumeIncreaseSincePreviousCheck:sameObservationDay&&volume>=prior.volume?volume-prior.volume:null,
      previousCheckTime:sameObservationDay?previous.checkedAt:null,oiAsOf:null,oiBasis:'previous_session',available:Boolean(snapshot)};
  });
}
export function monitorOverview(contracts) {
  function sum(type,field){const rows=contracts.filter(c=>c.optionType===type);return rows.length&&rows.every(c=>c[field]!==null)?rows.reduce((n,c)=>n+c[field],0):null;}
  const callVolume=sum('CALL','volume'),putVolume=sum('PUT','volume'),callOi=sum('CALL','openInterest'),putOi=sum('PUT','openInterest');
  return {callVolume,putVolume,volumePcr:putVolume!==null&&callVolume>0?putVolume/callVolume:null,callOi,putOi,oiPcr:putOi!==null&&callOi>0?putOi/callOi:null,
    oiAsOf:null,oiBasis:'previous_session',volumeAsOf:null,coverageLabel:'selected_expiry_strikes'};
}
export function normalizeMonitorTrades(contract,tickers,now=Date.now()) {
  const unique=new Map();
  for(const ticker of tickers.slice(0,200)) {
    const contracts=monitorNumber(ticker.volume),price=monitorNumber(ticker.price),fillTime=monitorTimestamp(ticker.timestamp);
    if(contracts===null||contracts===0||price===null)continue;
    // The documented ticker enum is Buy=1, Sell=2, Neutral=3. It is not open/close.
    const direction=String(ticker.dir||'').toUpperCase(),side=['1','BUY'].includes(direction)?'buy':['2','SELL'].includes(direction)?'sell':['3','NEUTRAL'].includes(direction)?'neutral':'unknown';
    const rawTime=typeof ticker.time==='string'?ticker.time.slice(0,64):null;
    if(fillTime&&(Date.parse(fillTime)>now+60000||monitorToday(Date.parse(fillTime))!==monitorToday(now)))continue;
    if(!fillTime&&(!rawTime||!rawTime.startsWith(monitorToday(now))))continue;
    const id=[contract.contract,String(ticker.sequence||''),fillTime||rawTime,price,contracts].join(':').slice(0,190);
    unique.set(id,{id,symbol:contract.root,...contract,contracts,price,amount:monitorNumber(ticker.turnover),amountBasis:'provider_turnover',
      side,sideBasis:'provider_classification',openClose:'unknown',fillTime,fillTimeRaw:rawTime,iv:null,volume:null,openInterest:null,volumeOiRatio:null});
  }
  return [...unique.values()];
}
export function emptyMonitor(symbol=null,status='unavailable',code='NOT_CHECKED') {
  return {schemaVersion:1,symbol,provider:'moomoo',status,checkedAt:null,observationTime:null,observedDate:null,stale:false,
    coverage:{mode:'selected_expiry_strikes',isComplete:false,availableExpirations:[],selectedContracts:0,totalAvailableContracts:0,tradeContractsChecked:0},
    overview:monitorOverview([]),contracts:[],events:[],alerts:[],oiChanges:[],errors:[{source:'monitor',code,message:code}],
    notice:'Selected-expiry/strike observations only. OI settlement date is unknown; trades do not identify opening or closing positions.'};
}
export function handleOptionsMonitorApi(request) {
  if(!new URL(request.url).pathname.startsWith('/api/options-monitor'))return null;
  return new Response(JSON.stringify(emptyMonitor(null,'local_backend_required','LOCAL_BACKEND_REQUIRED')),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
