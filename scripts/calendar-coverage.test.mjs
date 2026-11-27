import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarRecordCoverage,getView,buildConfigs} from '../web/model.js';

const row=(date,p=10,c=20)=>({date,p,c,r20:null,r60:null});
const data={asof:'2026-11-25',calendarDate:'2026-11-26',instruments:{AAA:{rows:[row('2026-11-24')],oi:{p:50,c:100,ratio:.5}},BBB:{rows:[row('2026-11-24'),row('2026-11-25'),row('2026-11-25')],oi:null}}};
test('coverage counts full watchlist, keeps unavailable symbols in denominator and deduplicates dates',()=>{
  const coverage=calendarRecordCoverage(data,['AAA','BBB','CCC','AAA']);assert.equal(coverage.total,3);assert.deepEqual(coverage.byDate['2026-11-24'],['AAA','BBB']);assert.deepEqual(coverage.byDate['2026-11-25'],['BBB']);assert.equal(coverage.byDate['2026-11-26'],undefined);
});
test('valid zero-volume records count as records, while invalid quantities do not',()=>{
  const coverage=calendarRecordCoverage({instruments:{AAA:{rows:[row('2026-11-24',0,0),row('2026-11-25',null,10),row('2026-11-26',-1,5)]}}});assert.deepEqual(coverage.byDate['2026-11-24'],['AAA']);assert.equal(coverage.byDate['2026-11-25'],undefined);assert.equal(coverage.byDate['2026-11-26'],undefined);
});
test('a blue-dot record does not invent OI or permit the latest snapshot on a historical date',()=>{
  const state={symbol:'AAA',date:'2026-11-24',range:'all',volumeWindow:'day',language:'zh',symbols:['AAA','BBB']};
  assert.equal(getView(data,state).isLatest,false);const overview=buildConfigs(data,state)[0];assert(overview.rows.filter(row=>row[1].includes('OI')).every(row=>row[2]===null));
  const latest=buildConfigs(data,{...state,date:'2026-11-25'})[0];assert.equal(latest.rows.find(row=>row[0]==='AAA'&&row[1].includes('OI'))[2],.5);assert.equal(latest.rows.find(row=>row[0]==='BBB'&&row[1].includes('OI'))[2],null);
});
