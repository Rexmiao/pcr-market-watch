// Pure normalization for provider-filtered options activity, not certified raw prints.
import {monitorContract,monitorDate,monitorNumber,monitorSymbol,monitorTimestamp,monitorToday} from './option-monitor.js';

const ACTIVITY_LIMIT=300;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
const array=value=>Array.isArray(value)?value:null;
const numeric=monitorNumber;
function code(value){return typeof value==='string'?value.trim().toUpperCase():null;}
function data(response){
  const envelope=object(response);if(!envelope)return null;
  if(Object.hasOwn(envelope,'ret_code')&&envelope.ret_code!==0&&envelope.ret_code!=='0')return null;
  return object(envelope.data)||envelope;
}
function microseconds(value){
  const stamp=numeric(value);
  // The WebAPI documents these fields in Unix microseconds. Do not guess seconds.
  return stamp!==null&&Number.isSafeInteger(stamp)&&stamp>=946684800000000&&stamp<4102444800000000?monitorTimestamp(stamp):null;
}
function ratio(put,call){const value=put!==null&&call!==null&&call>0?put/call:null;return value!==null&&Number.isFinite(value)?value:null;}
function overviewFor(item){
  const callVolume=numeric(item?.call_volume),putVolume=numeric(item?.put_volume),callOi=numeric(item?.call_open_interest),putOi=numeric(item?.put_open_interest);
  return {callVolume,putVolume,volumePcr:ratio(putVolume,callVolume),callOi,putOi,oiPcr:ratio(putOi,callOi),oiAsOf:null,oiBasis:'previous_session',volumeAsOf:null,coverageLabel:'provider_symbol_overview'};
}
function activityRecord(raw,symbol,today,now){
  if(!object(raw)||code(raw.owner)!=='US.'+symbol)return null;
  const parsed=monitorContract(code(raw.option));if(!parsed||parsed.root!==symbol)return null;
  const suppliedType=code(raw.option_type);
  if(['CALL','PUT'].includes(suppliedType)&&suppliedType!==parsed.optionType)return null;
  const suppliedStrike=numeric(raw.strike_price);
  if(suppliedStrike!==null&&Math.abs(suppliedStrike-parsed.strike)>0.000001)return null;
  const fillTime=microseconds(raw.fill_timestamp),size=numeric(raw.volume),price=numeric(raw.price);
  if(!fillTime||monitorToday(Date.parse(fillTime))!==today||Date.parse(fillTime)>now+60000||size===null||size<=0||price===null)return null;
  const direction=code(raw.ticker_type),side=direction==='BUY'?'buy':direction==='SELL'?'sell':direction==='NEUTRAL'?'neutral':'unknown';
  const volume=numeric(raw.total_volume),openInterest=numeric(raw.total_open_interest);
  const id=['webapi',parsed.contract,String(raw.fill_timestamp),String(price),String(size),side].join('|');
  return {id,symbol,...parsed,contracts:size,price,amount:numeric(raw.turnover),amountBasis:'provider_turnover',side,sideBasis:'provider_classification',openClose:'unknown',fillTime,fillTimeRaw:null,providerTimeRaw:null,iv:numeric(raw.iv),volume,openInterest,volumeOiRatio:ratio(volume,openInterest),recordKind:'provider_activity',source:'moomoo_webapi',oiAsOf:null,oiBasis:'previous_session'};
}
function contractsFor(events,prior,now){
  const latest=new Map();for(const event of events){const current=latest.get(event.contract);if(!current||event.fillTime>current.fillTime)latest.set(event.contract,event);}
  const sameSource=prior?.provider==='moomoo_webapi'&&prior?.connectionMode==='webapi'&&prior?.observedDate===monitorToday(now);
  const previous=new Map(sameSource&&array(prior.contracts)?prior.contracts.map(contract=>[contract.contract,contract]):[]);
  return [...latest.values()].map(event=>{
    const old=previous.get(event.contract),oldVolume=numeric(old?.volume),increase=event.volume!==null&&oldVolume!==null&&event.volume>=oldVolume?event.volume-oldVolume:null;
    return {contract:event.contract,root:event.root,optionType:event.optionType,strike:event.strike,expiration:event.expiration,volume:event.volume,openInterest:event.openInterest,iv:event.iv,price:event.price,observationTime:null,providerTimeRaw:null,statisticsObservedAt:new Date(now).toISOString(),volumeOiRatio:event.volumeOiRatio,volumeIncreaseSincePreviousCheck:increase,previousCheckTime:increase!==null?prior.checkedAt||null:null,oiAsOf:null,oiBasis:'previous_session',available:true,coverageBasis:'returned_provider_activity_records'};
  }).sort((a,b)=>a.expiration.localeCompare(b.expiration)||a.strike-b.strike||a.optionType.localeCompare(b.optionType));
}

