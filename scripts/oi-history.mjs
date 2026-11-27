// Append-only vendor OI observations. Query dates are New York calendar dates,
// independently of a vendor-confirmed settlement date (usually unavailable).
const PROVIDER='moomoo_webapi';
const COVERAGE='provider_symbol_overview';
const SYMBOL=/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)?$/;
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function validOiDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;}
export function oiObservationDate(value){const parsed=stamp(value);if(!parsed)return null;const parts=Object.fromEntries(formatter.formatToParts(new Date(parsed)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
function symbolsList(symbols){if(!Array.isArray(symbols)||!symbols.length||symbols.length>40||symbols.some(symbol=>typeof symbol!=='string'||symbol.length>10||!SYMBOL.test(symbol)||/^(US|HK|SH|SZ|SG|JP|AU|CA)\./.test(symbol))||new Set(symbols).size!==symbols.length)throw Error('INVALID_SYMBOLS');return [...symbols].sort();}
function normalize(value,{legacy=false}={}){
  if(!value||typeof value!=='object'||!SYMBOL.test(value.symbol||'')||value.symbol.length>10||value.provider!==PROVIDER||value.coverage!==COVERAGE||value.oiBasis!=='previous_session')return null;
  if(!legacy&&(value.stale===true||['failed','unavailable'].includes(value.status)))return null;
  const checkedAt=stamp(value.checkedAt),putOi=count(value.putOi),callOi=count(value.callOi);
  if(!checkedAt||(putOi===null&&callOi===null))return null;
  const observationDate=oiObservationDate(checkedAt);
  const oiAsOf=value.oiAsOfConfirmed===true&&validOiDate(value.oiAsOf)&&value.oiAsOf<=observationDate?value.oiAsOf:null;
  return {symbol:value.symbol,provider:PROVIDER,putOi,callOi,oiPcr:putOi!==null&&callOi!==null&&callOi>0?putOi/callOi:null,checkedAt,observationDate,oiAsOf,oiAsOfConfirmed:oiAsOf!==null,oiBasis:'previous_session',coverage:COVERAGE,stale:false,status:putOi===null||callOi===null||callOi===0?'partial':'current',errors:[],archived:true};
}
function missing(symbol,date){return {symbol,provider:PROVIDER,putOi:null,callOi:null,oiPcr:null,checkedAt:null,observationDate:date,oiAsOf:null,oiAsOfConfirmed:false,oiBasis:'previous_session',coverage:COVERAGE,stale:false,status:'unavailable',errors:[],archived:true};}
function insert(database,item,reason){return database.prepare('INSERT OR IGNORE INTO oi_summary_snapshots(symbol,provider,checked_at,observation_date,oi_as_of,oi_as_of_confirmed,payload_json,reason) VALUES(?,?,?,?,?,?,?,?)').bind(item.symbol,PROVIDER,item.checkedAt,item.observationDate,item.oiAsOf,item.oiAsOfConfirmed?1:0,JSON.stringify(item),reason);}

export function createOiHistoryStore({database,now=()=>Date.now()}={}){
  let importPending;
  const supported=()=>Boolean(database?.prepare&&database?.batch);
  async function archive(value,{reason='refresh'}={}){
    if(!['refresh','daily','legacy_cache'].includes(reason))throw Error('INVALID_ARCHIVE_REASON');
    const item=normalize(value,{legacy:reason==='legacy_cache'});if(!item)return {stored:false,reason:'not_a_fresh_observation'};
    if(!supported())throw Error('LOCAL_STORAGE_UNAVAILABLE');
    const results=await database.batch([insert(database,item,reason)]);
    return {stored:(results[0]?.meta?.changes||0)>0,item};
  }
  async function importLatestCache(){
    if(!supported())return {imported:0,supported:false};
    if(!importPending)importPending=(async()=>{
      const rows=(await database.prepare('SELECT symbol,payload_json FROM oi_summary_cache ORDER BY checked_at DESC,symbol LIMIT 100').all()).results||[];
      const items=rows.flatMap(row=>{try{const value=JSON.parse(row.payload_json);if(value.symbol!==row.symbol)return [];const item=normalize(value,{legacy:true});return item?[item]:[];}catch{return [];}});
      const result=items.length?await database.batch(items.map(item=>insert(database,item,'legacy_cache'))):[];
      return {imported:result.reduce((total,item)=>total+(item?.meta?.changes||0),0),supported:true};
    })().catch(error=>{importPending=null;throw error;});
    return await importPending;
  }
  async function readDate(input,date){
    const symbols=symbolsList(input);if(!validOiDate(date))throw Error('INVALID_DATE');
    if(!supported())return symbols.map(symbol=>missing(symbol,date));
    const placeholders=symbols.map(()=>'?').join(',');
    const rows=(await database.prepare(`SELECT s.symbol,s.payload_json FROM oi_summary_snapshots s WHERE s.provider=? AND s.observation_date=? AND s.symbol IN (${placeholders}) AND s.checked_at=(SELECT MAX(h.checked_at) FROM oi_summary_snapshots h WHERE h.symbol=s.symbol AND h.provider=s.provider AND h.observation_date=s.observation_date) ORDER BY s.symbol`).bind(PROVIDER,date,...symbols).all()).results||[];
    const bySymbol=new Map();for(const row of rows){try{const item=normalize(JSON.parse(row.payload_json));if(item&&item.symbol===row.symbol&&item.observationDate===date)bySymbol.set(item.symbol,item);}catch{}}
    return symbols.map(symbol=>bySymbol.get(symbol)||missing(symbol,date));
  }
  async function summary(input){
    const symbols=symbolsList(input),rangeStart=oiObservationDate(new Date(now()-3660*86400000).toISOString());
    if(!supported())return {supported:false,available:false,dates:[],coverageByDate:{},totalSnapshots:0,rangeStart,timeZone:'America/New_York'};
    const placeholders=symbols.map(()=>'?').join(',');
    const dates=(await database.prepare(`SELECT s.observation_date,COUNT(*) AS count,SUM(CASE WHEN json_extract(s.payload_json,'$.putOi') IS NOT NULL AND json_extract(s.payload_json,'$.callOi') IS NOT NULL THEN 1 ELSE 0 END) AS complete_count FROM oi_summary_snapshots s WHERE s.provider=? AND s.symbol IN (${placeholders}) AND s.observation_date>=? AND s.checked_at=(SELECT MAX(h.checked_at) FROM oi_summary_snapshots h WHERE h.symbol=s.symbol AND h.provider=s.provider AND h.observation_date=s.observation_date) GROUP BY s.observation_date ORDER BY s.observation_date`).bind(PROVIDER,...symbols,rangeStart).all()).results||[];
    const total=await database.prepare(`SELECT COUNT(*) AS count,MIN(observation_date) AS first_date,MAX(observation_date) AS last_date FROM oi_summary_snapshots WHERE provider=? AND symbol IN (${placeholders})`).bind(PROVIDER,...symbols).first();
    return {supported:true,available:true,dates:dates.map(row=>row.observation_date),coverageByDate:Object.fromEntries(dates.map(row=>[row.observation_date,{count:row.count,completeCount:row.complete_count}])),totalSnapshots:total?.count||0,firstDate:total?.first_date||null,lastDate:total?.last_date||null,rangeStart,timeZone:'America/New_York'};
  }
  return {archive,importLatestCache,readDate,summary};
}
