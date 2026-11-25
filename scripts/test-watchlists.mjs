import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalD1} from './local-db.mjs';
import {handleWatchlistsApi} from '../worker/watchlists.js';

const directory=await mkdtemp(join(tmpdir(),'pcr-watchlists-test-'));
const databasePath=join(directory,'watchlists.sqlite3');
const migrationsDirectory=fileURLToPath(new URL('../drizzle',import.meta.url));
const endpoint='https://watchlist-test.example/api/watchlist-settings';
const a='fixture-user-a',b='fixture-user-b';
const defaults=[{id:'semi',name:'半导体'},{id:'etf',name:'ETF'},{id:'other',name:'其他'}];
const req=({method='GET',body,raw,owner=a,headers={},query=''}={})=>{
  const values={...(owner===null?{}:{'oai-authenticated-user-id':owner}),...(body===undefined?{}:{'content-type':'application/json'}),...headers};
  return new Request(endpoint+query,{method,headers:values,...(raw===undefined?body===undefined?{}:{body:JSON.stringify(body)}:{body:raw})});
};
const item=(symbol,category='semi')=>({symbol,category});
const profile=(items,revision,groups=defaults)=>({items,groups,revision});
try {
  const db=await createLocalD1({databasePath,migrationsDirectory});
  // Real SQLite executes the actual CAS statements, including concurrent writes.
  const checkedDb={prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i,'No schema changes in request handling');return db.prepare(sql);}};
  const env={DB:checkedDb,WATCHLIST_STORAGE:'local'};
  const call=async options=>{const response=await handleWatchlistsApi(req(options),env);return {status:response.status,body:await response.json(),headers:response.headers};};
  let result=await call();
  assert.deepEqual(result.body,{items:null,groups:null,revision:0,updatedAt:null,storage:'local',initialized:false});
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM user_watchlists').first()).n,0,'GET must not seed defaults');
  assert.equal((await call({owner:null})).status,401);
  assert.equal((await call({owner:null,headers:{'OAI-Sites-Authorization':'Bearer test-placeholder'}})).status,401,'Service access does not supply personal identity');
  assert.equal((await call({owner:'  '})).status,401);
  assert.equal((await call({query:'?user_id='+a})).status,400);
  assert.equal((await call({headers:{origin:'https://other.example'}})).status,403);
  assert.equal((await call({method:'POST'})).status,405);
  assert.equal(await handleWatchlistsApi(new Request('https://watchlist-test.example/api/not-watchlists'),env),null);

  const original=[item('SPY','etf'),item('SNDK')];
  result=await call({method:'PUT',body:profile(original,0)});
  assert.equal(result.status,200);assert.equal(result.body.revision,1);assert.deepEqual(result.body.items,original);
  assert.equal(result.body.initialized,true);assert.equal(Number.isFinite(Date.parse(result.body.updatedAt)),true);
  assert.match(result.headers.get('cache-control'),/no-store/);
  assert.equal((await call({owner:b})).body.items,null,'A second identity must not read the first user list');
  assert.deepEqual(result.body.groups,defaults);
  result=await call({method:'PUT',body:profile([item('AMD')],0)});
  assert.equal(result.status,409);assert.deepEqual(result.body.items,original);assert.equal(result.body.revision,1);

  // Deleting every former default is durable and does not resurrect any core symbol.
  result=await call({method:'PUT',body:profile([],1)});
  assert.equal(result.status,200);assert.deepEqual(result.body.items,[]);assert.equal(result.body.revision,2);
  result=await call({method:'PUT',body:profile([item('AMD')],1)});
  assert.equal(result.status,409);assert.deepEqual(result.body.items,[]);assert.equal(result.body.revision,2);
  const reopened=await createLocalD1({databasePath,migrationsDirectory});
  const durable=await (await handleWatchlistsApi(req(),{DB:reopened,WATCHLIST_STORAGE:'local'})).json();
  assert.deepEqual(durable.items,[]);assert.equal(durable.initialized,true);assert.equal(durable.revision,2);
  result=await call({method:'PUT',body:profile([item('SPY','other')],2)});
  assert.deepEqual(result.body.items,[item('SPY','other')],'A removed former core symbol can be restored with any allowed category');
  result=await call({method:'PUT',body:profile([item('SPY','etf')],3)});
  assert.equal(result.body.revision,4);assert.deepEqual(result.body.items,[item('SPY','etf')]);

  const concurrent=await Promise.all([
    call({method:'PUT',body:profile([item('AMD')],4)}),
    call({method:'PUT',body:profile([item('MU')],4)}),
  ]);
  assert.deepEqual(concurrent.map(value=>value.status).sort(),[200,409]);
  const winner=concurrent.find(value=>value.status===200),loser=concurrent.find(value=>value.status===409);
  assert.equal(winner.body.revision,5);assert.equal(loser.body.revision,5);assert.deepEqual(loser.body.items,winner.body.items);
  result=await call({owner:b,method:'PUT',body:profile([item('DIA','etf')],0)});
  assert.equal(result.body.revision,1);assert.deepEqual((await call()).body.items,winner.body.items);
  assert.deepEqual((await call({owner:b})).body.items,[item('DIA','etf')]);
  result=await call({method:'PUT',body:profile([item(' amd '),item('AMD','other'),item('BRK.B','other')],5)});
  assert.deepEqual(result.body.items,[item('AMD'),item('BRK.B','other')]);assert.equal(result.body.revision,6);

  for(const field of ['owner_id','ownerId','owner_key','user_id']) {
    assert.equal((await call({method:'PUT',body:{...profile([],6),[field]:b}})).status,400,'Request fields cannot choose another owner');
  }
  for(const items of [[item('AMD;DROP')],[item('TOOLONG12345')],[item('ß')],[item('AMD','invalid')],[{...item('AMD'),owner_id:b}],Array.from({length:31},(_,i)=>item('T'+i))]) {
    assert.equal((await call({method:'PUT',body:profile(items,6)})).status,400);
  }
  for(const revision of [-1,0.5,'6',null,Number.MAX_SAFE_INTEGER])assert.equal((await call({method:'PUT',body:profile([],revision)})).status,400);
  assert.equal((await call({method:'PUT',raw:'{}',headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await call({method:'PUT',raw:'not json',headers:{'content-type':'application/json'}})).status,400);
  assert.equal((await call({method:'PUT',raw:'{"items":[],"revision":6,"padding":"'+'汉'.repeat(3000)+'"}',headers:{'content-type':'application/json'}})).status,413,'Limit UTF-8 bytes rather than characters');
  assert.equal((await call({method:'PUT',raw:'{}',headers:{'content-type':'application/json','content-length':'8193'}})).status,413);
  assert.equal((await call({method:'PUT',raw:new Uint8Array([255]),headers:{'content-type':'application/json'}})).status,400);
  assert.equal((await call()).body.revision,6,'Invalid requests leave the saved list intact');
  assert.deepEqual((await call({owner:b})).body.items,[item('DIA','etf')]);
  assert.equal((await handleWatchlistsApi(req(),{})).status,503);
  const broken={DB:{prepare(){throw Error('database unavailable');}}};
  assert.equal((await handleWatchlistsApi(req(),broken)).status,503);
  assert.equal((await handleWatchlistsApi(req({method:'PUT',body:profile([],6)}),broken)).status,503);
  assert.equal((await call()).body.revision,6);
  // Custom/default groups share identical CRUD semantics, and category changes are atomic.
  const custom=[...defaults,{id:'custom_ai-123',name:'AI观察'}];
  result=await call({method:'PUT',body:profile([item('AMD','custom_ai-123'),item('MU',null)],6,custom)});
  assert.equal(result.status,200);assert.equal(result.body.revision,7);assert.deepEqual(result.body.groups,custom);
  assert.deepEqual((await call({owner:b})).body.groups,defaults,'Personal groups are isolated too');
  const renamed=custom.map(group=>group.id==='custom_ai-123'?{...group,name:'人工智能'}:group);
  result=await call({method:'PUT',body:profile(result.body.items,7,renamed)});
  assert.equal(result.body.groups.at(-1).name,'人工智能');
  assert.equal((await call({method:'PUT',body:profile(result.body.items,8,[])})).status,400,'Removing groups while leaving orphan categories is rejected');
  result=await call({method:'PUT',body:profile([item('AMD',null),item('MU',null)],8,[])});
  assert.equal(result.status,200);assert.equal(result.body.revision,9);assert.deepEqual(result.body.groups,[]);
  assert.deepEqual(result.body.items,[item('AMD',null),item('MU',null)],'Deleting all groups preserves unassigned tickers');
  const groupReadback=await (await handleWatchlistsApi(req(),{DB:reopened,WATCHLIST_STORAGE:'local'})).json();
  assert.deepEqual(groupReadback.groups,[]);assert.deepEqual(groupReadback.items,result.body.items);
  const restored=[{id:'semi',name:'重新分类'}];
  result=await call({method:'PUT',body:profile([item('AMD')],9,restored)});
  assert.equal(result.status,200);assert.deepEqual(result.body.groups,restored);assert.equal(result.body.revision,10);
  const groupRace=await Promise.all([
    call({method:'PUT',body:profile([item('AMD')],10,[{id:'semi',name:'第一组'}])}),
    call({method:'PUT',body:profile([item('AMD')],10,[{id:'semi',name:'第二组'}])}),
  ]);
  assert.deepEqual(groupRace.map(value=>value.status).sort(),[200,409]);
  assert.deepEqual(groupRace.find(value=>value.status===409).body.groups,groupRace.find(value=>value.status===200).body.groups);
  for(const groups of [undefined,[{id:'all',name:'全部'}],[{id:'unassigned',name:'未分类'}],[{id:'custom_bad/',name:'组'}],[{id:'semi',name:''}],[{id:'semi',name:'汉'.repeat(41)}],[{id:'semi',name:'A'},{id:'semi',name:'B'}],[{id:'semi',name:'A'},{id:'etf',name:' a '}],Array.from({length:31},(_,i)=>({id:'custom_'+i,name:'组'+i}))]) {
    assert.equal((await call({method:'PUT',body:groups===undefined?{items:[],revision:11}:profile([],11,groups)})).status,400);
  }
  const cloud=await (await handleWatchlistsApi(req(),{DB:db})).json();
  assert.equal(cloud.storage,'cloud');
  console.log('PASS watchlists with real SQLite: identity isolation, no GET seeding, durable empty list/groups, ticker and group CRUD/restore, no orphan categories, atomic CAS races, strict input/body limits, and database failure retention');
} finally {
  // Remove only this test's newly created directory inside the system temp root.
  assert.equal(resolve(directory).startsWith(resolve(tmpdir())+sep),true);
  assert.equal(basename(directory).startsWith('pcr-watchlists-test-'),true);
  await rm(directory,{recursive:true,force:true});
}
