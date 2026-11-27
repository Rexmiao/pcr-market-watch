// A narrow Node cloud Cache API adapter for existing public market-data keys.
// No owner endpoints, request headers, credentials, or arbitrary URLs persist.
import {gzipSync,gunzipSync} from 'node:zlib';

export const WORKER_CACHE_LIMITS=Object.freeze({maxBodyBytes:4*1024*1024,maxCompressedBytes:512*1024,maxEntries:128,maxAgeSeconds:30*86400});
const PREFIX='/__pcr_internal_cache__/';
const CORE=new Set(['NVDA','MU','SPY','QQQ','DIA','AVGO','AMD']);
const AUTH_HEADERS=['authorization','proxy-authorization','cookie','x-pcr-authorization','x-api-key','x-auth-token'];
const PRIVATE_KEYS=new Set(['accesstoken','refreshtoken','appkey','apikey','password','secret','secretkey','clientsecret','authorization','cookie','account','accounts','accountid','accid','ownerid','userid','position','positions','groupsjson','credentials']);
const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const invalid=()=>new TypeError('Only bounded public PCR cache records are supported.');
function keyFor(input){
  try{
    const request=input instanceof Request?input:new Request(input),url=new URL(request.url);
    if(request.method!=='GET'||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||AUTH_HEADERS.some(key=>request.headers.has(key)))return null;
    const path=url.pathname;
    if(path===PREFIX+'complete-v1'||path===PREFIX+'cboe-history-v1/all')return path;
    if(new RegExp('^'+PREFIX+'symbol-v1/[A-Z][A-Z0-9.]{0,9}$').test(path))return path;
    if(path===PREFIX+'cboe-v1/latest')return path;
    if(path.startsWith(PREFIX+'cboe-v1/')&&day(path.slice((PREFIX+'cboe-v1/').length)))return path;
    return null;
  }catch{return null;}
}
function noPrivateFields(value,depth=0){
  if(depth>24)return false;
  if(value===null||typeof value!=='object')return true;
  if(Array.isArray(value))return value.every(item=>noPrivateFields(item,depth+1));
  return Object.entries(value).every(([key,item])=>!PRIVATE_KEYS.has(key.replace(/[-_]/g,'').toLowerCase())&&noPrivateFields(item,depth+1));
}
function publicRecord(record){return object(record)&&record.schemaVersion===1&&stamp(record.checkedAt)&&object(record.snapshot)&&day(record.snapshot.date)&&object(record.snapshot.metrics);}
function validPayload(key,value){
  if(!object(value)||!noPrivateFields(value))return false;
  if(key===PREFIX+'complete-v1')return value.version===1&&object(value.raw?.data)&&object(value.data?.instruments)&&Object.keys(value.raw.data).length===CORE.size&&Object.keys(value.data.instruments).length===CORE.size&&Object.keys(value.raw.data).every(symbol=>CORE.has(symbol))&&Object.keys(value.data.instruments).every(symbol=>CORE.has(symbol));
  if(key.startsWith(PREFIX+'symbol-v1/'))return value.version===1&&value.symbol===key.slice((PREFIX+'symbol-v1/').length)&&Array.isArray(value.rows)&&value.rows.length>0;
  if(key===PREFIX+'cboe-history-v1/all')return value.schemaVersion===1&&value.kind==='cboe-history'&&Array.isArray(value.records)&&value.records.length<=4096&&value.records.every(publicRecord);
  if(key.startsWith(PREFIX+'cboe-v1/'))return publicRecord(value)&&(key===PREFIX+'cboe-v1/latest'||value.snapshot.date===key.slice((PREFIX+'cboe-v1/').length));
  return false;
}
function publicHeaders(response){
  if(!(response instanceof Response)||response.status!==200||response.headers.has('set-cookie')||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw invalid();
  const directives=(response.headers.get('cache-control')||'').toLowerCase().split(',').map(value=>value.trim());
  const ages=directives.filter(value=>/^max-age=\d+$/.test(value));
  if(!directives.includes('public')||directives.some(value=>/^(?:private|no-store|no-cache)(?:=|$)/.test(value))||ages.length!==1)throw invalid();
  const age=Math.min(Number(ages[0].slice(8)),WORKER_CACHE_LIMITS.maxAgeSeconds);
  if(!Number.isSafeInteger(age)||age<1)throw invalid();
  return {age,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age='+age}};
}
async function boundedBody(response){
  if(Number(response.headers.get('content-length')||0)>WORKER_CACHE_LIMITS.maxBodyBytes)throw invalid();
  const reader=response.clone().body?.getReader();if(!reader)return Buffer.alloc(0);
  let bytes=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>WORKER_CACHE_LIMITS.maxBodyBytes){void reader.cancel().catch(()=>{});throw invalid();}chunks.push(value);}
  return Buffer.concat(chunks.map(value=>Buffer.from(value)));
}
export function createSqliteWorkerCache({database,now=()=>Date.now()}={}){
  if(!database?.prepare||!database?.batch)throw invalid();
  async function remove(key){const result=await database.prepare('DELETE FROM worker_cache WHERE cache_key=?').bind(key).run();return result.meta.changes>0;}
  return {
    async put(input,response){
      const key=keyFor(input);if(!key)throw invalid();
      const {age,headers}=publicHeaders(response),body=await boundedBody(response);let parsed;
      try{parsed=JSON.parse(body.toString('utf8'));}catch{throw invalid();}
      if(!validPayload(key,parsed))throw invalid();
      const compressed=gzipSync(body);if(compressed.byteLength>WORKER_CACHE_LIMITS.maxCompressedBytes)throw invalid();
      const at=now();if(!Number.isSafeInteger(at))throw invalid();
      await database.batch([
        database.prepare('DELETE FROM worker_cache WHERE expires_at<=?').bind(at),
        database.prepare('INSERT INTO worker_cache(cache_key,body_gzip_base64,headers_json,body_bytes,compressed_bytes,stored_at,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET body_gzip_base64=excluded.body_gzip_base64,headers_json=excluded.headers_json,body_bytes=excluded.body_bytes,compressed_bytes=excluded.compressed_bytes,stored_at=excluded.stored_at,expires_at=excluded.expires_at').bind(key,compressed.toString('base64'),JSON.stringify(headers),body.byteLength,compressed.byteLength,new Date(at).toISOString(),at+age*1000),
        // Preserve the complete corpus and merged history while bounding
        // per-symbol and per-day entries using the most recent write times.
        database.prepare('DELETE FROM worker_cache WHERE cache_key NOT IN (SELECT cache_key FROM worker_cache ORDER BY CASE WHEN cache_key IN (?,?,?) THEN 0 ELSE 1 END,stored_at DESC,cache_key LIMIT ?)').bind(PREFIX+'complete-v1',PREFIX+'cboe-history-v1/all',PREFIX+'cboe-v1/latest',WORKER_CACHE_LIMITS.maxEntries),
      ]);
    },
    async match(input){
      const key=keyFor(input);if(!key)return undefined;
      const row=await database.prepare('SELECT body_gzip_base64,headers_json,body_bytes,compressed_bytes,expires_at FROM worker_cache WHERE cache_key=?').bind(key).first();if(!row)return undefined;
      try{
        if(!Number.isSafeInteger(row.expires_at)||row.expires_at<=now()||typeof row.body_gzip_base64!=='string'||row.body_gzip_base64.length>Math.ceil(WORKER_CACHE_LIMITS.maxCompressedBytes/3)*4||!Number.isSafeInteger(row.body_bytes)||row.body_bytes<1||row.body_bytes>WORKER_CACHE_LIMITS.maxBodyBytes||!Number.isSafeInteger(row.compressed_bytes)||row.compressed_bytes<1||row.compressed_bytes>WORKER_CACHE_LIMITS.maxCompressedBytes)throw invalid();
        const compressed=Buffer.from(row.body_gzip_base64,'base64');if(compressed.toString('base64')!==row.body_gzip_base64||compressed.byteLength!==row.compressed_bytes)throw invalid();
        const body=gunzipSync(compressed,{maxOutputLength:WORKER_CACHE_LIMITS.maxBodyBytes});if(body.byteLength!==row.body_bytes||!validPayload(key,JSON.parse(body.toString('utf8'))))throw invalid();
        const headers=JSON.parse(row.headers_json),safe=publicHeaders(new Response(null,{headers}));
        return new Response(body,{status:200,headers:safe.headers});
      }catch{await remove(key);return undefined;}
    },
    async delete(input){const key=keyFor(input);return key?remove(key):false;},
  };
}
export function installCloudWorkerCache({database,env=process.env,now}={}){
  if(env.PCR_RUNTIME!=='cloud')return false;
  globalThis.caches={...globalThis.caches,default:createSqliteWorkerCache({database,now})};
  return true;
}
