// Presentation only. Calculations stay in the shared pure interpretation model.
const fields=['r5','r20','r60'];
const words={
  zh:{title:'5／20／60 日 PCR 解读',order:'高低顺序',orderMissing:'高低顺序：数据不足',r5:'5日 PCR',r20:'20日 PCR',r60:'60日 PCR',date:'实际数据日',previous:'对比前一交易日',unknown:'未知',up:'上升',down:'下降',flat:'持平',insufficient:'数据不足，暂不判断',continuation_up:'5日与20日连续同向上升（3次比较）',continuation_down:'5日与20日连续同向下降（3次比较）',early_alignment_up:'5日与20日同向变化，延续待确认',early_alignment_down:'5日与20日同向变化，延续待确认',short_term_up:'5日变化，20日尚未同向（待确认）',short_term_down:'5日变化，20日尚未同向（待确认）',mixed:'窗口分化',notice:'规则观察，不是买卖信号。',rule:'高低顺序只比较当日数值，不代表各线正在上升或下降。排序与升降使用未四舍五入值，显示数值可能因舍入相同。箭头＝该窗口 PCR 与确切前一美股交易日之差；差值单位为 PCR 倍数，不是百分比。变化绝对值不超过 1e-12 视为持平，仅处理浮点误差，并非统计显著性阈值。只有 5 日和 20 日在连续 3 次比较中同时同向，才标为已连续变化；这需要 4 个确切交易日的完整记录。60 日作为独立背景，不要求同向。重叠窗口不是 3 个独立信号。缺失值或缺日显示未知，不借其他日期。规则观察，不是买卖信号，也不预测涨跌或代表净多空持仓。'},
  en:{title:'5/20/60-session PCR reading',order:'Value ordering',orderMissing:'Value ordering: insufficient data',r5:'5-session PCR',r20:'20-session PCR',r60:'60-session PCR',date:'Actual activity date',previous:'Compared with prior session',unknown:'Unknown',up:'Rising',down:'Falling',flat:'Flat',insufficient:'Insufficient data to assess',continuation_up:'5/20-session PCRs rose together (3 comparisons)',continuation_down:'5/20-session PCRs fell together (3 comparisons)',early_alignment_up:'5/20-session PCRs move together; continuation unconfirmed',early_alignment_down:'5/20-session PCRs move together; continuation unconfirmed',short_term_up:'5-session change; 20-session not aligned (unconfirmed)',short_term_down:'5-session change; 20-session not aligned (unconfirmed)',mixed:'Mixed window directions',notice:'Rule-based observation, not a trading signal.',rule:'Ordering compares current values; it does not say whether a line is rising or falling. Ordering and changes use unrounded values; displayed values can match after rounding. Each arrow is that window’s PCR change from the exact previous U.S. trading session. Changes are PCR ratio points, not percent; absolute changes at or below 1e-12 are flat to handle floating-point noise, not statistical significance. A continued move requires both 5- and 20-session PCR to move in the same direction in 3 consecutive comparisons, using 4 exact sessions. The 60-session direction is separate background. Overlapping windows are not 3 independent signals. Missing values or sessions remain unknown; other dates are not substituted. This rule-based observation is not a trading signal, price forecast or measure of net long/short positions.'}
};
let tooltip=null,owner=null;
function helpNode(){
  if(tooltip)return tooltip;tooltip=document.createElement('div');tooltip.id='pcr-reading-tooltip';tooltip.className='pcr-info-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
  const reposition=()=>{if(owner&&document.activeElement===owner.button)owner.show();else{tooltip.hidden=true;owner=null;}};
  window.addEventListener('scroll',reposition,{passive:true});window.addEventListener('resize',reposition);return tooltip;
}
function helpButton(label,explanation){
  const help=helpNode(),button=document.createElement('button');button.type='button';button.className='pcr-info-trigger pcr-reading-rule';button.textContent=label;button.setAttribute('aria-describedby',help.id);
  const show=()=>{owner={button,show};help.textContent=explanation;help.hidden=false;const rect=button.getBoundingClientRect(),width=Math.min(390,innerWidth-24);help.style.width=width+'px';help.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px';help.style.top=Math.max(12,Math.min(rect.bottom+8,innerHeight-help.offsetHeight-12))+'px';};
  const hide=()=>{help.hidden=true;owner=null;};button.addEventListener('mouseenter',show);button.addEventListener('focus',show);button.addEventListener('mouseleave',()=>{if(document.activeElement!==button)hide();});button.addEventListener('blur',hide);button.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});return button;
}
function node(tag,className,text){const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;}
export function clearPcrInterpretationHelp(root){if(owner&&root?.contains(owner.button)){tooltip.hidden=true;owner=null;}}
export function renderPcrInterpretation(root,interpretation,{language='zh',source='',compact=false}={}){
  if(!root)return;const copy=words[language==='en'?'en':'zh'],reading=interpretation||{},locale=language==='en'?'en-US':'zh-CN';
  clearPcrInterpretationHelp(root);
  root.replaceChildren();root.classList.add('pcr-reading');root.classList.toggle('pcr-reading-compact',compact);root.dataset.state=reading.state||'insufficient';
  const format=value=>!Number.isFinite(value)?'—':Math.abs(value)>0&&Math.abs(value)<.0001?(value>0?'+':'−')+'<0.0001':new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:4,signDisplay:'exceptZero'}).format(value);
  if(!compact){root.append(node('h3','pcr-reading-heading',copy.title),node('p','pcr-reading-context',[source,copy.date+' '+(reading.actualDate||'—'),copy.previous+' '+(reading.previousDate||'—')].filter(Boolean).join(' · ')));}
  const order=Array.isArray(reading.ordering)?copy.order+': '+reading.ordering.map(group=>group.map(field=>copy[field]).join(' = ')).join(' > '):copy.orderMissing;
  root.append(node('p','pcr-reading-order',order));
  const directions=node('p','pcr-reading-directions');
  for(const field of fields){const detail=reading.fields?.[field]||{},direction=detail.direction||'unknown',arrow={up:'↑',down:'↓',flat:'→',unknown:'?'}[direction]||'?';const item=node('span','pcr-reading-window',copy[field]+' '+arrow+' '+format(detail.delta));item.dataset.window=field;item.dataset.direction=direction;item.setAttribute('aria-label',copy[field]+': '+copy[direction]+' '+format(detail.delta));directions.append(item);}
  root.append(directions,helpButton(copy[reading.state]||copy.insufficient,copy.rule));
  if(!compact)root.append(node('p','pcr-reading-notice',copy.notice));
}
