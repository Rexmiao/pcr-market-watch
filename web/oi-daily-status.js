import {getLanguage,t,registerTranslations,translatePage} from './i18n.js';

registerTranslations({
  oiDailyTitle:['每日 OI 归档','Daily OI archive'],oiDailyOpen:['选择历史日期','Choose a historical date'],
  oiDailyNote:['美东查询日与结算日分开记录；未知结算日不会按 T−1 推算。本机任务需开机并登录，云端任务需服务保持运行和可持久保存。','New York query dates and settlement dates are recorded separately; unknown settlement dates are not inferred from T−1. Local tasks require power and sign-in. Cloud tasks need a running service and durable storage.'],
  oiDailyLoading:['正在读取每日 OI 归档任务…','Reading the daily OI archive task…'],
  oiDailyUnsupported:['此部署不提供每日 OI 归档任务状态。','Daily OI archive task status is not available in this deployment.'],
  oiDailyFailed:['暂时无法读取每日 OI 任务状态。','Daily OI task status could not be read.'],
  oiDailyRetained:['本次读取失败；以下保留上次状态和原始检查时间，调度可能已变化。','This read failed. Previous state and its original check time are retained; scheduling may have changed.'],
  oiDailyReady:['任务状态和最近归档结果分别列出；读取状态不会运行任务或请求新行情。','Scheduler state and the latest archive result are listed separately. Reading status does not run the task or request new quotes.'],
  oiDailySchedule:['每日计划 · 美东','Daily plan · Eastern'],oiDailyNext:['调度器确认的下次运行','Scheduler-confirmed next run'],
  oiDailyUnconfirmed:['未确认调度；计划参考 {time}','Scheduling unconfirmed; planned estimate {time}'],oiDailyNoNext:['尚无调度器确认的下次运行','No scheduler-confirmed next run'],
  oiDailyState:['调度状态','Scheduler state'],oiDailyLastTask:['最近任务执行','Last task execution'],oiDailyExit:['进程退出码','Process exit code'],
  oiDailyRun:['最近一次抓取','Latest capture'],oiDailyRunTime:['实际开始 / 完成','Actual start / completion'],oiDailyQueryDate:['美东查询日','New York query day'],
  oiDailyCounts:['请求 / 保存 / 未取得','Requested / saved / unavailable'],oiDailyChecked:['状态读取时间','Status read'],
  oiDailyUnknown:['未知','Unknown'],oiDailyNotRun:['尚无执行记录','No execution recorded'],oiDailyModeManual:['手动抓取','Manual capture'],oiDailyModeScheduled:['每日定时','Daily scheduled'],
  oiDailySuccess:['已保存','Saved'],oiDailyPartial:['部分保存','Partially saved'],oiDailyUnavailable:['未取得 OI','OI unavailable'],oiDailyEmpty:['关注名单为空','Watchlist empty'],
  oiDailyReadyState:['就绪','Ready'],oiDailyRunning:['运行中','Running'],oiDailyDisabled:['已禁用','Disabled'],oiDailyMissing:['未找到任务','Task not found'],oiDailyStateUnknown:['无法确认','Unconfirmed'],
  oiDailyHealthNote:['“就绪”和手动抓取不代表定时成功。只依据实际定时报告核验；未保存的过去 OI 不会反填。休眠、停机或网络都可能影响采集，无记录时不猜原因。','Ready state and manual captures do not prove scheduled success. Verification uses actual scheduled reports. Unsaved past OI is never backfilled. Sleep, power and network can affect collection; missing records do not establish a cause.'],
  oiDailyHealthWaiting:['尚未到本次每日计划；手动归档不构成实际定时触发证据。','This daily plan is not due yet. A manual archive does not establish scheduled execution.'],
  oiDailyHealthAwaiting:['计划已到，正在启动／采集的 5 分钟宽限内；尚无完成报告。','The plan is due and within its five-minute startup/capture grace period; no completion report exists yet.'],
  oiDailyHealthSuccess:['已找到本次计划的完整定时保存报告。','A complete scheduled-save report exists for the assessed plan.'],
  oiDailyHealthPartial:['本次定时仅保存了部分标的；请查看实际保存数量和授权状态。','The assessed scheduled capture saved only some symbols. Check its saved count and authorization metadata.'],
  oiDailyHealthFailed:['本次定时未取得可保存的 OI；旧归档仍保留，不会当作新结果。','The assessed scheduled capture obtained no savable OI. Prior archives remain and are not presented as a new result.'],
  oiDailyHealthMissed:['启用后的已过计划没有完成的定时报告；过去 OI 不会补造，无法据此确定漏采原因。','A due plan since monitoring began has no completed scheduled report. Past OI is not invented, and the cause cannot be established from missing records.'],
  oiDailyHealthEmpty:['本次定时运行时关注名单为空，没有行情请求。','The watchlist was empty at the assessed scheduled run, so no quotes were requested.'],
  oiDailyHealthDisabled:['每日采集当前已禁用；保留的历史不表示任务仍在执行。','Daily capture is disabled. Retained history does not mean the task is still running.'],
  oiDailyHealthUnconfirmed:['监测起点或调度状态尚无法确认；不追判过去，也不把“就绪”当作定时成功。','The monitoring start or scheduler cannot be confirmed. Past runs are not inferred, and Ready is not scheduled success.'],
  oiDailyMonitoringSince:['监测启用时间','Monitoring enabled since'],oiDailyAssessedPlan:['本次核验对应计划','Assessed due plan'],
  oiDailyEvidence:['实际定时证据','Actual scheduled evidence'],oiDailyEvidenceNone:['尚无实际定时报告','No actual scheduled report'],oiDailyScheduledLast:['最近实际定时运行','Latest actual scheduled run'],
  oiDailyScheduledCounts:['定时保存 / 请求','Scheduled saved / requested'],oiDailyMissingDates:['近 30 日无定时报告','No scheduled report · last 30 days'],
  oiDailyMissingNone:['已检查启用后的到期计划，未发现缺记录','No missing reports among due plans since monitoring began'],oiDailyMissingUnknown:['启用时间未知，无法判断过去','Start unknown; past coverage cannot be assessed'],
  oiDailyMissingConsecutive:['连续无定时报告天数','Consecutive days without reports'],oiDailyAuth:['行情授权元数据','Quote authorization metadata'],
  oiDailyAuthAvailable:['保存的访问期限内；未联网核验','Within saved access expiry; not checked online'],
  oiDailyAuthRefresh:['访问需续期；下一次行情请求可尝试自动刷新','Access needs renewal; the next quote request can try automatic refresh'],
  oiDailyAuthReconnect:['需要重新连接行情授权','Quote authorization needs reconnection'],oiDailyAuthMissing:['尚未配置行情授权','Quote authorization is not configured'],
  oiDailyAuthUnknown:['授权元数据不可读／未知','Authorization metadata unavailable or unknown'],
  oiDailyAccessExpiry:['访问令牌期限','Access-token expiry'],oiDailyRefreshExpiry:['刷新授权期限','Refresh-authorization expiry'],
  oiDailyRefreshUnknown:['来源未提供；不代表永久有效','Undisclosed; this does not mean permanent validity'],
});

