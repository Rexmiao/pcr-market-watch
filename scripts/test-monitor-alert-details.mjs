import assert from 'node:assert/strict';
import {monitorActivity,monitorAlertDetails,formatMonitorTime,monitorTradeSide} from '../web/option-monitor-model.js';
const contract='US.AMD261127P500000';
const contracts=[{contract,root:'AMD',optionType:'PUT',expiration:'2026-11-27',strike:500,volume:2000,openInterest:500,volumeIncreaseSincePreviousCheck:800,observationTime:'2026-11-25T15:11:12Z',previousCheckTime:'2026-11-25T15:00:00Z'}];
const events=[{id:'buy-1',contract,root:'AMD',optionType:'PUT',expiration:'2026-11-27',strike:500,contracts:700,fillTime:'2026-11-25T15:02:03Z',side:'buy',openClose:'OPEN'},{id:'sell-2',contract,root:'AMD',optionType:'PUT',expiration:'2026-11-27',strike:500,contracts:900,fillTime:'2026-11-25T15:04:05Z',side:'sell',openClose:'CLOSE'}];
const checkedAt='2026-11-25T15:15:16Z';
const alerts=monitorActivity(contracts,events,{minContracts:500,minVolumeOi:2});
let tests=0;const check=(name,fn)=>{fn();tests++;console.log('PASS '+name);};
check('Repeated contracts retain each event ID side and execution time',()=>{
  const activity=alerts.filter(alert=>alert.type==='large_trade');assert.equal(activity.length,2);
  const buy=monitorAlertDetails(activity[0],contracts,events,{checkedAt}),sell=monitorAlertDetails(activity[1],contracts,events,{checkedAt});
  assert.equal(buy.side,'buy');assert.equal(sell.side,'sell');assert.equal(buy.fillTime,events[0].fillTime);assert.equal(sell.fillTime,events[1].fillTime);assert.equal(buy.checkedAt,null);assert.equal(buy.observationTime,null);
});
check('An unmatched event ID never borrows another record from the same contract',()=>{
  const detail=monitorAlertDetails({...alerts[0],eventId:'missing'},contracts,events,{checkedAt});assert.equal(detail.fillTime,null);assert.equal(detail.side,'unknown');assert.equal(detail.contract,null);
});
check('Open-close remains unknown regardless of raw opening claims or malicious values',()=>{
  for(const event of [...events,{...events[0],id:'untrusted',openClose:'<script>OPEN</script>'}]){
    const detail=monitorAlertDetails({type:'large_trade',eventId:event.id},contracts,[event],{checkedAt});assert.equal(detail.openClose,'unknown');
  }
});
check('Unknown side or fill time does not inherit Put direction or the source check time',()=>{
  const source={...events[0],side:'short',fillTime:null,delta:-.9};const detail=monitorAlertDetails({type:'large_trade',eventId:source.id},contracts,[source],{checkedAt});assert.equal(detail.side,'unknown');assert.equal(detail.fillTime,null);assert.equal(detail.openClose,'unknown');assert.equal(monitorTradeSide(null),'unknown');assert.equal(monitorTradeSide('NEUTRAL'),'neutral');
});
check('Volume-OI uses snapshot and check clocks, never matching trade execution time',()=>{
  const detail=monitorAlertDetails(alerts.find(alert=>alert.type==='volume_oi'),contracts,events,{checkedAt});assert.equal(detail.kind,'snapshot');assert.equal(detail.observationTime,contracts[0].observationTime);assert.equal(detail.checkedAt,checkedAt);assert.equal(detail.fillTime,null);assert.equal(detail.side,'unknown');
});
check('Cumulative-volume alerts expose the check interval independently of snapshot time',()=>{
  const detail=monitorAlertDetails(alerts.find(alert=>alert.type==='interval_volume'),contracts,events,{checkedAt});assert.equal(detail.kind,'interval');assert.equal(detail.previousCheckTime,contracts[0].previousCheckTime);assert.equal(detail.checkedAt,checkedAt);assert.equal(detail.observationTime,contracts[0].observationTime);assert.equal(detail.fillTime,null);
});
check('Missing snapshot and check clocks stay unknown instead of falling back to trades',()=>{
  const detail=monitorAlertDetails(alerts.find(alert=>alert.type==='interval_volume'),[{...contracts[0],observationTime:null,previousCheckTime:null}],events);assert.equal(detail.observationTime,null);assert.equal(detail.previousCheckTime,null);assert.equal(detail.checkedAt,null);
});
check('New York formatting includes the execution date and second precision',()=>{
  assert.equal(formatMonitorTime('2026-11-25T15:02:03Z'),'2026-11-25 10:02:03 ET (EST)');assert.equal(formatMonitorTime('2026-11-25T01:02:03Z'),'2026-11-24 20:02:03 ET (EST)');assert.equal(formatMonitorTime('2026-11-25T09:02:03+08:00'),'2026-11-24 20:02:03 ET (EST)');
});
check('DST transitions use New York clock rules and disambiguate the repeated hour',()=>{
  assert.equal(formatMonitorTime('2026-03-08T06:59:59Z'),'2026-03-08 01:59:59 ET (EST)');assert.equal(formatMonitorTime('2026-03-08T07:00:00Z'),'2026-03-08 03:00:00 ET (EDT)');assert.equal(formatMonitorTime('2026-11-01T05:30:00Z'),'2026-11-01 01:30:00 ET (EDT)');assert.equal(formatMonitorTime('2026-11-01T06:30:00Z'),'2026-11-01 01:30:00 ET (EST)');
});
check('Ambiguous raw dates malformed timestamps and nonstring values remain unknown',()=>{
  for(const value of [null,0,true,'2026-11-25','2026-11-25 10:00:00','2026-02-30T10:00:00Z','not-a-date'])assert.equal(formatMonitorTime(value),null);
});
console.log(`${tests} alert identity, direction and time checks passed.`);
