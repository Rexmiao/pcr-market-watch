import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalD1} from './local-db.mjs';
import {handleMarketSettingsApi} from '../worker/market-settings.js';
import {handleWatchlistsApi} from '../worker/watchlists.js';

const directory=await mkdtemp(join(tmpdir(),'pcr-market-settings-test-'));
const sourceMigrations=fileURLToPath(new URL('../drizzle',import.meta.url));
const fullMigrations=join(directory,'drizzle'),oldMigrations=join(directory,'old-drizzle');
const databasePath=join(directory,'数据库','settings.sqlite3');
const journal=JSON.parse(await readFile(join(sourceMigrations,'meta','_journal.json'),'utf8'));
const originalPath=join(sourceMigrations,journal.entries[0].tag+'.sql');
const originalHash=createHash('sha256').update(await readFile(originalPath)).digest('hex');
const a='fixture-market-user-a',b='fixture-market-user-b';
const endpoint='https://market-settings-test.example/api/market-pcr-settings';
const symbol=value=>({type:'symbol',symbol:value}),macro=key=>({type:'cboe',key});
const recommended=[macro('index'),macro('total'),macro('etp'),macro('equity'),symbol('SPY'),symbol('QQQ'),symbol('DIA')];
const req=({method='GET',body,raw,owner=a,headers={},query=''}={})=>new Request(endpoint+query,{method,
  headers:{...(owner===null?{}:{'oai-authenticated-user-id':owner}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},
  ...(raw===undefined?body===undefined?{}:{body:JSON.stringify(body)}:{body:raw})});

try {
  assert.equal(journal.entries[0].tag,'0000_ambiguous_sprite');
  assert.equal(journal.entries[1].idx,1);
  for(const target of [fullMigrations,oldMigrations])await mkdir(join(target,'meta'),{recursive:true});
  await writeFile(join(oldMigrations,'meta','_journal.json'),JSON.stringify({...journal,entries:[journal.entries[0]]}));
  await writeFile(join(fullMigrations,'meta','_journal.json'),JSON.stringify(journal));
  for(const entry of journal.entries){
    const sql=(await readFile(join(sourceMigrations,entry.tag+'.sql'),'utf8')).replace(/\r\n/g,'\n');
    await writeFile(join(fullMigrations,entry.tag+'.sql'),sql);
    if(entry.idx===0)await writeFile(join(oldMigrations,entry.tag+'.sql'),sql);
  }
  const oldDb=await createLocalD1({databasePath,migrationsDirectory:oldMigrations});
  const personalRequest=new Request('https://market-settings-test.example/api/watchlist-settings',{method:'PUT',headers:{'content-type':'application/json','oai-authenticated-user-id':a},body:JSON.stringify({items:[{symbol:'SNDK',category:'semi'}],groups:[{id:'semi',name:'个人半导体'}],revision:0})});
  assert.equal((await handleWatchlistsApi(personalRequest,{DB:oldDb,WATCHLIST_STORAGE:'local'})).status,200);
  const personalBefore=(await oldDb.prepare('SELECT * FROM user_watchlists ORDER BY owner_id').all()).results;
  assert.equal((await handleMarketSettingsApi(req(),{DB:oldDb,WATCHLIST_STORAGE:'local'})).status,503,'A request cannot create its own missing table');
  assert.equal(await oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_market_pcr'").first(),null);
  const db=await createLocalD1({databasePath,migrationsDirectory:fullMigrations});
  assert.deepEqual(db.migrationResult.applied,journal.entries.slice(1).map(entry=>entry.tag),'Upgrade only applies new migrations');
  assert.deepEqual((await db.prepare('SELECT * FROM user_watchlists ORDER BY owner_id').all()).results,personalBefore);
  const checkedDb={prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i);assert.doesNotMatch(sql,/user_watchlists/i);return db.prepare(sql);}};
  const env={DB:checkedDb,WATCHLIST_STORAGE:'local'};
  const call=async options=>{const response=await handleMarketSettingsApi(req(options),env);return {status:response.status,body:await response.json(),headers:response.headers};};
  let result=await call();
  assert.deepEqual(result.body,{items:null,revision:0,updatedAt:null,storage:'local',initialized:false});
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM user_market_pcr').first('n'),0,'Recommended seven are not seeded on the backend');
  assert.equal((await call({owner:null})).status,401);
  assert.equal((await call({owner:null,headers:{'OAI-Sites-Authorization':'Bearer test-placeholder'}})).status,401);
  assert.equal((await call({headers:{origin:'https://other.example'}})).status,403);
  assert.equal((await call({query:'?user_id='+a})).status,400);
  assert.equal((await call({method:'POST'})).status,405);
  assert.equal(await handleMarketSettingsApi(new Request(endpoint+'/other'),env),null);

  result=await call({method:'PUT',body:{items:recommended,revision:0}});
  assert.equal(result.status,200);assert.deepEqual(result.body.items,recommended);assert.equal(result.body.revision,1);assert.equal(result.body.initialized,true);
  assert.match(result.headers.get('cache-control'),/no-store/);
  assert.equal((await call({owner:b})).body.items,null,'Each identity owns its market menu');
  result=await call({method:'PUT',body:{items:[],revision:0}});
  assert.equal(result.status,409);assert.equal(result.body.revision,1);assert.deepEqual(result.body.items,recommended);
  result=await call({method:'PUT',body:{items:[],revision:1}});
  assert.equal(result.status,200);assert.deepEqual(result.body.items,[]);assert.equal(result.body.revision,2);
  result=await call({method:'PUT',body:{items:recommended,revision:1}});
  assert.equal(result.status,409);assert.deepEqual(result.body.items,[]);assert.equal(result.body.revision,2);

  // A line-ending-only checkout change must not replay either schema migration.
  const migrationRowsBefore=(await db.prepare('SELECT * FROM __pcr_local_migrations ORDER BY position').all()).results;
  for(const entry of journal.entries){const path=join(fullMigrations,entry.tag+'.sql'),sql=(await readFile(path,'utf8')).replace(/\r\n/g,'\n');await writeFile(path,sql.replace(/\n/g,'\r\n'));}
  const crlfDb=await createLocalD1({databasePath,migrationsDirectory:fullMigrations});
  assert.deepEqual(crlfDb.migrationResult.applied,[]);
  const durable=await (await handleMarketSettingsApi(req(),{DB:crlfDb,WATCHLIST_STORAGE:'local'})).json();
  assert.deepEqual(durable.items,[]);assert.equal(durable.revision,2);assert.equal(durable.initialized,true);
  assert.deepEqual((await crlfDb.prepare('SELECT * FROM __pcr_local_migrations ORDER BY position').all()).results,migrationRowsBefore);
  for(const entry of journal.entries){const path=join(fullMigrations,entry.tag+'.sql');await writeFile(path,(await readFile(path,'utf8')).replace(/\r\n/g,'\n'));}
  const lfDb=await createLocalD1({databasePath,migrationsDirectory:fullMigrations});
  assert.deepEqual(lfDb.migrationResult.applied,[]);
  assert.deepEqual((await lfDb.prepare('SELECT * FROM user_watchlists ORDER BY owner_id').all()).results,personalBefore);

  const firstRace=await Promise.all([
    call({owner:b,method:'PUT',body:{items:[],revision:0}}),
    call({owner:b,method:'PUT',body:{items:[macro('equity')],revision:0}}),
  ]);
  assert.deepEqual(firstRace.map(value=>value.status).sort(),[200,409]);
  assert.deepEqual(firstRace.find(value=>value.status===409).body.items,firstRace.find(value=>value.status===200).body.items);
  const ordered=[symbol('INDEX'),macro('index'),symbol('SPY'),macro('etp')];
  result=await call({method:'PUT',body:{items:[symbol('INDEX'),macro('index'),symbol(' spy '),symbol('SPY'),macro('etp'),macro('etp')],revision:2}});
  assert.equal(result.status,200);assert.deepEqual(result.body.items,ordered);assert.equal(result.body.revision,3,'Ticker INDEX and Cboe index are independent namespaces');
  const race=await Promise.all([
    call({method:'PUT',body:{items:[symbol('AMD')],revision:3}}),
    call({method:'PUT',body:{items:[macro('equity'),symbol('MU')],revision:3}}),
  ]);
  assert.deepEqual(race.map(value=>value.status).sort(),[200,409]);
  const winner=race.find(value=>value.status===200).body,loser=race.find(value=>value.status===409).body;
  assert.equal(winner.revision,4);assert.equal(loser.revision,4);assert.deepEqual(loser.items,winner.items);
  const reordered=[macro('total'),symbol('NOOCCDEMO'),symbol('INDEX'),macro('index')];
  result=await call({method:'PUT',body:{items:reordered,revision:4}});
  assert.equal(result.status,200);assert.deepEqual(result.body.items,reordered,'Preference validation checks structure, not external OCC coverage');
  const forty=Array.from({length:40},(_,index)=>symbol('T'+index));
  result=await call({method:'PUT',body:{items:[...forty,symbol('t0')],revision:5}});
  assert.equal(result.status,200);assert.equal(result.body.items.length,40);assert.equal(result.body.revision,6);
  for(const items of [null,{},[null],[macro('SPX')],[macro('INDEX')],[{type:'occ',symbol:'SPY'}],[{type:'cboe',key:'index',symbol:'SPY'}],[{type:'symbol',symbol:'SPY',name:'alias'}],[{type:'symbol',key:'index'}],[symbol('TOOLONG12345')],[symbol('ß')],[symbol('AMD;DROP')],[...forty,symbol('T40')]]){
    assert.equal((await call({method:'PUT',body:{items,revision:6}})).status,400);
  }
  for(const field of ['owner_id','owner_key','user_id','groups','url'])assert.equal((await call({method:'PUT',body:{items:[],revision:6,[field]:b}})).status,400);
  for(const revision of [-1,1.5,'6',null,Number.MAX_SAFE_INTEGER])assert.equal((await call({method:'PUT',body:{items:[],revision}})).status,400);
  assert.equal((await call({method:'PUT',raw:'{}',headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await call({method:'PUT',raw:'broken',headers:{'content-type':'application/json'}})).status,400);
  assert.equal((await call({method:'PUT',raw:new Uint8Array([255]),headers:{'content-type':'application/json'}})).status,400);
  assert.equal((await call({method:'PUT',raw:'{"padding":"'+'汉'.repeat(3000)+'"}',headers:{'content-type':'application/json'}})).status,413);
  assert.equal((await call({method:'PUT',raw:'{}',headers:{'content-type':'application/json','content-length':'8193'}})).status,413);
  assert.equal((await call()).body.revision,6);
  assert.deepEqual((await call()).body.items,forty);
  assert.equal((await handleMarketSettingsApi(req(),{})).status,503);
  const broken={DB:{prepare(){throw Error('database unavailable');}}};
  assert.equal((await handleMarketSettingsApi(req(),broken)).status,503);
  assert.equal((await handleMarketSettingsApi(req({method:'PUT',body:{items:[],revision:6}}),broken)).status,503);
  assert.equal((await (await handleMarketSettingsApi(req(),{DB:db})).json()).storage,'cloud');
  assert.deepEqual((await db.prepare('SELECT * FROM user_watchlists ORDER BY owner_id').all()).results,personalBefore,'Market settings must not alter the existing personal watchlist table');
  assert.equal(createHash('sha256').update(await readFile(originalPath)).digest('hex'),originalHash,'Applied 0000 is immutable');
  console.log('PASS market-PCR settings with real SQLite: append-only migration, LF/CRLF restart, unchanged personal table, identity isolation, no backend defaults, durable empty menu, typed namespaces/order/dedup, 40-item limit, atomic CAS races, strict inputs and body limits');
}finally{
  assert.equal(resolve(directory).startsWith(resolve(tmpdir())+sep),true);assert.equal(basename(directory).startsWith('pcr-market-settings-test-'),true);
  await rm(directory,{recursive:true,force:true});
}
