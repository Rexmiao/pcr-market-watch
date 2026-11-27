import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {createLocalD1} from './local-db.mjs';
import {createCloudBackupQueue,isDatabaseChangedMessage} from './start-cloud.mjs';

async function temporary(t){
  const directory=await mkdtemp(join(tmpdir(),'pcr-db-change-'));
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return directory;
}
const insert=(db,owner)=>db.prepare('INSERT INTO user_watchlists(owner_id,items_json,groups_json,revision,updated_at) VALUES(?,?,?,?,?)').bind(owner,'[]','[]',1,'2026-11-26T12:00:00Z');

test('real SQLite notifies once per committed mutation or batch, never for reads, migrations, zero changes, or rollback',async t=>{
  const directory=await temporary(t),events=[];
  const db=await createLocalD1({databasePath:join(directory,'test.sqlite3'),onChange:(...args)=>{events.push(args);}});
  assert.equal(events.length,0,'Schema migration does not emit runtime change notifications.');
  await db.prepare('SELECT * FROM user_watchlists').all();assert.equal(events.length,0);
  const result=await insert(db,'first').run();assert.equal(result.meta.changes,1);assert.equal(events.length,1);assert.deepEqual(events[0],[],'No SQL, identity, or values may enter the notification.');
  await db.batch([db.prepare('UPDATE user_watchlists SET revision=revision+1 WHERE owner_id=?').bind('first'),insert(db,'second')]);assert.equal(events.length,2,'A committed multi-write transaction emits one notification.');
  await db.batch([db.prepare('SELECT * FROM user_watchlists'),db.prepare('DELETE FROM user_watchlists WHERE owner_id=?').bind('absent')]);assert.equal(events.length,2);
  await assert.rejects(db.batch([insert(db,'rolled-back'),db.prepare('INSERT INTO table_that_does_not_exist VALUES(?)').bind('unused')]));
  assert.equal(events.length,2,'Rolled-back mutations are not notified.');assert.equal(await db.prepare('SELECT owner_id FROM user_watchlists WHERE owner_id=?').bind('rolled-back').first(),null);
  const reopened=await createLocalD1({databasePath:db.databasePath,onChange:()=>{events.push([]);}});assert.equal(events.length,2,'Migration verification on restart does not emit a notification.');await reopened.prepare('SELECT COUNT(*) AS n FROM user_watchlists').first();assert.equal(events.length,2);
});
test('callback failures cannot turn an already committed write into a failed database response',async t=>{
  const directory=await temporary(t);
  const db=await createLocalD1({databasePath:join(directory,'test.sqlite3'),onChange:async()=>{throw Error('Notification unavailable');}});
  assert.equal((await insert(db,'committed').run()).meta.changes,1);
  assert.equal((await db.prepare('SELECT owner_id FROM user_watchlists').first()).owner_id,'committed');
  await assert.rejects(createLocalD1({databasePath:join(directory,'invalid.sqlite3'),onChange:'invalid'}),/onChange/);
});
test('backup queue coalesces writes and drains a second snapshot when another write lands during the first',async()=>{
  let calls=0,release;
  const queue=createCloudBackupQueue({delayMs:500,save:async()=>{calls++;if(calls===1)await new Promise(accept=>{release=accept;});}});
  queue.notify();queue.notify();const pending=queue.flush();assert.equal(calls,1);
  queue.notify();queue.notify();release();await pending;assert.equal(calls,2,'Mutations received during the first save require a second consistent snapshot.');
  await queue.flush();assert.equal(calls,2,'A clean queue does not create redundant backups.');
  queue.pause();await queue.flush({force:true});assert.equal(calls,3,'Final drain can force a last snapshot after stopping timers.');
});
test('failed backups remain dirty for a later retry without rejecting committed database operations',async()=>{
  let calls=0;const queue=createCloudBackupQueue({delayMs:500,save:async()=>{calls++;if(calls===1)throw Error('Storage temporarily unavailable');}});
  queue.notify();await assert.rejects(queue.flush());assert.equal(calls,1);
  await queue.flush();assert.equal(calls,2);queue.pause();
});
test('only the fixed one-field IPC event can trigger a child database backup',()=>{
  assert(isDatabaseChangedMessage({type:'pcr_database_changed'}));
  for(const value of [null,[],{},'pcr_database_changed',{type:'other'},{type:'pcr_database_changed',sql:'not-permitted'},{type:'pcr_database_changed',token:'not-permitted'}])assert(!isDatabaseChangedMessage(value));
});
