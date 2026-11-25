import {mountMarketPcrPanel} from './market-pcr-panel.js';

const text={
  zh:{
    title:'Cboe · 整体市场 PCR',subtitle:'官方完整日成交量统计，分别观察指数、全部产品和 ETF／ETP。',date:'Cboe 交易日期',latest:'最新已发布日',refresh:'检查 Cboe 数据',loading:'正在查询 Cboe 官方统计…',
    index:'指数期权 · INDEX',total:'全部产品 · TOTAL',etp:'交易所交易产品 · ETF／ETP',indexDetail:'指数期权汇总，不是 SPY 或 QQQ 的 PCR。',totalDetail:'Cboe 所列全部期权产品的汇总。',etpDetail:'Cboe 所列交易所交易产品期权的汇总，覆盖多只 ETF／ETP。',
    scope:'PCR＝Put 成交量 ÷ Call 成交量。三个口径是 Cboe 公布范围的统计，不是全美所有交易所的多空持仓比例。',empty:'Cboe 尚无该日统计（可能休市或尚未发布）。上方单日卡留空，没有拿其他日期代替。',failure:'暂时无法读取 Cboe，保留最后核实的数据；请以标注的数据日期为准。',noSource:'暂时无法读取或核实该日的 Cboe 数据，请稍后重试。',
    source:'查看 Cboe 官方来源',published:'单日卡数据日期',selected:'所选日期',checked:'上次检查',put:'Put 成交量',call:'Call 成交量',missing:'未取得',pending:'完整日统计需要等待源发布；日历日期可以晚于数据日期。',
    trendTitle:'Cboe 历史 · 单日与 20／60 日趋势',metric:'统计口径',range:'历史区间',halfYear:'近半年 · 126 个交易日',oneYear:'近一年 · 252 个交易日',all:'全部已保存记录',daily:'单日 PCR',p20:'20 日成交量 PCR',p60:'60 日成交量 PCR',
    historyAnchor:'{metric} · 历史最后完整记录 {date}',historyThrough:'所选日期 {requested}；历史曲线截至此前已发布日 {actual}，并未当作所选日的数值。',historyExact:'历史曲线截至所选交易日 {date}。',historyLoading:'正在读取历史记录，保留已有曲线。',historyFailure:'历史数据检查失败，保留最后可用的已发布记录。',historyEmpty:'所选日期之前没有已保存的历史记录。可检查数据以补取缺口，未取得的窗口保持留空。',
    methodology:'20／60 日 PCR＝窗口内合计 Put 成交量 ÷ 合计 Call 成交量，不是每天 PCR 的算术平均。窗口中缺少任何所需交易日时留空；橘色为 60 日，蓝色为 20 日，浅蓝为单日。',
    partial:'本次已检查 {count} 个交易日，新增 {added} 日；仍有 {gaps} 个缺口。再次检查可继续补取，每次最多 15 日。',partialUnknown:'本次分批补取已完成；未取得的交易日及滚动窗口仍留空。',coverage:'当前保存的历史：{start}—{end}。',cooldown:'检查较频繁，请在 {seconds} 秒后重试。',
  },
  en:{
    title:'Cboe · Market-wide PCR',subtitle:'Official full-day volume statistics for index options, all products, and ETFs/ETPs.',date:'Cboe activity date',latest:'Latest published day',refresh:'Check Cboe data',loading:'Checking official Cboe statistics…',
    index:'Index options · INDEX',total:'All products · TOTAL',etp:'Exchange-traded products · ETF/ETP',indexDetail:'An index-option aggregate, separate from SPY or QQQ PCR.',totalDetail:'All option products in Cboe’s published scope.',etpDetail:'Cboe’s exchange-traded product option aggregate, covering multiple ETFs/ETPs.',
    scope:'PCR = put volume ÷ call volume. These are distinct aggregates in Cboe’s published scope, not a U.S.-wide ratio of short and long positions.',empty:'Cboe has no published statistics for this date (a market holiday or not yet published). The daily cards stay blank; another date is not substituted.',failure:'Cboe is temporarily unavailable. Previously verified data is retained; check its activity date.',noSource:'Data for this date could not be retrieved or verified. Please retry later.',
    source:'View the official Cboe source',published:'Daily-card activity date',selected:'Selected date',checked:'Last checked',put:'Put volume',call:'Call volume',missing:'Unavailable',pending:'The calendar date can be later than the activity date while the source prepares its full-day report.',
    trendTitle:'Cboe history · Daily and 20/60-session trends',metric:'Measure',range:'History range',halfYear:'6 months · 126 sessions',oneYear:'1 year · 252 sessions',all:'All saved records',daily:'Daily PCR',p20:'20-session volume PCR',p60:'60-session volume PCR',
    historyAnchor:'{metric} · Last complete historical observation: {date}',historyThrough:'Selected date: {requested}. History ends on the previous published day, {actual}; its values are not presented as the selected day.',historyExact:'History ends on the selected session, {date}.',historyLoading:'Loading history; existing curves remain visible.',historyFailure:'History could not be refreshed. The last available published records are retained.',historyEmpty:'No saved history precedes the selected date. Check data to fill available gaps; missing windows remain blank.',
    methodology:'20/60-session PCR = total put volume ÷ total call volume in the window, not the arithmetic mean of daily ratios. A window stays blank when a required session is missing. Orange: 60 sessions; blue: 20; light blue: daily.',
    partial:'Checked {count} sessions and added {added}; {gaps} gaps remain. Check again to continue, up to 15 sessions per request.',partialUnknown:'This backfill batch is complete. Unavailable sessions and rolling windows remain blank.',coverage:'Saved history: {start}—{end}.',cooldown:'Checks are too frequent. Retry in {seconds} seconds.',
  },
};


