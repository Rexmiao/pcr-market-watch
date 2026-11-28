import {historyContext} from './history-context.js';
import {chartPalette} from './chart-palette.js';

const STORAGE_KEY='pcr-dashboard:history-comparison:v1';
const FIELDS=['daily','r5','r20','r60'];
const words={
  zh:{mode:'历史比较',none:'不比较',level:'历史分位',year:'往年同期',field:'对比指标',daily:'单日 PCR',r5:'5 日 PCR',r20:'20 日 PCR',r60:'60 日 PCR',metric:'指标',median:'历史中位数',percentile:'历史分位',samples:'样本数',partial:'不足 252',previous:'去年同期',difference:'当前 − 去年',original:'实际数据日期',date:'对齐日期',series:'曲线',axis:'Put / Call（倍）',levelNote:'分别与当前统计日之前最多 252 个有效历史值比较；不含当前日及未来数据。样本不足时按实际数量显示，历史分位不是涨跌概率。',yearNote:'按所选日所属年份，与上年同月同日对齐；图中非交易日或缺失数据留空，不补零。',yearTarget:'摘要目标日',yearActual:'实际比较日',missing:'无可用记录',chartCoverage:'同期曲线可比较日期',summaryNote:'摘要遇休市日，使用目标日前 7 天内最近记录；差值是 PCR 倍数差，不是百分比涨跌。'},
  en:{mode:'Historical comparison',none:'No comparison',level:'Historical percentile',year:'Prior-year period',field:'Compare series',daily:'Daily PCR',r5:'5-session PCR',r20:'20-session PCR',r60:'60-session PCR',metric:'Measure',median:'Historical median',percentile:'Percentile',samples:'Samples',partial:'Fewer than 252',previous:'Prior-year value',difference:'Current − prior year',original:'Actual data date',date:'Aligned date',series:'Series',axis:'Put / Call (ratio)',levelNote:'Each measure is compared with up to 252 valid observations before the selected data date. The current and future observations are excluded. Actual sample sizes are shown; percentiles are not return probabilities.',yearNote:'The selected calendar year is aligned with the same month and day in the prior year. Non-trading dates and missing observations remain blank, never zero.',yearTarget:'Summary target date',yearActual:'Actual comparison date',missing:'No available record',chartCoverage:'Comparable dates',summaryNote:'For the summary only, a closed-market date uses the latest record within the preceding 7 days. Differences are PCR ratio points, not percentage returns.'}
};

function node(tag,className='',value=null){const element=document.createElement(tag);if(className)element.className=className;if(value!==null)element.textContent=value;return element;}
function option(value){const element=node('option');element.value=value;return element;}
function makeTable(headers,records){
  const table=node('table','history-comparison-table'),head=node('thead'),row=node('tr'),body=node('tbody');
  for(const text of headers){const cell=node('th','',text);cell.scope='col';row.append(cell);}head.append(row);
  for(const record of records){const tr=node('tr');record.forEach((value,index)=>{const cell=node(index===0?'th':'td','',value);if(index===0)cell.scope='row';tr.append(cell);});body.append(tr);}
  table.append(head,body);return table;
}