export function normalizeWebApiMonitor(symbol,overviewResponse,eventResponse,{now=Date.now(),expiration=null,prior=null}={}){
  symbol=monitorSymbol(symbol);if(!Number.isFinite(now)||!Number.isFinite(new Date(now).valueOf()))throw Error('INVALID_TIME');
  if(expiration!==null&&expiration!=='')expiration=monitorDate(expiration);else expiration=null;
  const checkedAt=new Date(now).toISOString(),today=monitorToday(now),overviewData=data(overviewResponse),eventData=data(eventResponse);
  const overviewItems=array(overviewData?.items),eventItems=array(eventData?.events),errors=[];
  const matched=(overviewItems||[]).filter(item=>object(item)&&code(item.code)==='US.'+symbol);
  const summaryItem=matched.length===1?matched[0]:null,overview=overviewFor(summaryItem);
  if(!summaryItem)errors.push({source:'overview',code:matched.length>1?'AMBIGUOUS_OVERVIEW':'OVERVIEW_UNAVAILABLE',message:'No unique provider overview for the requested symbol was returned.'});
  else if(['callVolume','putVolume','callOi','putOi'].some(key=>overview[key]===null))errors.push({source:'overview',code:'PARTIAL_OVERVIEW',message:'Some provider summary values are unavailable.'});
  if(eventItems===null)errors.push({source:'activity',code:'ACTIVITY_UNAVAILABLE',message:'Provider activity records are unavailable.'});
  const raw=eventItems||[],unique=new Map();let rejected=0;
  for(const item of raw.slice(0,ACTIVITY_LIMIT)){
    const normalized=activityRecord(item,symbol,today,now);
    if(normalized)unique.set(normalized.id,normalized);else rejected++;
  }
  const allEvents=[...unique.values()].sort((a,b)=>b.fillTime.localeCompare(a.fillTime)||a.id.localeCompare(b.id));
  const availableExpirations=[...new Set(allEvents.map(event=>event.expiration))].sort();
  const events=expiration?allEvents.filter(event=>event.expiration===expiration):allEvents;
  const contracts=contractsFor(events,prior,now),pagination=object(eventResponse?.pagination)||object(eventData?.pagination);
  const paginationCompleted=typeof pagination?.completed==='boolean'?pagination.completed:null;
  const paginationTotal=numeric(pagination?.total),truncated=raw.length>ACTIVITY_LIMIT||paginationCompleted===false||paginationTotal!==null&&paginationTotal>raw.length;
  if(truncated)errors.push({source:'activity',code:'PARTIAL_ACTIVITY_LIST',message:'The returned provider activity list is truncated or has additional pages.'});
  const goodOverview=summaryItem&&['callVolume','putVolume','callOi','putOi'].some(key=>overview[key]!==null),goodActivity=eventItems!==null;
  const status=!goodOverview&&!goodActivity?'unavailable':errors.length?'partial':'current';
  const strikes=contracts.map(contract=>contract.strike),observationTime=events[0]?.fillTime||null;
  return {schemaVersion:1,symbol,provider:'moomoo_webapi',connectionMode:'webapi',status,checkedAt,observationTime,observedDate:today,stale:false,
    coverage:{mode:'provider_symbol_overview',isComplete:false,expiration,availableExpirations,selectedContracts:contracts.length,totalAvailableContracts:null,tradeContractsChecked:contracts.length,strikeMin:strikes.length?Math.min(...strikes):null,strikeMax:strikes.length?Math.max(...strikes):null,
      summarySourceTime:null,summaryTradingDate:null,summaryExpirationFilterApplied:false,activityExpirationFilterApplied:Boolean(expiration),activityRecordKind:'provider_filtered_activity',providerRowsReturned:raw.length,providerRowsProcessed:Math.min(raw.length,ACTIVITY_LIMIT),rejectedRows:rejected,deduplicatedRows:Math.min(raw.length,ACTIVITY_LIMIT)-rejected-unique.size,activityRecordsAvailable:allEvents.length,activityRecordsShown:events.length,activityRecordLimit:ACTIVITY_LIMIT,activityListTruncated:truncated,activityPaginationCompleted:paginationCompleted,activityPaginationTotal:paginationTotal,activityListUpdateTime:microseconds(eventData?.update_timestamp),exchangeCoverage:'not_disclosed',allExpirationCoverage:'not_disclosed'},
    overview,contracts,events,alerts:[],oiChanges:[],errors,
    notice:'Provider symbol summaries have undisclosed exchange/expiration coverage and source time. Expiration filters only provider-filtered activity records, not summary PCR. Activity records may be filtered or aggregated and are not certified individual raw trades. OI uses the prior-session basis; exact settlement dates and opening/closing direction remain unknown.'};
}
