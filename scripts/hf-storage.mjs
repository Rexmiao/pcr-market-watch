// Live SQLite stays on the container's local disk. Only consistent, immutable
// backup files and their checksum manifests are written to an attached bucket.
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,link,lstat,mkdir,open,readFile,readdir,realpath,rm} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';

const MAX_BYTES=512*1024*1024;
const MANIFEST=/^pcr-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{16}\.json$/;
const CONTENT=/^pcr-[a-f0-9]{64}\.sqlite3$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const inside=(parent,path)=>{const value=relative(parent,path);return value===''||!value.startsWith('..')&&!isAbsolute(value);};

export async function assertHfBackupMounted(backupDirectory,{platform=process.platform,mountInfoPath='/proc/self/mountinfo'}={}){
  if(platform!=='linux'||typeof backupDirectory!=='string'||!isAbsolute(backupDirectory))throw fail('BACKUP_MOUNT_VERIFICATION_UNAVAILABLE');
  const directory=resolve(backupDirectory),decode=value=>value.replace(/\\([0-7]{3})/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
  let source;try{source=await readFile(mountInfoPath,'utf8');}catch{throw fail('BACKUP_MOUNT_VERIFICATION_UNAVAILABLE');}
  for(const row of source.split('\n')){
    const halves=row.split(' - ');if(halves.length!==2)continue;
    const fields=halves[0].split(' '),mount=decode(fields[4]||''),filesystem=halves[1].split(' ')[0];
    if(mount&&mount!=='/'&&inside(mount,directory)&&(/^(?:nfs|fuse)/.test(filesystem)||['ext4','xfs','btrfs','9p','virtiofs'].includes(filesystem)))return {verified:true};
  }
  throw fail('BACKUP_ATTACHED_VOLUME_REQUIRED');
}
const PYTHON=String.raw`import json,pathlib,sqlite3,sys
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
try:
    x=json.load(sys.stdin)
    source=pathlib.Path(x['source']).resolve()
    connection=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=25)
    if x['action']=='backup':
        target=sqlite3.connect(x['target'],timeout=25)
        connection.backup(target,pages=256,sleep=0.05)
        target.close()
    elif x['action']=='verify':
        if connection.execute('PRAGMA quick_check').fetchall()!=[('ok',)]:
            raise ValueError('integrity')
    else:
        raise ValueError('action')
    connection.close()
    print('{"ok":true}')
except Exception:
    print('{"ok":false}')
    sys.exit(1)
`;

async function sqlite(pythonExecutable,input){
  await new Promise((accept,reject)=>{
    const child=spawn(pythonExecutable,['-B','-u','-c',PYTHON],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    let output='',settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept();};
    const timer=setTimeout(()=>{child.kill();finish(fail('BACKUP_SQLITE_TIMEOUT'));},45000);
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>1024){child.kill();finish(fail('BACKUP_SQLITE_FAILED'));}});
    child.stderr.on('data',()=>{});
    child.on('error',()=>finish(fail('BACKUP_SQLITE_FAILED')));
    child.stdin.on('error',()=>finish(fail('BACKUP_SQLITE_FAILED')));
    child.on('close',code=>{let result;try{result=JSON.parse(output);}catch{}finish(code===0&&result?.ok===true?null:fail('BACKUP_SQLITE_FAILED'));});
    child.stdin.end(JSON.stringify(input));
  });
}

async function regularFile(file,{maxBytes=MAX_BYTES}={}){
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maxBytes||resolve(await realpath(file))!==resolve(file))throw fail('BACKUP_UNSAFE_FILE');
  return stat;
}
async function settings({databasePath,backupDirectory,pythonExecutable=process.env.PCR_PYTHON||'python3',now=()=>Date.now()}={}){
  if(typeof databasePath!=='string'||!isAbsolute(databasePath)||typeof backupDirectory!=='string'||!isAbsolute(backupDirectory))throw fail('BACKUP_INVALID_CONFIGURATION');
  const database=resolve(databasePath),directory=resolve(backupDirectory);
  if(inside(directory,database)||directory===dirname(database))throw fail('BACKUP_LIVE_DATABASE_ON_MOUNT');
  await mkdir(directory,{recursive:true});
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await realpath(directory))!==directory)throw fail('BACKUP_UNSAFE_DIRECTORY');
  return {database,directory,pythonExecutable,now};
}
async function manifests(directory){
  // A bounded read avoids a huge archive scan on every hourly backup.
  return (await readdir(directory)).filter(name=>MANIFEST.test(name)).sort().reverse().slice(0,50);
}
async function verifiedManifest(directory,name){
  await regularFile(join(directory,name),{maxBytes:16384});
  const value=JSON.parse(await readFile(join(directory,name),'utf8'));
    if(value?.schemaVersion!==1||typeof value.file!=='string'||!CONTENT.test(value.file)||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>MAX_BYTES||!(/^[a-f0-9]{64}$/).test(value.sha256)||typeof value.createdAt!=='string'||new Date(value.createdAt).toISOString()!==value.createdAt||value.file!=='pcr-'+value.sha256+'.sqlite3')throw fail('BACKUP_INVALID_MANIFEST');
  const file=join(directory,value.file),stat=await regularFile(file);
  if(stat.size!==value.bytes||sha(await readFile(file))!==value.sha256)throw fail('BACKUP_CHECKSUM_MISMATCH');
  return value;
}
async function immutableFile(path,body){
  const handle=await open(path,'wx',0o600);
  try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
}