export function createHistoryComparison({root,onChange=()=>{}}){
  if(!root)throw Error('HISTORY_COMPARISON_ROOT_REQUIRED');
  let mode='none',field='r20';
  try{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(['none','level','year'].includes(stored?.mode))mode=stored.mode;if(FIELDS.includes(stored?.field))field=stored.field;}catch{}
  const style=node('style');style.textContent='.history-comparison-controls{margin-top:14px}.history-comparison-details{margin:8px 0 18px;min-width:0}.history-comparison-details p{font-size:.875rem;margin-bottom:10px;overflow-wrap:anywhere}.history-comparison-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.875rem;color:var(--foreground,#26364e)}.history-comparison-table th,.history-comparison-table td{text-align:right;vertical-align:top;padding:10px 8px;border-bottom:1px solid var(--border,#e1e7ef);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.history-comparison-table th:first-child,.history-comparison-table td:first-child{text-align:left}.history-comparison-table th{font-weight:500}.history-comparison-table thead{color:var(--muted-foreground,#5e6d83)}@media(max-width:650px){.history-comparison-controls label{min-width:0;flex:1 1 150px}.history-comparison-table th,.history-comparison-table td{padding:9px 4px}}';root.append(style);
  const controls=node('div','controls cboe-history-controls history-comparison-controls'),modeLabel=node('label'),modeTitle=node('span'),select=node('select'),fieldLabel=node('label'),fieldTitle=node('span'),series=node('select');
  select.id='cboe-compare';series.id='cboe-compare-series';
  for(const value of ['none','level','year'])select.append(option(value));for(const value of FIELDS)series.append(option(value));
  select.value=mode;series.value=field;modeLabel.append(modeTitle,select);fieldLabel.append(fieldTitle,series);controls.append(modeLabel,fieldLabel);
  const anchor=root.querySelector('.cboe-history-controls');if(anchor)anchor.after(controls);else root.prepend(controls);
  const details=node('div','history-comparison-details');details.id='cboe-history-comparison';details.setAttribute('aria-live','polite');const chart=root.querySelector('#cboe-history-chart');if(chart)chart.before(details);else root.append(details);
  function changed(){mode=select.value;field=series.value;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({mode,field}));}catch{}onChange();}
  select.addEventListener('change',changed);series.addEventListener('change',changed);
  return {
    get mode(){return mode;},
    update({rows=[],metric=null,date=null,range='252',language='zh',config=null}={}){
      const copy=words[language==='en'?'en':'zh'],locale=language==='en'?'en-US':'zh-CN';
      const number=value=>Number.isFinite(value)?new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:3}).format(value):'—';
      const signed=value=>Number.isFinite(value)?new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:3,signDisplay:'exceptZero'}).format(value):'—';
      const percentile=value=>Number.isFinite(value)?new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(value):'—';
      modeTitle.textContent=copy.mode;fieldTitle.textContent=copy.field;
      for(const opt of select.options)opt.textContent=copy[opt.value];for(const opt of series.options)opt.textContent=copy[opt.value];
      fieldLabel.hidden=mode!=='year';details.hidden=mode==='none';details.replaceChildren();
      if(mode==='none')return config;
      const context=historyContext(rows,{metric,date,field,range});
      if(mode==='level'){
        details.append(node('p','metric-note',copy.levelNote),makeTable([copy.metric,copy.median,copy.percentile,copy.samples],FIELDS.map(key=>{
          const stats=context.stats[key];return [copy[key],number(stats.median),percentile(stats.percentile),stats.sampleCount+' / 252'+(stats.complete?'':' · '+copy.partial)];
        })));
        return config;
      }
      const annual=context.annual,previous=context.yearAgo;
      details.append(node('p','metric-note',copy.yearNote));
      const summaryDate=copy.yearTarget+': '+(previous.targetDate||'—')+' · '+copy.yearActual+': '+(previous.actualDate||copy.missing);
      details.append(node('p','metric-note',summaryDate),makeTable([copy.metric,copy.previous,copy.difference],FIELDS.map(key=>[copy[key],number(previous.fields[key].previous),signed(previous.fields[key].difference)])));
      const previousField='previous'+field[0].toUpperCase()+field.slice(1),comparable=annual.rows.filter(row=>Number.isFinite(row[field])&&Number.isFinite(row[previousField])).length;
      details.append(node('p','metric-note',copy.chartCoverage+': '+comparable+' / '+annual.rows.length+' · '+copy.summaryNote));
      if(!config)return config;
      const currentName=String(annual.year||'—')+' · '+copy[field],previousName=String(annual.previousYear||'—')+' · '+copy[field];
      const data=annual.rows.flatMap(row=>[[row.date,currentName,row[field],row.originalDate],[row.date,previousName,row[previousField],row.previousOriginalDate||'—']]);
      return {...config,title:(config.title||'')+' · '+copy.year,summary:copy.yearNote,columns:[copy.date,copy.series,'PCR',copy.original],rows:data,spec:{...config.spec,x:copy.date,y:'PCR',series:copy.series,yLabel:copy.axis,showLegend:true,colors:{[currentName]:chartPalette().r20,[previousName]:chartPalette().previous},tooltipFields:[{field:copy.original,label:copy.original}]}};
    }
  };
}