Object.assign(text.zh,{
  title:'市场 PCR · 分类与指数参考',subtitle:'四类 Cboe 汇总与三大指数的 ETF 期权参考，分别标注来源和数据日期。',date:'交易日期',refresh:'检查当前数据源',
  total:'期权合计 · TOTAL',equity:'个股期权 · EQUITY',equityDetail:'Cboe 范围内个股期权的成交量 PCR。',equityDerived:'此值由 TOTAL 减去 INDEX 和 ETF／ETP 的 Put、Call 张数分别推算后相除，不是 PCR 相减。',
  totalDetail:'TOTAL＝INDEX＋ETF／ETP＋EQUITY：先分别合计 Put、Call 张数，再计算比率，不是三个 PCR 的平均。',
  scope:'上方四卡为 Cboe 公布范围的分类成交量统计，不代表全美所有交易所或多空持仓比例。下方三大指数参考来自 OCC 的 SPY／QQQ／DIA ETF 期权，口径独立。',
  trendTitle:'市场历史 · 单日与 20／60 日趋势',macroGroup:'Cboe 分类汇总',referenceGroup:'三大指数 · ETF 期权参考',
  spy:'标普 500 · SPY ETF PCR',qqq:'纳指 100 · QQQ ETF PCR',dia:'道指 · DIA ETF PCR',
  occSource:'查看 OCC 官方来源',cboeSource:'查看 Cboe 官方来源',sourceThrough:'{source} · 数据截至 {date} · 上次检查 {checked}',
  proxyNote:'SPY／QQQ／DIA 分别作为标普 500、纳指 100、道指的 ETF 期权参考，不是 SPX／NDX／DJX 直接指数期权 PCR。',
  referenceLoading:'正在检查 OCC 的指数 ETF 期权数据，保留已取得的历史记录。',referenceFailure:'OCC 数据暂时不可用，保留最后可用的 ETF 记录；没有使用 Cboe 的日期或数值替代。',
});
Object.assign(text.en,{
  title:'Market PCR · Categories and index references',subtitle:'Four Cboe aggregates and ETF-option references for the three major indexes, with separate sources and activity dates.',date:'Activity date',refresh:'Check selected source',
  total:'Options total · TOTAL',equity:'Single-stock options · EQUITY',equityDetail:'Single-stock option volume PCR within Cboe’s scope.',equityDerived:'Derived by subtracting INDEX and ETF/ETP put and call counts from TOTAL separately, then dividing. PCRs are not subtracted.',
  totalDetail:'TOTAL = INDEX + ETF/ETP + EQUITY: add the put and call counts separately, then divide. It is not the average of their PCRs.',
  scope:'The four cards show category volumes in Cboe’s published scope, not all U.S. exchanges or a long/short-position ratio. SPY/QQQ/DIA references below use separate OCC ETF-option data.',
  trendTitle:'Market history · Daily and 20/60-session trends',macroGroup:'Cboe category aggregates',referenceGroup:'Three major indexes · ETF-option references',
  spy:'S&P 500 · SPY ETF PCR',qqq:'Nasdaq-100 · QQQ ETF PCR',dia:'Dow · DIA ETF PCR',
  occSource:'View the official OCC source',cboeSource:'View the official Cboe source',sourceThrough:'{source} · Activity through {date} · last checked {checked}',
  proxyNote:'SPY, QQQ and DIA are ETF-option references for the S&P 500, Nasdaq-100 and Dow. They are not direct SPX, NDX or DJX index-option PCRs.',
  referenceLoading:'Checking OCC index-ETF option data; available history remains visible.',referenceFailure:'OCC is unavailable. The last good ETF records are retained; Cboe dates or values are not substituted.',
});

const root=document.getElementById('cboe-panel');
if(root)mountMarketPcrPanel(root,text);
