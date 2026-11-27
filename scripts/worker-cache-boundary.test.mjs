import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createLocalD1} from './local-db.mjs';
import {createSqliteWorkerCache,installCloudWorkerCache,WORKER_CACHE_LIMITS} from './worker-cache.mjs';

const PREFIX='/__pcr_internal_cache__/';
const record=date=>({schemaVersion:1,snapshot:{date,metrics:{total:{name:'TOTAL PUT/CALL RATIO',ratio:2,put:200,call:100},index:{name:'INDEX PUT/CALL RATIO',ratio:1.5,put:60,call:40},etp:{name:'EXCHANGE TRADED PRODUCTS PUT/CALL RATIO',ratio:1,put:20,call:20}}},checkedAt:'2026-11-26T08:00:00.000Z'});
const key=(path,options)=>new Request('http://127.0.0.1:8765'+PREFIX+path,options);
const response=(body,headers={})=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json','cache-control':'public, max-age=60',...headers}});
async function fixture(t,onChange){const directory=await mkdtemp(join(tmpdir(),'pcr-worker-cache-boundary-'));assert.equal(dirname(resolve(directory)),resolve(tmpdir()));t.after(()=>rm(directory,{recursive:true,force:true}));const database=await createLocalD1({databasePath:join(directory,'cache.sqlite3'),onChange});return {database,cache:createSqliteWorkerCache({database,now:()=>Date.parse('2026-11-26T08:00:00Z')})};}

test('public cache responses are independent copies and trigger durable-write notifications, not read notifications',async t=>{
  let changes=0;const {database,cache}=await fixture(t,()=>{changes++;});const original=response(record('2026-11-25'),{'x-private-header':'not-saved','authorization':'unit-private-token'});
  await cache.put(key('cboe-v1/2026-11-25'),original);assert.equal(changes,1);assert.deepEqual(await original.json(),record('2026-11-25'));
  const first=await cache.match(key('cboe-v1/2026-11-25')),second=await cache.match(key('cboe-v1/2026-11-25'));
  assert.notEqual(first,second);assert.deepEqual(await first.json(),record('2026-11-25'));assert.deepEqual(await second.json(),record('2026-11-25'));assert.equal(changes,1);
  const row=await database.prepare('SELECT headers_json,body_gzip_base64,body_bytes,compressed_bytes FROM worker_cache').first();assert(!row.headers_json.includes('private'));assert(!row.headers_json.includes('authorization'));assert(row.compressed_bytes<row.body_bytes);assert.deepEqual(Object.keys(JSON.parse(row.headers_json)).sort(),['cache-control','content-type']);
});
test('unknown routes, query variations, credentials, encoded keys and non-GET cache keys cannot persist private data',async t=>{
  const {database,cache}=await fixture(t);
  const disallowed=[new Request('http://127.0.0.1/api/watchlist-settings'),new Request('http://127.0.0.1'+PREFIX+'cboe-v1/latest?bypass=1'),key('cboe-v1/latest',{method:'POST',body:'{}'}),key('cboe-v1/latest',{headers:{authorization:'Bearer unit'}}),key('cboe-v1/latest',{headers:{cookie:'private=unit'}}),key('symbol-v1/%41MD'),key('cboe-v1/2026-02-30'),key('not-a-public-cache')];
  for(const request of disallowed){assert.equal(await cache.match(request),undefined);await assert.rejects(cache.put(request,response(record('2026-11-25'))));}
  await assert.rejects(cache.put(key('cboe-v1/latest'),response({...record('2026-11-25'),nested:{access_token:'unit-token'}})));
  await assert.rejects(cache.put(key('cboe-v1/latest'),response(record('2026-11-25'),{'set-cookie':'unit-private=token'})));
  await assert.rejects(cache.put(key('cboe-v1/latest'),response(record('2026-11-25'),{'cache-control':'private, max-age=60'})));
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM worker_cache').first()).n,0);
});
test('expiry uses write time without restamping source dates, and corrupt compressed records fail closed',async t=>{
  const {database}=await fixture(t);let clock=Date.parse('2026-11-26T08:00:00Z');const cache=createSqliteWorkerCache({database,now:()=>clock});
  await cache.put(key('cboe-v1/latest'),response(record('2026-11-25')));clock+=59000;assert.equal((await(await cache.match(key('cboe-v1/latest'))).json()).checkedAt,'2026-11-26T08:00:00.000Z');clock+=1000;assert.equal(await cache.match(key('cboe-v1/latest')),undefined);assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM worker_cache').first()).n,0);
  await cache.put(key('cboe-v1/latest'),response(record('2026-11-25')));await database.prepare('UPDATE worker_cache SET body_gzip_base64=?').bind('not-valid-compressed-data').run();assert.equal(await cache.match(key('cboe-v1/latest')),undefined);assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM worker_cache').first()).n,0);
});
test('body and compression limits are enforced before SQLite accepts a cache row',async t=>{
  const {database,cache}=await fixture(t);
  await assert.rejects(cache.put(key('cboe-v1/latest'),response({...record('2026-11-25'),padding:'x'.repeat(WORKER_CACHE_LIMITS.maxBodyBytes)})));
  await assert.rejects(cache.put(key('cboe-v1/latest'),response({...record('2026-11-25'),padding:randomBytes(800000).toString('base64')})));
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM worker_cache').first()).n,0);
});
test('row pruning is bounded and preserves the critical latest Cboe entry',async t=>{
  const {database,cache}=await fixture(t);await cache.put(key('cboe-v1/latest'),response(record('2026-11-25')));
  const statements=[];for(let i=0;i<130;i++){
    const date=new Date(Date.parse('2024-01-01T12:00:00Z')+i*86400000).toISOString().slice(0,10),body=Buffer.from(JSON.stringify(record(date))),compressed=gzipSync(body);
    statements.push(database.prepare('INSERT INTO worker_cache(cache_key,body_gzip_base64,headers_json,body_bytes,compressed_bytes,stored_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(PREFIX+'cboe-v1/'+date,compressed.toString('base64'),JSON.stringify({'content-type':'application/json','cache-control':'public, max-age=60'}),body.length,compressed.length,'2026-11-26T08:00:00.000Z',Date.parse('2026-11-26T08:01:00Z')));
  }
  await database.batch(statements);await cache.put(key('cboe-v1/2026-11-24'),response(record('2026-11-24')));assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM worker_cache').first()).n,WORKER_CACHE_LIMITS.maxEntries);assert((await cache.match(key('cboe-v1/latest'))));
});
test('ordinary local previews do not install or alter the global cache',async t=>{
  const original=globalThis.caches;t.after(()=>{if(original===undefined)delete globalThis.caches;else globalThis.caches=original;});const sentinel={default:{sentinel:true}};globalThis.caches=sentinel;
  assert.equal(installCloudWorkerCache({env:{}}),false);assert.equal(globalThis.caches,sentinel);
  const {database}=await fixture(t);assert.equal(installCloudWorkerCache({database,env:{PCR_RUNTIME:'cloud'}}),true);assert.equal(typeof globalThis.caches.default.put,'function');assert.equal(typeof globalThis.caches.default.match,'function');
});