const instant=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
export function dailyNextRun(payload){
  const scheduler=payload?.scheduler,state=String(scheduler?.state||'').toLowerCase(),time=instant(scheduler?.nextRunAt);
  if(scheduler?.available===true&&time&&!['disabled','not_found','unavailable'].includes(state))return {confirmed:true,time};
  return {confirmed:false,time:instant(payload?.nextPlannedAt)};
}
export function dailyHealthMessage(payload){
  const health=payload?.health;
  const key=({waiting:'oiDailyHealthWaiting',awaiting:'oiDailyHealthAwaiting',success:'oiDailyHealthSuccess',partial:'oiDailyHealthPartial',failed:'oiDailyHealthFailed',missed:'oiDailyHealthMissed',empty_watchlist:'oiDailyHealthEmpty',disabled:'oiDailyHealthDisabled',unconfirmed:'oiDailyHealthUnconfirmed'})[health?.status]||'oiDailyHealthUnconfirmed';
  const warn=['partial','failed','missed','empty_watchlist','disabled'].includes(health?.status)||(Array.isArray(health?.missingDates)&&health.missingDates.length>0)||['reconnect_required','not_configured','unavailable'].includes(payload?.authorization?.status);
  return {key,tone:warn?'error':'info'};
}

const $=id=>document.getElementById(id);
if(typeof document!=='undefined'&&$('oi-daily-card')){
  let data=null,supported=null,failed=false,loading=false,timer=null,generation=0,controller=null;
  const time=value=>instant(value)?new Intl.DateTimeFormat(getLanguage()==='en'?'en-CA':'zh-CN',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))+' ET':t('oiDailyUnknown');
  const count=value=>Number.isSafeInteger(value)&&value>=0?new Intl.NumberFormat(getLanguage()==='en'?'en-US':'zh-CN').format(value):'—';
  const statusKey=value=>({success:'oiDailySuccess',partial:'oiDailyPartial',unavailable:'oiDailyUnavailable',empty_watchlist:'oiDailyEmpty'})[value]||'oiDailyUnknown';
  const stateKey=value=>({ready:'oiDailyReadyState',running:'oiDailyRunning',disabled:'oiDailyDisabled',not_found:'oiDailyMissing'})[String(value).toLowerCase()]||'oiDailyStateUnknown';
  function render(){
    const host=$('oi-daily-details');host.replaceChildren();
    const healthBox=$('oi-daily-health');if(healthBox)healthBox.textContent='';
    $('oi-daily-status').textContent=t(loading?'oiDailyLoading':supported===false?'oiDailyUnsupported':failed?(data?'oiDailyRetained':'oiDailyFailed'):'oiDailyReady');
    if(!data||supported===false)return;
    const pair=(label,value)=>{const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=t(label);detail.textContent=value;host.append(term,detail);};
    const scheduler=data.scheduler||{},next=dailyNextRun(data),last=data.lastRun;
    pair('oiDailySchedule',/^\d\d:\d\d$/.test(data.scheduledTime)?data.scheduledTime+' ET (America/New_York)':t('oiDailyUnknown'));
    pair('oiDailyNext',next.confirmed?time(next.time):next.time?t('oiDailyUnconfirmed',{time:time(next.time)}):t('oiDailyNoNext'));
    pair('oiDailyState',t(scheduler.available===true?stateKey(scheduler.state):'oiDailyStateUnknown'));
    if(data.health){
      const health=data.health,message=dailyHealthMessage(data),scheduled=health.lastScheduledRun;
      if(healthBox){healthBox.textContent=t(message.key);healthBox.dataset.state=message.tone;}
      pair('oiDailyAssessedPlan',time(health.assessedDueAt));
      pair('oiDailyMonitoringSince',time(health.monitoringEnabledSince));
      pair('oiDailyEvidence',scheduled?t(statusKey(scheduled.status)):t('oiDailyEvidenceNone'));
      if(scheduled){pair('oiDailyScheduledLast',time(scheduled.startedAt)+' / '+time(scheduled.completedAt));pair('oiDailyScheduledCounts',count(scheduled.savedCount)+' / '+count(scheduled.requestedCount));}
      pair('oiDailyMissingDates',health.monitoringEnabledSince?(health.missingDates?.length?health.missingDates.join(' · '):t('oiDailyMissingNone')):t('oiDailyMissingUnknown'));
      pair('oiDailyMissingConsecutive',count(health.consecutiveMissingDays));
    }
    if(data.authorization){
      const auth=data.authorization,key=({available:'oiDailyAuthAvailable',refresh_needed:'oiDailyAuthRefresh',reconnect_required:'oiDailyAuthReconnect',not_configured:'oiDailyAuthMissing',unavailable:'oiDailyAuthUnknown'})[auth.status]||'oiDailyAuthUnknown';
      pair('oiDailyAuth',t(key));pair('oiDailyAccessExpiry',time(auth.accessExpiresAt));
      pair('oiDailyRefreshExpiry',auth.refreshExpiryKnown?time(auth.refreshExpiresAt):t('oiDailyRefreshUnknown'));
    }
    pair('oiDailyLastTask',instant(scheduler.lastRunAt)?time(scheduler.lastRunAt):t('oiDailyNotRun'));
    pair('oiDailyExit',instant(scheduler.lastRunAt)?count(scheduler.lastTaskResult):t('oiDailyNotRun'));
    if(last&&typeof last==='object'){
      pair('oiDailyRun',t(statusKey(last.status))+' · '+t(last.mode==='scheduled'?'oiDailyModeScheduled':last.mode==='manual'?'oiDailyModeManual':'oiDailyUnknown'));
      pair('oiDailyRunTime',time(last.startedAt)+' / '+time(last.completedAt));
      pair('oiDailyQueryDate',/^\d{4}-\d{2}-\d{2}$/.test(last.observationDate)?last.observationDate:t('oiDailyUnknown'));
      pair('oiDailyCounts',count(last.requestedCount)+' / '+count(last.savedCount)+' / '+count(last.unavailableCount));
    }else pair('oiDailyRun',t('oiDailyNotRun'));
    pair('oiDailyChecked',time(data.checkedAt));
  }
  function stop(){if(timer!==null)clearTimeout(timer);timer=null;}
  function schedule(){stop();if(!document.hidden&&supported!==false)timer=setTimeout(()=>void load(),60000);}
  async function load(){
    const turn=++generation;controller?.abort();controller=new AbortController();const active=controller;loading=true;stop();render();
    try{
      const response=await fetch('/api/oi-daily',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([active.signal,AbortSignal.timeout(20000)])});
      if(turn!==generation)return;
      if([404,501].includes(response.status)){supported=false;data=null;failed=false;return;}
      const payload=await response.json();if(turn!==generation)return;
      if(payload?.supported===false){supported=false;data=null;failed=false;return;}
      if(!response.ok||payload?.supported!==true||payload.timeZone!=='America/New_York'||!payload.scheduler)throw Error('UNAVAILABLE');
      data=payload;supported=true;failed=false;
    }catch{if(turn===generation)failed=true;}
    finally{if(turn===generation){loading=false;controller=null;render();schedule();}}
  }
  $('reviews-refresh')?.addEventListener('click',()=>void load());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else schedule();});
  window.addEventListener('pcr-language-change',render);
  window.addEventListener('pagehide',()=>{generation++;stop();controller?.abort();});
  translatePage();void load();
}
