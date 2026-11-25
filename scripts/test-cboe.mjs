import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleCboeApi, cboeTesting as t} from '../worker/cboe.js';

const seed = JSON.parse(await readFile(new URL('../data/cboe-seed.json', import.meta.url), 'utf8'));
const snapshot = seed.observations.find(row => row.date === '2026-11-23');
assert.equal(snapshot.metrics.index.ratio, 1.21);
assert.equal(snapshot.metrics.total.ratio, 0.94);
assert.equal(snapshot.metrics.etp.ratio, 1.13);
assert.equal(snapshot.metrics.equity.ratio,0.55);
assert.equal(snapshot.metrics.equity.derived,true);
const payload = {
  selectedDate:'2026-11-23',
  optionsData: {ratios:Object.values(snapshot.metrics).map(metric => ({name:metric.name,value:metric.ratio.toFixed(2)}))},
};
const htmlFor = data => '<script>self.__next_f.push(' + JSON.stringify([1,'25:'+JSON.stringify(['$','$L33',null,{data}])+'\n']) + ')</script>';
assert.equal(t.parseCboePage(htmlFor(payload),'2026-11-23').snapshot.metrics.index.ratio,1.21);
assert.throws(() => t.parseCboePage(htmlFor(payload),'2026-11-24'), /different activity date/);
assert.equal(t.parseCboePage(htmlFor({selectedDate:'2026-11-24',optionsData:null}),'2026-11-24').snapshot,null);
assert.equal(t.cboeValidDate('2026-02-30'),false);
// Direct EQUITY fields take priority; legacy three-category records retain their data.
const official=structuredClone(payload);
official.optionsData['EQUITY OPTIONS']=[{name:'VOLUME',put:1836973,call:3321053}];
const direct=t.parseCboePage(htmlFor(official),'2026-11-23').snapshot.metrics.equity;
assert.equal(direct.derived,false);assert.equal(direct.source,'cboe_published');assert.equal(direct.put,1836973);
const legacy=structuredClone(snapshot);delete legacy.metrics.equity;
const recovered=t.cboeVerifiedSnapshot(legacy);
assert.equal(recovered.metrics.equity.derived,true);assert.equal(recovered.metrics.equity.ratio,0.55);
assert.equal(recovered.metrics.equity.call,3321053);
const bad=structuredClone(legacy);bad.metrics.total.put=0;bad.metrics.total.ratio=0;
const badRecovered=t.cboeVerifiedSnapshot(bad);
assert.equal(badRecovered.metrics.index.ratio,1.21);assert.equal(badRecovered.metrics.equity.ratio,null);assert.equal(badRecovered.metrics.equity.put,null);
const missing=structuredClone(legacy);missing.metrics.etp.put=null;missing.metrics.etp.call=null;
assert.equal(t.cboeVerifiedSnapshot(missing).metrics.equity.ratio,null);
const zero=structuredClone(legacy);
for(const [key,n] of [['total',30],['index',10],['etp',20]])Object.assign(zero.metrics[key],{put:n,call:n,ratio:1});
const zeroEquity=t.cboeVerifiedSnapshot(zero).metrics.equity;
assert.equal(zeroEquity.put,0);assert.equal(zeroEquity.call,0);assert.equal(zeroEquity.ratio,null);

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const request = (path, method='GET') => new Request('https://cboe-test.example'+path, {method});
try {
  t.clearMemory();
  globalThis.fetch = async () => {throw Error('offline');};
  let response = await handleCboeApi(request('/api/cboe?date=2026-11-23'),{},null,seed);
  let result = await response.json();
  assert.equal(result.snapshot.date,'2026-11-23');
  assert.equal(result.snapshot.metrics.index.ratio,1.21);
  assert.equal((await handleCboeApi(request('/api/cboe?date=2026-02-30'),{},null,seed)).status,400);
  assert.equal((await handleCboeApi(new Request('https://cboe-test.example/api/cboe',{headers:{Origin:'https://attacker.example'}}),{},null,seed)).status,403);

  t.clearMemory();
  globalThis.fetch = async () => new Response(htmlFor({selectedDate:'2026-11-24',optionsData:null}));
  response = await handleCboeApi(request('/api/cboe?date=2026-11-24'),{},null,seed);
  result = await response.json();
  assert.equal(result.snapshot,null,'Never substitute the latest saved day for a missing requested day');
  assert.equal(result.requestedDate,'2026-11-24');
  assert.equal(result.status,'not_published');
  assert.equal(result.latestDate,'2026-11-23');

  t.clearMemory();
  globalThis.fetch = async () => new Response(htmlFor(payload));
  response = await handleCboeApi(request('/api/cboe/refresh?date=2026-11-23','POST'),{},null,seed);
  assert.equal((await response.json()).snapshot.date,'2026-11-23');
  t.clearMemory();
  globalThis.fetch = async () => {throw Error('offline');};
  response = await handleCboeApi(request('/api/cboe/refresh?date=2026-11-23','POST'),{},null,seed);
  result = await response.json();
  assert.equal(result.status,'saved');
  assert.equal(result.snapshot.date,'2026-11-23');
  assert.equal(result.refreshStatus,'failed');

  // A stale source page cannot roll the latest snapshot back behind the seed.
  t.clearMemory();
  globalThis.fetch = async () => new Response(htmlFor({...payload, selectedDate:'2026-11-20'}));
  response = await handleCboeApi(request('/api/cboe/refresh','POST'),{},null,seed);
  result = await response.json();
  assert.equal(result.snapshot.date,'2026-11-23');
  assert.equal(result.status,'saved');

  // A newer check timestamp is not allowed to outrank a newer activity date.
  t.clearMemory();
  const staleCache = {schemaVersion:1, snapshot:{...snapshot,date:'2026-11-20'},checkedAt:new Date().toISOString()};
  globalThis.caches = {default:{async match(){return new Response(JSON.stringify(staleCache));},async put(){throw Error('Must not save rollback');}}};
  response = await handleCboeApi(request('/api/cboe/refresh','POST'),{},null,seed);
  result = await response.json();
  assert.equal(result.snapshot.date,'2026-11-23');

  // An unrelated historical cache entry must never appear under the requested date.
  t.clearMemory();
  globalThis.caches = {default:{async match(){return new Response(JSON.stringify({schemaVersion:1,snapshot,checkedAt:new Date().toISOString()}));}}};
  globalThis.fetch = async () => new Response(htmlFor({selectedDate:'2026-11-24',optionsData:null}));
  response = await handleCboeApi(request('/api/cboe?date=2026-11-24'),{},null,seed);
  result = await response.json();
  assert.equal(result.snapshot,null);
  assert.equal(result.requestedDate,'2026-11-24');

  // Reject schema-less/malformed cached statistics instead of accepting arbitrary fields.
  t.clearMemory();
  globalThis.caches = {default:{async match(){return new Response(JSON.stringify({snapshot:{date:'2026-11-24'},checkedAt:new Date().toISOString()}));}}};
  globalThis.fetch = async () => {throw Error('offline');};
  response = await handleCboeApi(request('/api/cboe?date=2026-11-24'),{},null,seed);
  result = await response.json();
  assert.equal(result.snapshot,null);
  assert.equal(result.status,'source_unavailable');
  // Existing cloud records with three categories are upgraded on read, not rejected.
  t.clearMemory();
  globalThis.caches={default:{async match(){return new Response(JSON.stringify({schemaVersion:1,snapshot:legacy,checkedAt:new Date().toISOString()}));}}};
  response=await handleCboeApi(request('/api/cboe?date=2026-11-23'),{},null,{});result=await response.json();
  assert.equal(response.status,200);assert.equal(result.snapshot.metrics.equity.derived,true);
  assert.equal(result.snapshot.metrics.equity.ratio,0.55);assert.equal(result.snapshot.metrics.total.ratio,0.94);
  console.log('PASS Cboe official parser, distinct ratios, exact historical date, unpublished day, source rollback, verified cache schema, and failed-source retention');
} finally {globalThis.fetch = originalFetch; globalThis.caches = originalCaches; t.clearMemory();}
