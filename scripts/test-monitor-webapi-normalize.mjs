import assert from 'node:assert/strict';
import {normalizeWebApiMonitor} from '../worker/option-monitor-webapi.js';

const now=Date.parse('2026-11-25T15:00:00Z');
const stamp=time=>String(Date.parse(time)*1000);
const overview={ret_code:0,data:{items:[{code:'US.AMD',call_volume:'1000',put_volume:2000,call_open_interest:'400',put_open_interest:800}]}};
const event=(overrides={})=>({owner:'US.AMD',option:'US.AMD261127C500000',fill_timestamp:stamp('2026-11-25T14:55:00Z'),ticker_type:'BUY',price:'3.25',volume:'600',turnover:'195000',strike_price:'500',option_type:'CALL',total_volume:'1400',total_open_interest:'400',...overrides});
const response=(events=[],extra={})=>({ret_code:0,data:{events,update_timestamp:stamp('2026-11-25T14:59:00Z'),pagination:{completed:true,total:events.length},...extra}});
const normalize=(events=[event()],options={},summary=overview)=>normalizeWebApiMonitor('AMD',summary,response(events),{now,...options});
let tests=0;
function check(name,fn){fn();tests++;console.log('PASS '+name);}

check('Symbol summaries are distinct from the returned activity subset',()=>{
  const actual=normalize();assert.equal(actual.schemaVersion,1);assert.equal(actual.provider,'moomoo_webapi');assert.equal(actual.connectionMode,'webapi');assert.equal(actual.status,'current');
  assert.equal(actual.overview.volumePcr,2);assert.equal(actual.overview.oiPcr,2);assert.equal(actual.coverage.isComplete,false);assert.equal(actual.coverage.mode,'provider_symbol_overview');assert.equal(actual.coverage.exchangeCoverage,'not_disclosed');assert.equal(actual.contracts.length,1);
});
check('Exact source timestamps and OI settlement dates remain unknown',()=>{
  const actual=normalize();assert.equal(actual.overview.volumeAsOf,null);assert.equal(actual.coverage.summaryTradingDate,null);assert.equal(actual.coverage.summarySourceTime,null);assert.equal(actual.overview.oiAsOf,null);assert.equal(actual.overview.oiBasis,'previous_session');assert.equal(actual.coverage.activityListUpdateTime,'2026-11-25T14:59:00.000Z');assert.equal(actual.contracts[0].observationTime,null);assert.equal(actual.events[0].openClose,'unknown');assert.equal(actual.events[0].amountBasis,'provider_turnover');assert.equal(actual.events[0].recordKind,'provider_activity');
});
check('Expiration filters activity only and preserves available expirations',()=>{
  const later=event({option:'US.AMD261218P490000',option_type:'PUT',strike_price:490});
  const actual=normalize([event(),later],{expiration:'2026-12-18'});assert.equal(actual.overview.volumePcr,2);assert.equal(actual.events.length,1);assert.equal(actual.contracts.length,1);assert.equal(actual.events[0].expiration,'2026-12-18');assert.deepEqual(actual.coverage.availableExpirations,['2026-11-27','2026-12-18']);assert.equal(actual.coverage.summaryExpirationFilterApplied,false);assert.equal(actual.coverage.activityExpirationFilterApplied,true);
});
check('Numeric validation preserves zero and missing or invalid values stay null',()=>{
  const summary={data:{items:[{code:'US.AMD',call_volume:'0',put_volume:0,call_open_interest:true,put_open_interest:-2}]}};
  const actual=normalize([event({turnover:false,total_volume:'',total_open_interest:'Infinity'})],{},summary);assert.equal(actual.status,'partial');assert.equal(actual.overview.callVolume,0);assert.equal(actual.overview.putVolume,0);assert.equal(actual.overview.volumePcr,null);assert.equal(actual.overview.callOi,null);assert.equal(actual.overview.putOi,null);assert.equal(actual.events[0].amount,null);assert.equal(actual.events[0].volume,null);assert.equal(actual.events[0].openInterest,null);assert.equal(actual.events[0].volumeOiRatio,null);
  const overflow=normalize([event({total_volume:1e308,total_open_interest:1e-308})],{},{data:{items:[{...overview.data.items[0],put_volume:1e308,call_volume:1e-308}]}});assert.equal(overflow.overview.volumePcr,null);assert.equal(overflow.events[0].volumeOiRatio,null);
});
check('Owners, standard roots and contract metadata must agree',()=>{
  const actual=normalize([event({owner:'US.NVDA'}),event({option:'US.NVDA261127C500000'}),event({option:'US.AMDbad'}),event({option_type:'PUT'}),event({strike_price:501}),event({price:true}),event({volume:-1}),event()]);assert.equal(actual.events.length,1);assert.equal(actual.coverage.rejectedRows,7);
});
check('Only current New York session records with microsecond timestamps are used',()=>{
  const actual=normalize([event({fill_timestamp:stamp('2026-11-25T01:00:00Z')}),event({fill_timestamp:stamp('2026-11-25T15:02:00Z')}),event({fill_timestamp:Date.parse('2026-11-25T14:55:00Z')/1000}),event()]);assert.equal(actual.events.length,1);assert.equal(actual.coverage.rejectedRows,3);
  const nearMidnight=normalizeWebApiMonitor('AMD',overview,response([event({fill_timestamp:stamp('2026-11-25T01:00:00Z')})]),{now:Date.parse('2026-11-25T02:00:00Z')});assert.equal(nearMidnight.observedDate,'2026-11-24');assert.equal(nearMidnight.events.length,1);
});
check('Stable identities deduplicate records without inventing opening direction',()=>{
  const later=event({fill_timestamp:stamp('2026-11-25T14:56:00Z'),ticker_type:'UNKNOWN'});
  const actual=normalize([event(),event(),later]);assert.equal(actual.events.length,2);assert.equal(actual.coverage.deduplicatedRows,1);assert.equal(actual.events[0].side,'unknown');assert.equal(actual.events[0].openClose,'unknown');assert.deepEqual(actual.events.map(x=>x.id),normalize([later,event()]).events.map(x=>x.id));
});
check('Activity rows are capped and extra pages are reported as partial',()=>{
  const events=Array.from({length:301},(_,i)=>event({volume:i+1}));const actual=normalize(events);assert.equal(actual.events.length,300);assert.equal(actual.coverage.providerRowsReturned,301);assert.equal(actual.coverage.providerRowsProcessed,300);assert.equal(actual.coverage.activityListTruncated,true);assert.equal(actual.status,'partial');
  const more=normalizeWebApiMonitor('AMD',overview,response([event()],{pagination:{completed:false,total:7}}),{now});assert.equal(more.coverage.activityListTruncated,true);assert.equal(more.coverage.activityPaginationCompleted,false);
});
check('Source errors and foreign or ambiguous summaries cannot masquerade as data',()=>{
  const failed=normalizeWebApiMonitor('AMD',{ret_code:1002,data:overview.data},{ret_code:1002,data:response().data},{now});assert.equal(failed.status,'unavailable');assert.equal(failed.overview.volumePcr,null);assert.deepEqual(failed.events,[]);
  assert.equal(normalize([],{}, {data:{items:[{...overview.data.items[0],code:'US.NVDA'}]}}).overview.volumePcr,null);
  assert.equal(normalize([],{}, {data:{items:[overview.data.items[0],overview.data.items[0]]}}).errors[0].code,'AMBIGUOUS_OVERVIEW');
});
check('Cumulative-volume deltas require same source, mode and observation day',()=>{
  const prior=normalize([event({total_volume:1000})]);const current=normalize([event({total_volume:1400})],{prior});assert.equal(current.contracts[0].volumeIncreaseSincePreviousCheck,400);
  for(const invalid of [{...prior,provider:'moomoo'},{...prior,connectionMode:'desktop'},{...prior,observedDate:'2026-11-24'}])assert.equal(normalize([event()],{prior:invalid}).contracts[0].volumeIncreaseSincePreviousCheck,null);
  assert.equal(normalize([event({total_volume:500})],{prior}).contracts[0].volumeIncreaseSincePreviousCheck,null);
});
check('Requested symbols and dates are validated before normalization',()=>{
  assert.throws(()=>normalizeWebApiMonitor('../AMD',overview,response(),{now}));assert.throws(()=>normalize([], {expiration:'2026-02-30'}));assert.throws(()=>normalize([], {now:NaN}));
});
console.log(`${tests} cloud monitor normalization checks passed.`);
