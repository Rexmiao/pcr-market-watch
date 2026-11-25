import {getLanguage, setLanguage} from './i18n.js';

// Translate text nodes so links, data tables and their saved dates stay intact.
const english = {
  'PCR 观察台':'PCR Dashboard', '期权异动':'Options activity', '市场解读':'Market brief', '图表目录':'Chart library',
  '图表目录 · PCR 观察台':'Chart library · PCR Dashboard',
  '市场解读 · PCR 观察台':'Market brief · PCR Dashboard',
  '2026-11-23 市场解读历史快照':'Saved Nov 23, 2026 market brief',
  '保存 11 月 23 日盘中报价、延迟 PCR 与当时可得的空头报告；固定历史记录，不代表当前行情。':'Saved Nov 23 intraday quotes, delayed PCR and the short-interest reports available then. This fixed historical record does not represent current conditions.',
  '统一入口':'All charts in one place',
  '最新版用于日常跟踪，历史快照用于回看当时的数据。':'Use the current dashboard for daily tracking and saved snapshots to review earlier data.',
  '最新版 · 推荐日常使用':'Current dashboard · Daily tracking',
  '美股 PCR 观察台':'US Options PCR Dashboard',
  '按已保存的关注名单查看每日、20 日和 60 日 PCR；支持日期选择与在线更新。':'Daily, 20-session and 60-session PCR for your saved watchlist, with date selection and online updates.',
  '打开观察台':'Open dashboard', '查看市场解读':'Read market brief',
  '历史图表':'Saved charts', '历史快照':'Historical snapshot',
  '保留原有交互和保存时的数据，独立于首页更新。':'Saved charts keep their original interactions, language and data dates. Dashboard refreshes do not change them.',
  '历史页面中的“当前”“最新”均指保存时点；需要新数据，请使用最新版观察台。':'“Current” and “latest” in archived pages refer to the time they were saved. Use the main dashboard for new data.',
  '三指数 PCR 与价格上下文':'Three-index PCR and price context',
  'SPY、QQQ、DIA 的 PCR 趋势与指数价格上下文，保留原有标的、区间和图表交互。':'SPY, QQQ and DIA PCR trends with index price context; original symbol, range and chart controls are preserved.',
  '关注名单 PCR 历史快照':'Saved watchlist PCR snapshot',
  '保存时关注名单的成交量 PCR、历史分位与 OI 查询快照；保留固定历史数据，不随当前名单或更新按钮改变。':'Volume PCR, historical percentiles and the OI query snapshot for the watchlist at the saved time. This fixed snapshot does not change with your current watchlist or the refresh button.',
  '固定历史数据，具体日期见页面':'Saved historical data; see each page for dates (original Chinese)',
  '查看图表':'Open chart',
  '2026-11-23 盘中市场观察 · PCR 观察台':'2026-11-23 Intraday market brief · PCR Dashboard',
  '美股盘中 · 固定时点观察':'US equities · Saved intraday observation',
  '2026-11-23 盘中市场观察':'2026-11-23 Intraday market brief',
  '反弹延续至开盘后，NVDA、MU 领涨；中期修复仍待确认。':'The rebound continued after the open, led by NVDA and MU; a medium-term recovery remained unconfirmed.',
  '美东 11/23 报价：10:45—10:46 · 盘中 PCR：10:47 查询、来源标称延迟 15 分钟 · 完整日 PCR：11/20 · 股票空头持仓：10/30':'Nov 23 ET: quotes 10:45–10:46 · Intraday PCR queried at 10:47; source states a 15-minute delay · Full-day PCR: Nov 20 · Short-interest settlement: Oct 30',
  '今天的多空怎么看':'Reading the saved market snapshot',
  '价格与成交结构：短线偏多；中期仍属修复':'Price and volume structure: short-term strength; medium-term recovery still unconfirmed',
  '七只标的均高于上周五收盘。NVDA +33.57%、MU +18.99%、QQQ +7.22%，科技方向领涨；SPY +4.89%、DIA +3.02%，广义指数 ETF 也在反弹。AVGO +2.15%，但涨幅较早前 +4.46% 收窄，个股强度并不一致。':'All seven instruments traded above the previous Friday close. NVDA (+33.57%), MU (+18.99%) and QQQ (+7.22%) led the technology rebound; SPY (+4.89%) and DIA (+3.02%) also advanced. AVGO gained 2.15%, down from an earlier 4.46%, showing uneven individual strength.',
  'NVDA：强反弹，Call 交易活跃':'NVDA: strong rebound and active call trading',
  '10:45 报价 $167.67，今日延迟成交量 PCR 约 0.35，即每 100 张 Call 对应约 35 张 Put。这说明成交结构偏向 Call，不能直接证明净买入 Call，也不能据此区分空头回补与新多头。与前一交易日的 +33.57% 是涨幅，不是开盘后又上涨 33.57%。':'At 10:45 the quoted price was $167.67. Delayed intraday volume PCR was about 0.35, or roughly 35 puts per 100 calls. This shows more call activity, but does not establish net call buying or distinguish short covering from new longs. The 33.57% gain is versus the prior close, not an additional gain since the open.',
  'AMD 与指数：看修复能否保持':'AMD and the indexes: watch whether the recovery holds',
  'AMD $457.26，高于截至 11/20 的 200 日均线 $429.79，但仍明显低于当时的 50 日线 $553.10。SPY、QQQ、DIA 仍低于各自此前 200 日线。短线反弹不等于确认中期趋势反转，需要后续价格与市场宽度确认。':'AMD at $457.26 was above its Nov 20 200-day average of $429.79, but well below its 50-day average of $553.10. SPY, QQQ and DIA remained below their prior 200-day averages. Further price action and market breadth were needed to confirm a medium-term trend reversal.',
  '均线固定按 11/20 完整收盘计算，没有把盘中价当作新的收盘。NVDA 此前 20 日 PCR 的 99.6% 历史分位也属于 11/20，与本页今日延迟 PCR 0.35 属于不同日期；不能解读为 99.6% 看空资金或反弹概率。':'Moving averages use the completed Nov 20 close, not intraday prices. NVDA’s 99.6th percentile for its 20-day PCR also refers to Nov 20, while the 0.35 delayed intraday PCR is from Nov 23. Neither number measures the share of bearish capital or a rebound probability.',
  '七只标的：开盘时段报价':'Seven instruments: opening-session quotes',
  '价格时点为美东 10:45—10:46，涨跌按再次核实的 11/20 正常收盘价计算；最后一列保留此前完整日成交量 PCR。':'Quotes are from 10:45–10:46 ET. Percentage changes use the rechecked Nov 20 regular close; the final column retains the previous completed-day volume PCR.',
  '标的 · 报价来源':'Instrument · Quote source', '盘中价（美元）':'Intraday price (USD)',
  '较 11/20 收盘':'Vs. Nov 20 close', '报价时点（美东）':'Quote time (ET)', '11/20 成交量 PCR':'Nov 20 volume PCR',
  'QQQ（NQ 参考）':'QQQ (NQ reference)', 'DIA（道指参考）':'DIA (Dow reference)',
  'QQQ 为纳指 100 ETF 参考，不是 NQ 期货期权；DIA 为道指 ETF 参考。报价是固定时点快照。':'QQQ is a Nasdaq-100 ETF reference, not NQ futures options; DIA is a Dow ETF reference. Quotes are fixed-time snapshots.',
  'OCC 完整日成交量':'OCC full-day volume',
  '在美东 10:45 再次检查后，仍截至 11/20；尚无 11/23 完整交易日数据。':'still ended on Nov 20 when checked at 10:45 ET on Nov 23; a completed Nov 23 report was not yet available at that check.',
  '今天盘中 PCR：11/23 累计成交量':'Saved intraday PCR: cumulative Nov 23 volume',
  '美东 10:47 查询 OptionCharts 的全标的、全部到期日成交量汇总。':'OptionCharts total volume across expirations was queried at 10:47 ET.',
  '来源声明免费期权数据延迟 15 分钟':'The source states that free options data is delayed by 15 minutes',
  '；页面没有精确数据时戳，因此不能当作准确截至 10:47 或 10:32 的数值。':'; the page provided no exact data timestamp, so these values cannot be assigned an exact 10:47 or 10:32 cutoff.',
  '标的 · PCR 来源':'Instrument · PCR source', 'Put 成交量（张）':'Put volume (contracts)', 'Call 成交量（张）':'Call volume (contracts)',
  '盘中 PCR':'Intraday PCR', '成交结构':'Volume mix', 'Call 明显更多':'Substantially more calls',
  'Put、Call 接近':'Similar put and call volume', 'Put 略多':'Slightly more puts', '未核实':'Unverified',
  '来源页面日期过旧，未采用':'Source date too old; excluded', 'Call 较多':'More calls',
  '这是盘中累计量，不是全天最终值，也不是 OI 持仓 PCR。DIA 数据未核实，不以旧日期数据替代。':'These are cumulative intraday volumes, not final full-day totals or open-interest PCR. DIA is unverified; older data is not substituted.',
  'PCR＝Put 成交量 ÷ Call 成交量。NVDA、MU 的 Call 成交明显更多，与价格强反弹相符；SPY 和 AMD 的两侧成交接近；QQQ 的 Put 略多，仍可以同时上涨。成交量包含买卖双方，不能用 1 作统一多空分界，也不能把期权成交占比当作持仓多空比例。':'PCR = put volume divided by call volume. NVDA and MU showed considerably more call activity alongside their price rebound. SPY and AMD had similar volumes on both sides; QQQ had slightly more puts while still rising. Every trade has a buyer and seller: 1 is not a universal bullish/bearish threshold, and option volume shares are not long/short position shares.',
  '盘中数据来自第三方 OPRA 数据展示；历史曲线使用 OCC 完整日数据。两者日期、覆盖时段与统计口径可能不同；盘中值未拼接进完整日历史，也未据此重算 20/60 日 PCR。':'Intraday figures come from a third-party OPRA display; historical curves use completed-day OCC reports. Their dates, time coverage and counting methods can differ. Intraday values were not inserted into full-day history or used to recalculate 20/60-session PCR.',
  '还有多少股票空头：最近正式报告':'Outstanding short interest: reports available at this snapshot',
  '以下是已经公布的股票／ETF 空头持仓数量，不是今天盘中的实时余额。SPY、DIA 本次未取得正式记录，缺失不能当作零。':'These are published stock/ETF short-interest counts, not real-time intraday balances. Official SPY and DIA records were not obtained for this snapshot; missing values do not mean zero.',
  '标的 · 持仓来源':'Instrument · Short-interest source', '空头数量（股／份）':'Shares / units short',
  '持仓结算日':'Settlement date', '公布日':'Publication date', '未取得，不能视为零':'Unavailable; not zero',
  '没有核实同日流通股分母，因此不据此推算空头占比或多头占比。':'Same-date float denominators were not verified, so no short-float or long/short percentage is inferred.',
  '两大上市体系的正式报告 · 10/30 结算、11/10 公布':'Reports from two listing groups · Oct 30 settlement, Nov 10 publication',
  '合计约 461.7 亿股／份空头':'About 46.17 billion shares / units short in total',
  'Nasdaq 上市证券':'Nasdaq-listed securities', '约 229.0 亿股；':'reported about 22.90 billion shares;',
  'NYSE Group 上市证券':'NYSE Group-listed securities',
  '约 232.7 亿股／份。两者相加为 46,166,136,018 股／份，约 461.7 亿。':'reported about 23.27 billion shares / units. The combined count was 46,166,136,018.',
  '范围包含各自上市的股票、ETF 等证券，不等于全部美国市场，也不是空头资金金额、空头人数或实时余额。不同证券的股数／份数相加，不能当成统一的市场看空比例。':'The scope includes stocks, ETFs and other securities listed by each group. It is not the entire US market, a dollar value, a number of short sellers or a real-time balance. Adding counts across securities does not produce a market-wide bearish percentage.',
  '截至本次盘中检查，11/13 一期尚未正式公布。':'At the time of this saved intraday check, the Nov 13 settlement report had not yet been published.',
  'FINRA 官方日程':'The official FINRA schedule',
  '列明：11/13 结算 → 11/17 美东 18:00 申报截止 →':'listed Nov 13 settlement, a Nov 17 18:00 ET filing deadline, and',
  '11/24 公布':'Nov 24 publication',
  '。因此今天不能把这份 10/30 报告说成最新实时空头。':'. The Oct 30 report should therefore not be described as a current real-time short balance.',
  '来源与口径':'Sources and definitions',
  '报价和空头表链接对应 Nasdaq 官方来源；今日盘中 PCR 表链接对应 OptionCharts 原始展示页。当前 Nasdaq 报价的涨跌字段与独立重查的 11/20 历史收盘价相符；早上盘前曾有冲突的另一收盘字段未用作基准。':'Quote and short-interest links point to Nasdaq sources; intraday PCR links point to the original OptionCharts pages. The quoted changes agreed with independently rechecked Nov 20 historical closing prices. An inconsistent premarket closing-price field was not used as the baseline.',
  '展开逐只收盘历史与空头来源':'Show closing-price and short-interest sources',
  'NVDA 收盘历史':'NVDA closing prices', 'MU 收盘历史':'MU closing prices', 'SPY 收盘历史':'SPY closing prices',
  'QQQ 收盘历史':'QQQ closing prices', 'DIA 收盘历史':'DIA closing prices', 'AVGO 收盘历史':'AVGO closing prices', 'AMD 收盘历史':'AMD closing prices',
  'NVDA 空头来源':'NVDA short interest', 'MU 空头来源':'MU short interest', 'SPY 空头来源':'SPY short interest',
  'QQQ 空头来源':'QQQ short interest', 'DIA 空头来源':'DIA short interest', 'AVGO 空头来源':'AVGO short interest', 'AMD 空头来源':'AMD short interest',
  '本页是 2026-11-23 的固定盘中快照，报价为 10:45—10:46，盘中 PCR 于 10:47 查询，不持续推送行情。首页“更新数据”目前只检查 OCC 完整日成交量，不会自动刷新本页报价、第三方盘中 PCR、OI 或正式股票空头报告。':'This page preserves a fixed Nov 23, 2026 intraday snapshot: quotes at 10:45–10:46 and intraday PCR queried at 10:47. It does not stream prices. Refreshing the main dashboard checks completed-day OCC volume; it does not refresh this page’s quotes, third-party intraday PCR, OI or official short-interest reports.',
  '返回 PCR 观察台':'Back to PCR Dashboard', '查看全部图表':'Browse all charts',
  '· 所有时间以美东和各项数据日期为准':'· Times are Eastern; refer to each dataset’s date',
};

const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
const nodes = [];
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (node.parentElement?.closest('script,style,[data-skip-i18n]')) continue;
  const original = node.nodeValue;
  const translated = english[original.trim()];
  if (translated) nodes.push({node, original, translated:original.replace(original.trim(), translated)});
}
const toggle = document.getElementById('page-language');
if (toggle) { toggle.className = 'button secondary language-toggle'; toggle.style.marginLeft = 'auto'; }
function render() {
  const en = getLanguage() === 'en';
  document.documentElement.lang = en ? 'en' : 'zh-CN';
  document.querySelector('.site-nav')?.setAttribute('aria-label', en ? 'Site navigation' : '网站导航');
  for (const {node, original, translated} of nodes) node.nodeValue = en ? translated : original;
  if (toggle) { toggle.textContent = en ? '中文' : 'English'; toggle.setAttribute('aria-label', en ? 'Switch to Chinese' : '切换到英文'); }
}
toggle?.addEventListener('click', () => setLanguage(getLanguage() === 'en' ? 'zh' : 'en'));
window.addEventListener('pcr-language-change', render);
render();
