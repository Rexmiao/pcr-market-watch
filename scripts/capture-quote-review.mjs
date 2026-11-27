// Local, read-only quote review. No accounts, orders, or Worker routes.
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const ORIGIN='https://webapi.moomoo.com';
const ALLOWED_PATHS=new Set(['/api/v1.0/quote/snapshot','/api/v1.0/quote/stock-quote']);
const instant=value=>typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const unique=values=>new Set(values).size===values.length;
const round=value=>Math.round((value+Number.EPSILON)*10000)/10000;
export function marketDate(ms,timeZone){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function contractParts(code){
  const match=/^US\.([A-Z][A-Z0-9]{0,9}?)(\d{6})([CP])(\d{4,9})$/.exec(code??'');
  if(!match)return null;
  const expiry=`20${match[2].slice(0,2)}-${match[2].slice(2,4)}-${match[2].slice(4)}`;
  const date=new Date(expiry+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==expiry)return null;
  return {underlying:'US.'+match[1],expiry,type:match[3],strike:Number(match[4])/1000};
}
export function validateReviewConfig(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('INVALID_CONFIG');
  const allowed=['jobId','scheduledAt','cutoffAt','timeZone','outputDirectory','underlyings','contracts','spreads'];
  if(Object.keys(config).some(key=>!allowed.includes(key)))throw Error('UNKNOWN_CONFIG_FIELD');
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(config.jobId??''))throw Error('INVALID_JOB_ID');
  if(!instant(config.scheduledAt)||!instant(config.cutoffAt)||Date.parse(config.cutoffAt)<=Date.parse(config.scheduledAt)||Date.parse(config.cutoffAt)-Date.parse(config.scheduledAt)>86400000)throw Error('INVALID_SCHEDULE');
  try{new Intl.DateTimeFormat('en-US',{timeZone:config.timeZone}).format();}catch{throw Error('INVALID_TIME_ZONE');}
  if(config.timeZone!=='America/New_York')throw Error('UNSUPPORTED_MARKET_TIME_ZONE');
  if(typeof config.outputDirectory!=='string'||!isAbsolute(config.outputDirectory))throw Error('ABSOLUTE_PRIVATE_OUTPUT_REQUIRED');
  for(const [field,max] of [['underlyings',8],['contracts',24],['spreads',8]]){
    if(!Array.isArray(config[field])||config[field].length<1||config[field].length>max)throw Error('INVALID_'+field.toUpperCase());
  }
  for(const row of [...config.underlyings,...config.contracts,...config.spreads]){
    if(typeof row.label!=='string'||row.label.length<1||row.label.length>120)throw Error('INVALID_LABEL');
  }
  if(config.underlyings.some(row=>!/^US\.[A-Z][A-Z0-9.-]{0,12}$/.test(row.code??''))||!unique(config.underlyings.map(row=>row.code)))throw Error('INVALID_UNDERLYINGS');
  if(config.contracts.some(row=>!contractParts(row.code))||!unique(config.contracts.map(row=>row.code)))throw Error('INVALID_CONTRACTS');
  if(config.contracts.some(row=>!config.underlyings.some(underlying=>underlying.code===contractParts(row.code).underlying)))throw Error('UNLISTED_CONTRACT_UNDERLYING');
  const contractCodes=new Set(config.contracts.map(row=>row.code));
  for(const spread of config.spreads){
    const long=contractParts(spread.longCode),short=contractParts(spread.shortCode);
    if(!contractCodes.has(spread.longCode)||!contractCodes.has(spread.shortCode)||!long||!short||long.type!=='P'||short.type!=='P'||long.underlying!==short.underlying||long.expiry!==short.expiry||long.strike<=short.strike)throw Error('INVALID_BEAR_PUT_SPREAD');
  }
  return config;
}
export function normalizeReviewQuote(row,definition,{now,expectedDate,timeZone}){
  const parsed=contractParts(definition.code),extra=row?.option_ex_data??{};
  const rawTime=number(row?.update_time??row?.data_time);
  const at=rawTime!==null&&rawTime>=0&&rawTime<=8640000000000000?rawTime:null;
  const bid=number(row?.bid_price),ask=number(row?.ask_price),last=number(row?.last_price);
  const age=at===null?null:Math.round((now-at)/1000);
  const issues=[];
  if(!row)issues.push('missing_quote');
  if(at===null)issues.push('timestamp_not_disclosed');
  else if(age>300)issues.push('reported_timestamp_older_than_5_minutes');
  else if(age < -30)issues.push('provider_timestamp_in_future');
  if(row?.data_date!==expectedDate)issues.push('different_or_missing_trading_date');
  if(bid===null||ask===null||bid<0||ask<=0)issues.push('bid_ask_unavailable');
  else if(bid>ask)issues.push('crossed_bid_ask');
  else if(bid===0)issues.push('zero_bid');
  const size=number(row?.option_contract_size??extra.contract_size);
  if(parsed&&(size===null||size<=0))issues.push('contract_size_not_disclosed');
  return {code:definition.code,label:definition.label,lastPrice:last,bid,ask,providerAsOf:at===null?null:new Date(at).toISOString(),providerTradingDate:typeof row?.data_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.data_date)?row.data_date:null,reportedAgeSeconds:age,bidAskAsOf:null,bidAskTimeBasis:'Independent bid/ask timestamps not disclosed by this response; providerAsOf is the snapshot timestamp.',feedDelayStatus:'not_independently_verified',contractSize:parsed?size:null,expiry:parsed?.expiry??null,strike:parsed?.strike??null,type:parsed?.type??null,volume:number(row?.volume),openInterest:number(row?.open_interest??extra.open_interest),delta:number(row?.delta??extra.delta),gamma:number(row?.gamma??extra.gamma),theta:number(row?.theta??extra.theta),vega:number(row?.vega??extra.vega),issues};
}
export function calculateReviewSpread(definition,quotes){
  const long=quotes.find(row=>row.code===definition.longCode),short=quotes.find(row=>row.code===definition.shortCode);
  const parts=contractParts(definition.longCode),shortParts=contractParts(definition.shortCode);
  const result={...definition,expiry:parts.expiry,width:parts.strike-shortParts.strike,longProviderAsOf:long?.providerAsOf??null,shortProviderAsOf:short?.providerAsOf??null,issues:[...(long?.issues??['missing_long_quote']).map(issue=>'long:'+issue),...(short?.issues??['missing_short_quote']).map(issue=>'short:'+issue)],entryNaturalDebit:null,exitNaturalCredit:null,indicativeMid:null,contractSize:null,maxLossAtEntry:null,maxProfitAtExpiry:null,breakEvenAtExpiry:null};
  if(long?.providerAsOf!==short?.providerAsOf)result.issues.push('leg_timestamps_differ');
  const hasPrices=[long?.bid,long?.ask,short?.bid,short?.ask].every(value=>typeof value==='number'&&Number.isFinite(value));
  if(!hasPrices||long.bid<0||short.bid<0||long.ask<=0||short.ask<=0||long.bid>long.ask||short.bid>short.ask)return result;
  const debit=round(long.ask-short.bid),credit=round(long.bid-short.ask);
  if(debit<=0||debit>result.width||credit>debit){result.issues.push('invalid_spread_price');return result;}
  result.entryNaturalDebit=debit;result.exitNaturalCredit=credit;result.indicativeMid=round((debit+credit)/2);
  if(long.contractSize!==short.contractSize||!long.contractSize){result.issues.push('contract_sizes_missing_or_differ');return result;}
  result.contractSize=long.contractSize;
  result.maxLossAtEntry=round(debit*result.contractSize);
  result.maxProfitAtExpiry=round((result.width-debit)*result.contractSize);
  result.breakEvenAtExpiry=round(parts.strike-debit);
  return result;
}
export async function collectQuoteReview(config,{now=()=>Date.now(),captureNow=false,requestQuote}={}){
  validateReviewConfig(config);
  const started=now(),scheduled=Date.parse(config.scheduledAt),cutoff=Date.parse(config.cutoffAt);
  const report={jobId:config.jobId,mode:captureNow?'manual':'scheduled',scheduledAt:config.scheduledAt,cutoffAt:config.cutoffAt,timeZone:config.timeZone,actualStartedAt:new Date(started).toISOString(),completedAt:null,lateBySeconds:Math.max(0,Math.round((started-scheduled)/1000)),status:'not_due',quotes:[],regularSessionQuotes:[],spreads:[],errors:[],notes:['Read-only quote capture. No orders, account data, automated position sizing or AI analysis.','Last is the most recent reported trade, not a guaranteed executable price.','Bid/ask times, size and feed delay are not independently verified. Indicative spread prices do not guarantee a combo fill.']};
  if(!captureNow&&started<scheduled){report.completedAt=new Date(now()).toISOString();return report;}
  if(!captureNow&&started>cutoff){report.status='missed';report.completedAt=new Date(now()).toISOString();return report;}
  const definitions=[...config.underlyings,...config.contracts],expectedDate=marketDate(captureNow?started:scheduled,config.timeZone);
  const jobs=[{key:'snapshot',path:'/api/v1.0/quote/snapshot',body:{code_list:definitions.map(row=>row.code)}},{key:'stock',path:'/api/v1.0/quote/stock-quote',body:{code_list:config.underlyings.map(row=>row.code)}}];
  const results=await Promise.all(jobs.map(async job=>{
    try{
      const response=await requestQuote(job.path,job.body);
      if(response?.ret_code!==0){report.errors.push({endpoint:job.key,code:'PROVIDER_ERROR',providerCode:Number.isFinite(response?.ret_code)?response.ret_code:null});return null;}
      return response.data;
    }catch(error){const allowed=new Set(['AUTH_REQUIRED','NOT_CONFIGURED','CREDENTIALS_UNAVAILABLE','TIMEOUT','NO_PERMISSION']);report.errors.push({endpoint:job.key,code:allowed.has(error.code)?error.code:'QUOTE_UNAVAILABLE'});return null;}
  }));
  const lists=results.map((data,index)=>{
    if(!data)return [];
    const list=data[index===0?'snapshot_list':'quote_list'];
    if(!Array.isArray(list)){report.errors.push({endpoint:jobs[index].key,code:'INVALID_RESPONSE'});return [];}
    return list.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.code==='string');
  });
  const [snapshot,stocks]=lists;
  const observed=now();
  report.quotes=definitions.map(definition=>{
    const snapshotRow=snapshot.find(row=>row.code===definition.code),stockRow=stocks.find(row=>row.code===definition.code);
    return {...normalizeReviewQuote(snapshotRow??stockRow,definition,{now:observed,expectedDate,timeZone:config.timeZone}),sourceEndpoint:snapshotRow?'snapshot':stockRow?'stock-quote':null};
  });
  report.regularSessionQuotes=config.underlyings.map(definition=>{
    const row=stocks.find(item=>item.code===definition.code);
    const normalized=normalizeReviewQuote(row,definition,{now:observed,expectedDate,timeZone:config.timeZone});
    return {code:definition.code,lastPrice:normalized.lastPrice,previousClose:number(row?.prev_close_price),open:number(row?.open_price),high:number(row?.high_price),low:number(row?.low_price),providerAsOf:normalized.providerAsOf,providerTradingDate:normalized.providerTradingDate,issues:normalized.issues.filter(issue=>!['bid_ask_unavailable','zero_bid','crossed_bid_ask'].includes(issue))};
  });
  report.spreads=config.spreads.map(definition=>calculateReviewSpread(definition,report.quotes));
  const received=report.quotes.filter(row=>!row.issues.includes('missing_quote')).length;
  report.status=received===0?'unavailable':received<definitions.length||report.errors.length||report.quotes.some(row=>row.issues.length)||report.regularSessionQuotes.some(row=>row.issues.length)||report.spreads.some(row=>row.entryNaturalDebit===null)?'partial':'success';
  report.completedAt=new Date(now()).toISOString();return report;
}
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=value=>typeof value==='number'?value.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
export function renderQuoteReview(report){
  const et=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:report.timeZone,dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date(value))+' ET':'未披露';
  const states={success:'报价已取得，回来人工复核',partial:'报价存在缺失或时间警示，请人工复核',unavailable:'行情未取得，请回来人工复核',missed:'已错过抓取窗口，未补造报价',not_due:'尚未到预定时间'};
  const quoteRows=report.quotes.map(q=>`<tr><td><strong>${escape(q.label)}</strong><small>${escape(q.code)} · ${escape(q.sourceEndpoint)}</small></td><td>${format(q.lastPrice)}</td><td>${format(q.bid)}</td><td>${format(q.ask)}</td><td>${escape(et(q.providerAsOf))}<small>交易日 ${escape(q.providerTradingDate)}</small></td><td>${q.issues.length?escape(q.issues.join('；')):'源报告时间在 5 分钟内；延迟状态未核验'}</td></tr>`).join('');
  const stockRows=report.regularSessionQuotes.map(q=>`<tr><td>${escape(q.code)}</td><td>${format(q.lastPrice)}</td><td>${format(q.previousClose)}</td><td>${q.lastPrice!==null&&q.previousClose>0?format((q.lastPrice/q.previousClose-1)*100)+'%':'—'}</td><td>${format(q.low)} / ${format(q.high)}</td><td>${escape(et(q.providerAsOf))}<small>${escape(q.issues.join('；'))}</small></td></tr>`).join('');
  const spreadRows=report.spreads.map(s=>`<tr><td><strong>${escape(s.label)}</strong><small>买入 ${escape(s.longCode)}<br>卖出 ${escape(s.shortCode)}</small></td><td>${format(s.entryNaturalDebit)}</td><td>${format(s.indicativeMid)}</td><td>${format(s.exitNaturalCredit)}</td><td>$${format(s.maxLossAtEntry)}</td><td>$${format(s.maxProfitAtExpiry)}</td><td>${format(s.breakEvenAtExpiry)}</td></tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PCR 报价复核提醒</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f4f6fa;color:#203451;max-width:1300px;margin:32px auto;padding:0 20px}section{background:white;border:1px solid #d9e1ee;border-radius:12px;padding:24px;margin:20px 0}h1{font-size:28px}h2{font-size:20px}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #e4eaf3;vertical-align:top}small{display:block;color:#64748b;overflow-wrap:anywhere}p{max-width:1000px}.scroll{overflow-x:auto}.notice{border-left:4px solid #c38a35;padding-left:16px}a{color:#245c9f}</style><h1>PCR 报价复核提醒</h1><p class="notice"><strong>${escape(states[report.status]??report.status)}</strong><br>${report.mode==='manual'?'这是手动测试抓取，不是预定时点的报价。':'这是一次性定时抓取；实际运行时间如下。'}</p><section><p>预定：${escape(et(report.scheduledAt))}<br>实际开始：${escape(et(report.actualStartedAt))}<br>实际完成：${escape(et(report.completedAt))}<br>状态：${escape(report.status)} · 模式：${escape(report.mode)} · 迟到：${format(report.lateBySeconds)} 秒</p><p>请回到 Codex 的原聊天，发送“复核报价”，并说明仓位有无变化。此任务只保存报价、提醒复核；不会自动分析或下单。</p><a href="snapshot.json">查看这次数值摘要</a></section><section><h2>股票：常规时段行情口径</h2><div class="scroll"><table><thead><tr><th>标的</th><th>源报告最近价</th><th>前收盘</th><th>涨跌幅</th><th>日内低 / 高</th><th>该行情源时间</th></tr></thead><tbody>${stockRows}</tbody></table></div><p>本表独立来自 stock-quote，不把快照中的盘口与常规时段成交价混为同一时点。</p></section><section><h2>股票与期权：供应商快照</h2><div class="scroll"><table><thead><tr><th>标的／合约</th><th>Last</th><th>Bid</th><th>Ask</th><th>供应商快照时间</th><th>时间／数据警示</th></tr></thead><tbody>${quoteRows}</tbody></table></div><p>Last 是源返回的最近成交价，可能滞后；不是保证可成交价。快照时间不等于单独的盘口时间，接口没有披露各个 Bid／Ask 的独立时间与可成交数量。没有用本次请求时间冒充行情时间。</p></section><section><h2>远月熊市 Put 价差：每一组的指示估值</h2><div class="scroll"><table><thead><tr><th>组合</th><th>新开净支出<br>长腿 Ask − 短腿 Bid</th><th>指示中间价</th><th>平仓净收入<br>长腿 Bid − 短腿 Ask</th><th>最大净支出</th><th>到期最大净利润</th><th>到期回本价</th></tr></thead><tbody>${spreadRows}</tbody></table></div><p>前三个价格按每股报价，整组金额按供应商披露的合约股数换算；不含费用、滑点。双腿可能来自不同时间，组合中间价和自然报价都不是保证成交价，也不是自动推荐的限价。缺报价或异常价差留空；旧报价仍需重新核对。</p>${report.spreads.map(s=>`<small>${escape(s.label)}：长腿 ${escape(et(s.longProviderAsOf))}；短腿 ${escape(et(s.shortProviderAsOf))}；${escape(s.issues.join('；')||'无额外提示')}</small>`).join('')}</section>${report.errors.length?`<section><h2>获取错误</h2><pre>${escape(JSON.stringify(report.errors,null,2))}</pre></section>`:''}<p>数据来自已授权的 moomoo 只读行情接口。抓取文件保留在本机私有目录，不发布到 GitHub。</p></html>`;
}
export async function saveQuoteReview(config,report){
  const stamp=report.actualStartedAt.replace(/[:.]/g,'-'),directory=join(config.outputDirectory,'runs',stamp);
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'snapshot.json'),JSON.stringify(report,null,2),'utf8');
  await writeFile(join(directory,'index.html'),renderQuoteReview(report),'utf8');
  // latest.html is a pointer, not a copy: its JSON link resolves in the run directory.
  const destination='runs/'+stamp+'/index.html';
  const pointer=`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${destination}"><a href="${destination}">打开最近一次报价复核报告</a>`;
  const temporary=join(config.outputDirectory,'latest.html.tmp');
  await writeFile(temporary,pointer,'utf8');await rename(temporary,join(config.outputDirectory,'latest.html'));
  return {directory,reportPath:join(directory,'index.html')};
}
export function createQuoteReviewRequester(provider,{fetcher=fetch}={}){
  return async function request(path,body){
    if(!ALLOWED_PATHS.has(path))throw Object.assign(Error('BLOCKED'),{code:'NO_PERMISSION'});
    for(let attempt=0;attempt<2;attempt++){
      const token=await provider.getAccessToken({forceRefresh:attempt===1});
      const response=await fetcher(ORIGIN+path,{method:'POST',headers:{accept:'application/json','content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
      if(response.status===401&&attempt===0)continue;
      if(!response.ok)throw Object.assign(Error('QUOTE_UNAVAILABLE'),{code:response.status===401?'AUTH_REQUIRED':'QUOTE_UNAVAILABLE'});
      if(Number(response.headers.get('content-length')||0)>2097152)throw Error('RESPONSE_TOO_LARGE');
      const text=await response.text();if(text.length>2097152)throw Error('RESPONSE_TOO_LARGE');return JSON.parse(text);
    }
  };
}
async function main(args){
  const flags=new Set(['--dry-run','--capture-now','--notify']);let configPath;const options=new Set();
  for(let i=0;i<args.length;i++){if(args[i]==='--config'){configPath=args[++i];}else if(flags.has(args[i]))options.add(args[i]);else throw Error('INVALID_ARGUMENT');}
  if(!configPath||!isAbsolute(configPath))throw Error('ABSOLUTE_CONFIG_REQUIRED');
  const config=validateReviewConfig(JSON.parse(await readFile(configPath,'utf8')));
  if(options.has('--dry-run')){console.log(JSON.stringify({mode:'dry-run',jobId:config.jobId,scheduledAt:config.scheduledAt,cutoffAt:config.cutoffAt,timeZone:config.timeZone,quoteCount:config.underlyings.length+config.contracts.length,spreadCount:config.spreads.length,credentialsRead:false,networkRequests:0,notification:false}));return;}
  let requester;
  const report=await collectQuoteReview(config,{captureNow:options.has('--capture-now'),requestQuote:async(path,body)=>{
    if(!requester){const {createLocalMoomooWebApiTokenProvider}=await import('./moomoo-webapi-auth.mjs');requester=createQuoteReviewRequester(createLocalMoomooWebApiTokenProvider());}
    return requester(path,body);
  }});
  if(report.status==='not_due'){console.log(JSON.stringify({status:report.status,scheduledAt:report.scheduledAt,networkRequests:0}));return;}
  const saved=await saveQuoteReview(config,report);
  if(options.has('--notify')&&process.platform==='win32'){
    notifyQuoteReview(saved.reportPath,report.status);
  }
  console.log(JSON.stringify({status:report.status,mode:report.mode,actualStartedAt:report.actualStartedAt,quoteCount:report.quotes.length,reportPath:saved.reportPath}));
}
function notifyQuoteReview(reportPath,status){
  const executable=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',fileURLToPath(new URL('./show-quote-review-reminder.ps1',import.meta.url)),'-Status',status];
  if(reportPath)args.push('-ReportPath',reportPath);
  const child=spawn(executable,args,{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(()=>{
    if(process.argv.includes('--notify')&&!process.argv.includes('--dry-run')&&process.platform==='win32')notifyQuoteReview(null,'unavailable');
    console.error('Quote review could not start or save. Check the private configuration and output directory.');process.exitCode=1;
  });
}