export async function backupHfDatabase(options){
  const {database,directory,pythonExecutable,now}=await settings(options);
  await regularFile(database);
  const temporary=join(dirname(database),'.pcr-backup-'+randomUUID()+'.sqlite3');
  try{
    await sqlite(pythonExecutable,{action:'backup',source:database,target:temporary});
    await regularFile(temporary);
    await sqlite(pythonExecutable,{action:'verify',source:temporary});
    const body=await readFile(temporary),digest=sha(body),file='pcr-'+digest+'.sqlite3';
    for(const name of await manifests(directory)){
      try{const value=await verifiedManifest(directory,name);if(value.sha256===digest)return {status:'unchanged',createdAt:value.createdAt,bytes:value.bytes};}catch{}
    }
    const contentPath=join(directory,file);
    try{await immutableFile(contentPath,body);}catch(error){
      if(error.code!=='EEXIST')throw error;
      const stat=await regularFile(contentPath);
      if(stat.size!==body.length||sha(await readFile(contentPath))!==digest)throw fail('BACKUP_CHECKSUM_MISMATCH');
    }
    // Read back the closed object before publishing its manifest. A partially
    // uploaded object therefore never becomes a valid restore candidate.
    if(sha(await readFile(contentPath))!==digest)throw fail('BACKUP_CHECKSUM_MISMATCH');
    const createdAt=new Date(now()).toISOString();
    const value={schemaVersion:1,createdAt,file,bytes:body.length,sha256:digest};
    const manifestName='pcr-'+createdAt.replace(/[:.]/g,'-')+'-'+digest.slice(0,16)+'.json';
    try{await immutableFile(join(directory,manifestName),JSON.stringify(value)+'\n');}catch(error){if(error.code!=='EEXIST')throw error;}
    await verifiedManifest(directory,manifestName);
    return {status:'saved',createdAt,bytes:body.length};
  }catch(error){if(error?.code?.startsWith('BACKUP_'))throw error;throw fail('BACKUP_SAVE_FAILED');}
  finally{await rm(temporary,{force:true});}
}

export async function restoreHfDatabase(options){
  const {database,directory,pythonExecutable}=await settings(options);
  try{await regularFile(database);return {status:'existing',createdAt:null,bytes:(await lstat(database)).size};}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(database),{recursive:true});
  const names=await manifests(directory);
  if(!names.length)return {status:'empty',createdAt:null,bytes:0};
  for(const name of names){
    const temporary=join(dirname(database),'.pcr-restore-'+randomUUID()+'.sqlite3');
    try{
      const value=await verifiedManifest(directory,name);
      await copyFile(join(directory,value.file),temporary,constants.COPYFILE_EXCL);
      await regularFile(temporary);
      if(sha(await readFile(temporary))!==value.sha256)throw fail('BACKUP_CHECKSUM_MISMATCH');
      await sqlite(pythonExecutable,{action:'verify',source:temporary});
      // The temporary snapshot is already verified on this local filesystem.
      // A hard link publishes the whole file atomically without replacing a
      // database created by a concurrent startup.
      await link(temporary,database);
      return {status:'restored',createdAt:value.createdAt,bytes:value.bytes};
    }catch(error){if(error.code==='EEXIST')throw fail('BACKUP_LIVE_DATABASE_EXISTS');}
    finally{await rm(temporary,{force:true});}
  }
  throw fail('BACKUP_NO_VALID_SNAPSHOT');
}
