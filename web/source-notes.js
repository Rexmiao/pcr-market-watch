import {getLanguage} from './i18n.js';

const main=document.querySelector('main');
if(main){
  const section=document.createElement('section');section.id='data-sources';section.className='panel source-notes';section.setAttribute('aria-labelledby','data-sources-title');
  section.innerHTML='<h2 id="data-sources-title"></h2><dl id="data-source-list"></dl><p id="data-source-scope" class="metric-note"></p><details><summary id="moomoo-usage-title"></summary><p id="moomoo-usage"></p><p id="moomoo-connection" class="metric-note"></p></details>';
  main.insertBefore(section,main.querySelector('footer'));
  let provider=null;
  const sources=[
    {zh:'个股与 ETF 成交量 PCR',en:'Stock and ETF volume PCR',label:'OCC',url:'https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query',zhText:'官方完整日成交张数；本站按 Put 合计 ÷ Call 合计计算单日、20 日、60 日 PCR。SPY、QQQ、DIA 也是此来源。',enText:'Official completed-day contract volume. The site calculates daily, 20-session and 60-session PCR as total puts ÷ total calls. This includes SPY, QQQ and DIA.'},
    {zh:'Cboe 分类汇总 PCR',en:'Cboe category PCR',label:'Cboe Daily Market Statistics',url:'https://www.cboe.com/markets/us/options/market-statistics/daily',zhText:'INDEX 含 SPX、VIX 等指数期权；ETP 含 ETF、ETN；EQUITY 为单只股票期权。TOTAL 是这三类成交张数合计，不是全美国所有交易所的统计。部分 EQUITY 历史由 TOTAL−INDEX−ETP 的 Put/Call 张数恢复，并标明推导口径。',enText:'INDEX includes SPX, VIX and other index options; ETP includes ETFs and ETNs; EQUITY covers single-stock options. TOTAL combines these categories in this report, not all U.S. exchanges. Reconstructed EQUITY history subtracts INDEX and ETP put/call quantities from TOTAL and is marked as derived.'},
    {zh:'持仓量 OI PCR',en:'Open-interest PCR',label:'Cboe delayed option-chain snapshots',url:'https://www.cboe.com/delayed_quotes/',zhText:'原有独立期权链快照。查询时间不等于结算日；不随成交量刷新，缺失或没有历史快照的日期留空。',enText:'Separately saved option-chain snapshots. Retrieval time is not the settlement date. Volume refresh does not refresh OI; missing and unrecorded historical snapshots stay blank.'},
    {zh:'指数、原油、黄金行情',en:'Index, oil and gold quotes',label:'Yahoo Finance',url:'https://finance.yahoo.com/markets/',zhText:'三大指数点位；WTI 原油与 COMEX 黄金使用源所列期货合约。涨跌按源前收价计算，报价时间与检查时间分别标注，可能延迟。',enText:'Index levels plus the source-listed WTI crude and COMEX gold futures contracts. Changes use the source previous close; market time and retrieval time are separate. Quotes may be delayed.'},
  ];
  function render(){
    const en=getLanguage()==='en';document.getElementById('data-sources-title').textContent=en?'Data sources and definitions':'数据来源与统计口径';
    const list=document.getElementById('data-source-list');list.replaceChildren();
    for(const source of sources){const term=document.createElement('dt'),body=document.createElement('dd'),link=document.createElement('a');term.textContent=en?source.en:source.zh;link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.label;body.append(link,document.createTextNode(' · '+(en?source.enText:source.zhText)));list.append(term,body);}
    document.getElementById('data-source-scope').textContent=en?'PCR measures option contract activity, not shares short, investor headcounts or a forecast probability. The data date follows the source; checking today does not make an older record today’s data.':'PCR 衡量期权合约活动，不是股票空头占比、多空人数或涨跌概率。数据日以上游实际记录为准；今天检查不代表今天已有完整日数据。';
    document.getElementById('moomoo-usage-title').textContent=en?'How to use moomoo alongside PCR':'如何配合使用 moomoo 数据';
    document.getElementById('moomoo-usage').textContent=en?'Use completed-day PCR for activity trends, then examine price and daily bars for market direction. Inspect contract-level volume, open interest and volatility only when the API and your entitlements provide them. A static option chain is not a complete PCR feed, and puts alone do not identify bearish opening purchases.':'用完整日 PCR 观察交易结构变化，再结合价格、日 K 线判断趋势。若接口与行情权限提供相应字段，可进一步查看具体合约的成交量、未平仓量及波动率。静态期权链不是完整 PCR 数据流；仅凭 Put 成交不能确认是买入开仓看空。';
    document.getElementById('moomoo-connection').textContent=provider?.hostScope==='local'||provider?.configured?(en?'The local backend has moomoo credentials configured. Quotes, daily bars, expiration dates and selected option chains use its official desktop API; PCR history still uses the sources above.':'本机后端已配置 moomoo 接口，可读取行情、日 K、到期日和指定范围期权链；PCR 历史仍使用上述来源。'):(en?'The moomoo desktop adapter runs on the local backend. A cloud-to-desktop bridge is not configured; this page does not claim a live moomoo news or PCR feed.':'moomoo 桌面端适配器运行在本机后端；云端到桌面的桥接尚未配置。当前没有接通 moomoo 新闻流或完整 PCR 数据流。');
  }
  window.addEventListener('pcr-language-change',render);render();
  fetch('/api/providers/moomoo/status',{credentials:'same-origin',signal:AbortSignal.timeout(8000)}).then(response=>response.ok?response.json():null).then(value=>{provider=value;render();}).catch(()=>{});
}
