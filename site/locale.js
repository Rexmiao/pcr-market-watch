const translations = {
  "zh": {
    "brand": "PCR 观察台",
    "navLabel": "项目导航",
    "preview": "界面预览",
    "sources": "数据口径",
    "install": "本地运行",
    "heroTitle": "把期权成交结构<br/><em>看清楚。</em>",
    "heroCopy": "从整体市场到自己的 watchlist，观察单日、20 日与 60 日 PCR，再放回历史中比较。",
    "download": "下载安装包",
    "sourceCode": "查看源码",
    "demoCaption": "PCR 观察台 · 历史分位与往年同期切换演示",
    "demoZoom": "放大 PCR 观察台实际操作动图",
    "demoAlt": "英文实际操作动图：切换 PCR 趋势、历史分位，以及往年同期的单日、20日和60日指标。",
    "demoHint": "动态操作演示 · 点击可放大",
    "demoDate": "演示使用版本快照，最新数据日期以应用内标注为准。",
    "workflowTitle": "一个围绕 PCR 的观察流程。",
    "workflowCopy": "先了解市场背景，再检查关注标的，最后用历史水平给当前读数找参照。",
    "flow1Label": "市场背景",
    "flow1Title": "Cboe 汇总与指数 ETF",
    "flow1Copy": "区分 INDEX、TOTAL、EQUITY 与 ETF／ETP；SPY、QQQ、DIA 等参考保留各自的数据来源与日期。",
    "flow2Label": "个人关注",
    "flow2Title": "自己维护 watchlist",
    "flow2Copy": "搜索代码、回车添加、创建分组或移除标的。名单保存在本地数据库，重新打开仍可继续查看。",
    "flow3Label": "历史参照",
    "flow3Title": "让当前读数有上下文",
    "flow3Copy": "同时观察单日和滚动窗口，查看历史分位，或选择一种 PCR 与往年同期作双线对照。",
    "historyCaption": "历史比较 · 分位、样本数与同期走势",
    "historyZoom": "放大历史比较实际界面截图",
    "historyAlt": "历史比较界面，展示 PCR 历史中位数、历史分位、实际样本数及趋势图。",
    "historyFigure": "分位、同期与缺失数据都使用明确的计算规则。",
    "historyTitle": "同一个数值，<br/>放在历史里再看一次。",
    "percentileCopy": "<strong>历史分位</strong>分别比较单日、20 日与 60 日 PCR。参考样本取当前统计日之前最多 252 个有效观察值，并显示实际样本数。",
    "priorYearCopy": "<strong>往年同期</strong>每次选择一个指标，以两条线比较同月同日的记录。缺失数据留空，摘要列出目标日与实际比较日。",
    "calculationSpec": "查看完整计算规则与验收条件",
    "sourcesTitle": "来源、时间与口径<br/>一起呈现。",
    "sourcesCopy": "成交量、未平仓量和价格行情分别标注，让每个读数都有可核查的含义。",
    "source1Label": "成交量 PCR",
    "source1Copy": "单日 PCR 为 Put 成交量 ÷ Call 成交量；20／60 日使用窗口内合计成交量之比，数据不足时留空。",
    "source2Label": "Cboe / OCC",
    "source2Copy": "Cboe 分类遵循其公布范围；个股与 ETF 的成交量来自 OCC。完整日数据按来源发布日期更新。",
    "source3Label": "OI 快照",
    "source3Copy": "持仓 PCR 单独展示，不随成交量刷新。缺少可靠快照的标的显示为空，不当成零。",
    "source4Label": "辅助行情",
    "source4Copy": "三大指数、原油与黄金提供市场参考。期权监测可选本机 moomoo 或另行授权的云端 API，分别标注局部扫描、供应商标的汇总及异动记录的覆盖范围。",
    "installTitle": "在自己的电脑上运行。",
    "installCopy": "安装包保留这一版界面和后端；个人名单在首次运行后由本机创建。",
    "installDownload": "下载 Windows 运行包",
    "step1": "<strong>准备环境</strong>安装 Node.js 22 或更新版本，以及 Python 3。",
    "step2": "<strong>下载并解压</strong>从 GitHub Releases 下载运行包，完整解压到一个文件夹。",
    "step3": "<strong>启动后台</strong>双击 <code>start.cmd</code>，使用时保留 CMD 窗口。",
    "step4": "<strong>打开观察台</strong>浏览器访问 <code>http://127.0.0.1:8765/</code>。",
    "localOnly": "这个 GitHub Pages 页面用于介绍项目。完整 PCR 交互、数据库和数据刷新在本地后端中运行。",
    "specCopy": "想了解实现细节？Spec 包含功能范围、数据算法、接口契约、数据库结构、运行方式和验收场景。",
    "readSpec": "阅读产品 Spec",
    "footer": "PCR 观察台 · v0.2.3",
    "close": "关闭",
    "title": "PCR 观察台 · 项目主页",
    "description": "PCR 观察台：查看美股期权单日、20日和60日 Put/Call Ratio，比较历史分位与往年同期，维护自己的关注名单。"
  },
  "en": {
    "brand": "PCR Market Watch",
    "navLabel": "Project navigation",
    "preview": "Preview",
    "sources": "Data & methods",
    "install": "Run locally",
    "heroTitle": "See options activity<br/><em>in context.</em>",
    "heroCopy": "Explore daily, 20-session and 60-session PCR across the market and your watchlist, then compare each reading with its history.",
    "download": "Download Windows ZIP",
    "sourceCode": "View source",
    "demoCaption": "PCR Market Watch · Historical percentile and prior-year walkthrough",
    "demoZoom": "Enlarge the recorded application walkthrough",
    "demoAlt": "English application walkthrough switching between PCR trends, historical percentiles, and daily, 20-session and 60-session prior-year comparisons.",
    "demoHint": "Recorded walkthrough · Click to enlarge",
    "demoDate": "The demo uses a version snapshot. Check data dates inside the application.",
    "workflowTitle": "A workflow built around PCR.",
    "workflowCopy": "Start with the market backdrop, inspect the symbols you follow, and compare current readings with historical context.",
    "flow1Label": "Market backdrop",
    "flow1Title": "Cboe aggregates and index ETFs",
    "flow1Copy": "Distinguish INDEX, TOTAL, EQUITY and ETF/ETP. References such as SPY, QQQ and DIA keep their own sources and data dates.",
    "flow2Label": "Your watchlist",
    "flow2Title": "Choose what you follow",
    "flow2Copy": "Search tickers, press Enter to add, organize groups, or remove symbols. Your list is stored in the local database and remains available when you return.",
    "flow3Label": "Historical context",
    "flow3Title": "Put each reading in perspective",
    "flow3Copy": "Compare daily and rolling PCR, inspect historical percentiles, or select one measure for a two-line prior-year comparison.",
    "historyCaption": "Historical context · Percentiles, sample counts and prior-year comparisons",
    "historyZoom": "Enlarge the historical comparison screenshot",
    "historyAlt": "Historical comparison showing PCR medians, percentiles, actual sample counts and trend lines.",
    "historyFigure": "Explicit rules for percentiles, prior-year comparisons and missing observations.",
    "historyTitle": "Give each reading<br/>historical context.",
    "percentileCopy": "<strong>Historical percentiles</strong> compare daily, 20-session and 60-session PCR separately. Each uses up to 252 valid observations before the selected data date, with the actual sample size displayed.",
    "priorYearCopy": "<strong>Prior-year comparison</strong> shows one selected measure as two lines aligned by calendar month and day. Missing records remain blank, and the summary shows both the target and actual comparison dates.",
    "calculationSpec": "Read the full calculation rules and acceptance criteria",
    "sourcesTitle": "Source, timing<br/>and methodology.",
    "sourcesCopy": "Volume, open interest and price quotes are labeled separately, so every reading has a verifiable meaning.",
    "source1Label": "Volume PCR",
    "source1Copy": "Daily PCR is put volume divided by call volume. The 20/60-session measures use totals within each window; insufficient data remains blank.",
    "source2Label": "Cboe / OCC",
    "source2Copy": "Cboe categories follow the scope of its published reports. Stock and ETF volumes come from OCC. Full-day observations follow each source’s publication schedule.",
    "source3Label": "OI snapshots",
    "source3Copy": "Open-interest PCR is displayed separately and does not refresh with volume. Symbols without a reliable snapshot remain blank, never zero.",
    "source4Label": "Supporting quotes",
    "source4Copy": "Three major U.S. stock indices, crude oil and gold provide market context. Optional monitoring uses local moomoo or separately authorized WebAPI, with distinct coverage for partial scans, provider summaries and unusual activity records.",
    "installTitle": "Run it on your own computer.",
    "installCopy": "The ZIP includes this version’s interface and backend. Your personal lists are created locally on first use.",
    "installDownload": "Download Windows ZIP",
    "step1": "<strong>Install prerequisites</strong>Install Node.js 22 or newer and Python 3.",
    "step2": "<strong>Download and extract</strong>Get the Windows ZIP from GitHub Releases and extract it completely.",
    "step3": "<strong>Start the backend</strong>Double-click <code>start.cmd</code> and keep its CMD window open.",
    "step4": "<strong>Open the dashboard</strong>Visit <code>http://127.0.0.1:8765/</code> in your browser.",
    "localOnly": "This GitHub Pages site introduces the project. The full PCR interface, database and data refresh run on the local backend.",
    "specCopy": "Explore the implementation: the Spec covers features, data algorithms, API contracts, database structure, setup and acceptance scenarios.",
    "readSpec": "Read the product Spec",
    "footer": "PCR Market Watch · v0.2.3",
    "close": "Close",
    "title": "PCR Market Watch · Project homepage",
    "description": "Explore daily, 20-session and 60-session U.S. options Put/Call Ratios, historical percentiles, prior-year comparisons and your own watchlist."
  }
};
const storageKey='pcr-market-watch:site-language:v1';
const repository='https://github.com/Rexmiao/pcr-market-watch/blob/main/';
const links={zh:{spec:repository+'docs/PRODUCT_SPEC.md',readme:repository+'README.zh-CN.md'},en:{spec:repository+'docs/PRODUCT_SPEC.en.md',readme:repository+'README.md'}};
let language='zh';
let parameter=null,saved=null;
try {parameter=new URL(location.href).searchParams.get('lang');}catch{}
try {saved=localStorage.getItem(storageKey);}catch{}
language=['zh','en'].includes(parameter)?parameter:['zh','en'].includes(saved)?saved:'zh';
const languageToggle=document.getElementById('language-toggle');
function renderLanguage(){
  const copy=translations[language];
  for(const element of document.querySelectorAll('[data-i18n]'))element.textContent=copy[element.dataset.i18n];
  // Rich translations are fixed project copy, never user-provided HTML.
  for(const element of document.querySelectorAll('[data-i18n-html]'))element.innerHTML=copy[element.dataset.i18nHtml];
  for(const attribute of ['aria-label','alt','data-caption'])for(const element of document.querySelectorAll('[data-i18n-'+attribute+']'))element.setAttribute(attribute,copy[element.getAttribute('data-i18n-'+attribute)]);
  for(const element of document.querySelectorAll('[data-i18n-href]'))element.href=links[language][element.dataset.i18nHref];
  document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=copy.title;document.querySelector('meta[name="description"]').content=copy.description;
  languageToggle.textContent=language==='en'?'中文':'English';languageToggle.lang=language==='en'?'zh-CN':'en';languageToggle.setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');
  const image=document.getElementById('dialog-image'),caption=document.getElementById('image-caption');
  if(image.getAttribute('src')){const button=[...document.querySelectorAll('[data-image]')].find(item=>image.getAttribute('src')===item.dataset.image);if(button){image.alt=button.querySelector('img').alt;caption.textContent=button.dataset.caption;}}
}
languageToggle.addEventListener('click',()=>{language=language==='en'?'zh':'en';renderLanguage();try{localStorage.setItem(storageKey,language);}catch{}try{const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);}catch{}});
renderLanguage();
const header=document.querySelector('.site-header');
function headerOffset(){document.documentElement.style.setProperty('--header-offset',(header.getBoundingClientRect().height+20)+'px');}
headerOffset();if(typeof ResizeObserver==='function')new ResizeObserver(headerOffset).observe(header);else window.addEventListener('resize',headerOffset);
