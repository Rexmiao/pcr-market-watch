import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {handleApi,backendTesting} from '../worker/backend.js';

const seed=JSON.parse(await readFile(new URL('../data/seed.json',import.meta.url),'utf8'));
const origin='http://symbol-cache-read.example';
const request=(symbol,query='')=>new Request(origin+'/api/symbol?symbol='+symbol+query,{headers:{'x-pcr-cache-only':'1'}});
async function isolated(run){
  const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;let calls=0;
  backendTesting.clearMemory();globalThis.fetch=async()=>{calls++;throw Error('No source requests allowed.');};
  try{await run(()=>calls);}finally{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;backendTesting.clearMemory();}
}
test('a missing read-only symbol returns a genuine empty cache and does not consume refresh cooldown',async()=>{
  await isolated(async sourceCalls=>{
    globalThis.caches={default:{match:async()=>undefined}};
    for(let i=0;i<2;i++){
      const response=await handleApi(request('SNDK'),{},null,seed),body=await response.json();
      assert.equal(response.status,200);assert.equal(body.symbol,'SNDK');assert.equal(body.instrument,null);
      assert.equal(body.asof,null);assert.equal(body.checkedAt,null);assert.equal(body.refresh.status,'cache_miss');
    }
    assert.equal(sourceCalls(),0);
    const explicit=await handleApi(new Request(origin+'/api/symbol?symbol=SNDK&refresh=1'),{},null,seed);
    assert.equal(explicit.status,502,'A later explicit refresh still reaches its source rather than a read-created cooldown.');
    assert(sourceCalls()>0);
  });
});
test('expired symbol caches retain their actual quantities and source clocks without refetching',async()=>{
  await isolated(async sourceCalls=>{
    const saved={version:1,symbol:'SNDK',checkedAt:'2026-11-24T21:00:00.000Z',rows:[{date:'2026-11-23',put_sides:3,call_sides:10},{date:'2026-11-24',put_sides:4,call_sides:10}],coverage:{}};
    globalThis.caches={default:{match:async()=>new Response(JSON.stringify(saved))}};
    for(const suffix of ['', '&refresh=1']){
      const response=await handleApi(request('SNDK',suffix),{},null,seed),body=await response.json();
      assert.equal(response.status,200);assert.equal(body.asof,'2026-11-24');
      assert.equal(body.checkedAt,saved.checkedAt);assert.equal(body.refresh.checkedAt,saved.checkedAt);
      assert.equal(body.instrument.rows.at(-1).daily,.4);assert.equal(body.refresh.status,'cached');
    }
    assert.equal(sourceCalls(),0);
  });
});
test('core symbol cache reads keep the complete published seed path without requesting a source',async()=>{
  await isolated(async sourceCalls=>{
    globalThis.caches={default:{match:async()=>undefined}};
    const response=await handleApi(request('NVDA'),{},null,seed),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.symbol,'NVDA');assert(body.instrument.rows.length>0);
    assert.equal(body.asof,seed.instruments.NVDA.rows.at(-1).date);assert.equal(sourceCalls(),0);
  });
});
