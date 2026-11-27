// Status normally uses one read-only SELECT, without an explicit write lock.
// Unusually large checkpoints use the bounded fixed-ID fallback below.
export const STATUS_INLINE_CHARACTER_LIMIT=500000;
export const STRUCTURE_STATUS_SQL=`
WITH parameters AS (
  SELECT ? AS scheduled_mode, ? AS state_id, ? AS lease_id, ? AS inline_limit
), latest AS (
  SELECT run_id,payload_json FROM structure_daily_runs ORDER BY started_at DESC LIMIT 1
), scheduled AS (
  SELECT run_id,payload_json FROM structure_daily_runs
  WHERE mode=(SELECT scheduled_mode FROM parameters) ORDER BY started_at DESC LIMIT 1
), size_check AS (
  SELECT COALESCE((SELECT LENGTH(payload_json) FROM latest),0)
       + CASE WHEN (SELECT run_id FROM scheduled)=(SELECT run_id FROM latest)
              THEN 0 ELSE COALESCE((SELECT LENGTH(payload_json) FROM scheduled),0) END AS characters
), counts AS (
  SELECT COUNT(*) AS record_count, COUNT(DISTINCT observation_date) AS date_count,
         MAX(queried_at) AS latest_queried_at FROM structure_snapshots
)
SELECT
  (SELECT payload_json FROM structure_daily_state WHERE id=(SELECT state_id FROM parameters)) AS state_payload,
  (SELECT lease_until FROM structure_daily_state WHERE id=(SELECT lease_id FROM parameters)) AS lease_until,
  (SELECT run_id FROM latest) AS latest_run_id,
  (SELECT run_id FROM scheduled) AS scheduled_run_id,
  CASE WHEN (SELECT characters FROM size_check)<=(SELECT inline_limit FROM parameters)
       THEN (SELECT payload_json FROM latest) END AS latest_payload,
  CASE WHEN (SELECT characters FROM size_check)<=(SELECT inline_limit FROM parameters)
         AND ((SELECT run_id FROM scheduled)!=(SELECT run_id FROM latest) OR NOT EXISTS(SELECT 1 FROM latest))
       THEN (SELECT payload_json FROM scheduled) END AS scheduled_payload,
  CASE WHEN (SELECT characters FROM size_check)>(SELECT inline_limit FROM parameters) THEN 1 ELSE 0 END AS payload_fallback,
  record_count,date_count,latest_queried_at
FROM counts`;

export async function readStructureStatusRows(database){
  const row=await database.prepare(STRUCTURE_STATUS_SQL).bind('scheduled','daily','lease',STATUS_INLINE_CHARACTER_LIMIT).first();
  if(!row)throw Error('STRUCTURE_STATUS_UNAVAILABLE');
  let last=row.latest_run_id?{payload_json:row.latest_payload}:null;
  let lastScheduled=row.scheduled_run_id?{payload_json:row.scheduled_payload}:null;
  // The existing SQLite bridge caps an individual response at 2MB. Do not merge
  // two unusually large checkpoint JSON strings into an oversized response.
  // Fixed-ID fallback retains existing semantics without a new storage schema.
  if(row.payload_fallback){
    last=row.latest_run_id?await database.prepare('SELECT payload_json FROM structure_daily_runs WHERE run_id=?').bind(row.latest_run_id).first():null;
    lastScheduled=row.scheduled_run_id===row.latest_run_id?last:row.scheduled_run_id?await database.prepare('SELECT payload_json FROM structure_daily_runs WHERE run_id=?').bind(row.scheduled_run_id).first():null;
  }else if(row.scheduled_run_id===row.latest_run_id){lastScheduled=last;}
  return {
    statePayload:row.state_payload,
    last,lastScheduled,
    count:{record_count:row.record_count,date_count:row.date_count,latest_queried_at:row.latest_queried_at},
    lease:row.lease_until===null?null:{lease_until:row.lease_until},
    payloadFallback:row.payload_fallback===1,
  };
}

const validInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function safeMetadata(value){return {
  available:value?.available===true,
  state:['Ready','Running','Disabled','not_found','not_supported','not_configured'].includes(value?.state)?value.state:'unavailable',
  nextRunAt:validInstant(value?.nextRunAt)?value.nextRunAt:null,
  kind:['windows_task','cloud_process','local_process'].includes(value?.kind)?value.kind:null,
};}
export function createTaskMetadataReader({read,now=()=>Date.now(),ttlMs=30000}={}){
  if(typeof read!=='function'||ttlMs!==30000)throw Error('INVALID_SCHEDULER_CACHE_OPTIONS');
  let saved=null,pending=null;
  const view=(entry,status,coalesced=false)=>({...structuredClone(entry.value),metadataCache:{status,checkedAt:new Date(entry.at).toISOString(),ageMs:Math.max(0,now()-entry.at),ttlMs:entry.cacheable?ttlMs:0,coalesced}});
  return async()=>{
    const age=saved?now()-saved.at:null;
    if(saved&&age>=0&&age<ttlMs)return view(saved,'cached');
    if(pending){const entry=await pending;return view(entry,entry.success?entry.cacheable?'fresh':'not_cached':'unavailable',true);}
    pending=(async()=>{
      let raw;try{raw=await read();}catch{raw={available:false,state:'unavailable'};}
      const value=safeMetadata(raw),success=value.available&&['Ready','Running','Disabled'].includes(value.state);
      const entry={value,at:now(),success,cacheable:success&&value.kind==='windows_task'};
      saved=entry.cacheable?entry:null;
      return entry;
    })();
    try{const entry=await pending;return view(entry,entry.success?entry.cacheable?'fresh':'not_cached':'unavailable');}finally{pending=null;}
  };
}
