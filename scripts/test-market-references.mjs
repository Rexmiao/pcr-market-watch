import assert from 'node:assert/strict';
import {CBOE_METRICS,REFERENCE_METRICS,MARKET_METRICS,isReferenceMetric,referenceHistoryPayload,cboeChartConfig,cboeHistoryView} from '../web/cboe-model.js';

assert.deepEqual(CBOE_METRICS,['index','total','etp','equity']);
assert.equal(MARKET_METRICS.length,7);
const row={date:'2026-11-24',p:125,c:100,p20:1900,c20:2000,r20:.95,p60:4800,c60:6000,r60:.8};
const core={asof:'2026-11-23',checkedAt:'2026-11-25T01:54:20Z',calendarDate:'2026-11-24',instruments:{SPY:{rows:[row]},QQQ:{rows:[{...row,p:150}]},DIA:{rows:[{...row,p:75}]}}};
const before=JSON.stringify(core);
for(const metric of REFERENCE_METRICS){
  const payload=referenceHistoryPayload(core,metric),config=cboeChartConfig(payload,{metric,range:'all',language:'en'});
  assert.equal(payload.asof,'2026-11-24','Reference activity date comes from that ETF, not Cboe or the core envelope');
  assert.equal(payload.sourceType,'occ');assert.ok(payload.sourceUrl.startsWith('https://www.theocc.com/'));
  assert.equal(payload.checkedAt,core.checkedAt);
  assert.equal(config.rows.length,3);assert.equal(config.rows[1][2],.95);assert.equal(config.rows[2][2],.8);
  assert.equal(config.rows[1][3],1900,'20-session volume metadata is passed through without averaging daily PCR');
  assert.ok(config.title.startsWith('OCC '));assert.ok(config.title.includes('ETF PCR'));
  assert.equal(cboeHistoryView(payload,{metric,date:'2026-11-23'}).actualEnd,null,'A Cboe date cannot create an earlier ETF observation');
  assert.equal(isReferenceMetric(metric),true);
}
assert.equal(referenceHistoryPayload(core,'spy').rows[0].spy.daily,1.25);
assert.equal(referenceHistoryPayload(core,'qqq').rows[0].qqq.daily,1.5);
assert.equal(referenceHistoryPayload(core,'dia').rows[0].dia.daily,.75);
const zero=structuredClone(core);zero.instruments.SPY.rows[0].c=0;assert.equal(referenceHistoryPayload(zero,'spy').rows[0].spy.daily,null);
assert.equal(referenceHistoryPayload({},'spy').rows.length,0,'Missing reference data remains empty');
assert.throws(()=>referenceHistoryPayload(core,'index'));
const equity={rows:[{date:'2026-11-24',equity:{daily:.7,p:700,c:1000,r20:.8,p20:16000,c20:20000,r60:.9,p60:54000,c60:60000,derived:true}}]};
assert.equal(cboeChartConfig(equity,{metric:'equity',range:'all'}).rows[0][2],.7);
assert.equal(cboeChartConfig(equity,{metric:'equity',range:'all'}).rows[1][2],.8);
assert.equal(JSON.stringify(core),before);
console.log('PASS four Cboe measures and three independent OCC ETF references, dates, source, quantities and missing values');
