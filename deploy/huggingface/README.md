---
title: PCR Market Watch
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
license: mit
---

# PCR Market Watch

Current source and [Windows release](https://github.com/Rexmiao/pcr-market-watch/releases/tag/v0.2.22): **v0.2.22**, including Gamma/Max Pain, per-expiry archive/history and English-first runtime support. Historical **v0.2.3** assets remain unchanged; later main documentation/tests do not rewrite released tags/ZIPs/checksums. 当前源码及Windows发行均为**v0.2.22**，已含伽马／最大痛苦、逐期归档／历史与首次英文等程序；旧**v0.2.3**资产保留，后续main文档／测试不改写已发布标签／ZIP／校验值。Cloud runtime/recovery requires independent verification; 云端实际运行／恢复仍按独立发布验证记录确认。

[English guide](../../docs/HUGGING_FACE.en.md) · [中文说明](../../docs/HUGGING_FACE.md)

A public PCR dashboard with guest reading and explicit source updates when PCR_PUBLIC_VIEW=1. The generic image defaults to0; this deployment passed actual anonymous HTTP and24 realEdge checks. Guests can use dates, ranges and languages, while configuration edits and private pages require owner login. Public preferences readOnly:true/canRefresh:true mean no settings edits, not disabled data refresh.

Source updates share60-second budgets/coalescing; cooldowns return429 with retry timing. Public Cboe GET is verified-cache-only, including exact-date missing records; only explicit budgeted POST refresh fetches its source. Published-symbol projection hides private groups/accounts/positions/credentials/raw private provider records. The already-public generic default-seven core dataset remains a documented frontend exception, not arbitrary symbol access.

The Space/source may be public, but the Bucket, database backups and encrypted quote grants remain private. Keep runtime Secrets outside source; no personal local database, Windows DPAPI or private screenshots are uploaded. Independent quote-only OAuth refresh is bounded by real grant expiry. CPU Basic may sleep even with PRO; no extra paid resources were enabled. Earlier unobserved-stage reports are historical; the v0.2.14 baseline below records the subsequently observed daily OI execution. Verify backup and pause untilPAUSED before source updates.

## 中文

PCR_PUBLIC_VIEW=1允许游客免密码查看PCR并显式更新，通用镜像默认0，本次实际匿名HTTP及全新Edge24项已通过。日期／区间／中英操作保留，名单分组等配置及私人页面需所有者登录；readOnly与canRefresh分别约束编辑和数据刷新。

来源更新共享60秒冷却／合并；Cboe浏览只读缓存，缺日不借其他日，显式POST才在预算内更新。公开数据按已发布标的投影，默认七标的通用基础资料保留，私人组名、账户／持仓、凭证和原始私有接口不公开。Space公开不改变Bucket和服务端授权的私有性。保持CPU Basic、不新增收费资源，更新前确认备份并暂停到PAUSED。旧阶段未观察记录是历史；下方v0.2.14基线记录后来已观察到的每日OI执行。


Earlier public-entry acceptance (v0.2.7, before the later observed OI scheduled run) on2026-11-26: public homepage/charts/data/refresh200, actual moomoo7/7, immediate429, private APIs/pages401, cross-origin403, owner login retained, Bucket private/CPU Basic. Fresh signed-outEdge24 checks passed. Cboe data/history advanced to2026-11-25 (252 Cboe history rows); query/check dates do not create a November26 trading session. Future17:30 execution is unobserved.

较早公开入口验收（v0.2.7，早于后来已观察到的OI定时执行）：2026-11-26实际HF匿名首页／数据／更新200、moomoo7／7、紧接429、私人401和跨源403已过，所有者权限及私有Bucket保留。全新无登录Edge24项通过；Cboe更新到11月25日、252行历史，不把假日检查日当交易日。未来17:30执行未观察。

## Durable internal cache / 内部缓存持久化

The earlier Core/Cboe memory-only restore failure is historical. Migration0007 now persists worker_cache/body_gzip_base64 in private SQLite backups, cloud-only. Actual same-commit paused restart with GET only preserved dates/checkedAt/SHAs,252 Cboe history rows and35 OI observations without re-fetch. Capacity/expiry and future17:30 limits remain.

此前Core／Cboe仅内存回seed的失败已修复；0007迁移的worker_cache压缩正文随私有SQLite备份，仅cloud安装。实际暂停／同提交重启后只GET，日期／原checkedAt／SHA、252行历史和35条OI均保留，未再次抓取补回；容量／有效期边界不变，未来17:30仍未观察。

## Administrator settings / 管理员配置（v0.2.8）

Passwords allow10–256 characters. Change only PCR_CLOUD_USERNAME/PCR_CLOUD_PASSWORD; old sessions expire, while data, the private Bucket and separate moomoo encryption key/grant stay unchanged. Actual rotation passed on feature source213de51: selected new credentials work, old credentials/sessions return401, and7 prior watchlist preferences/42 OI observations/Core-Cboe hashes remain. Form303 and session200 retain Secure/HttpOnly/Partitioned flags; public guest viewing/refresh stays available. Earlier v0.2.7 recovery evidence remains separate.

密码支持10至256字符；仅轮换PCR_CLOUD_USERNAME／PCR_CLOUD_PASSWORD，旧会话失效，数据、私有Bucket及独立moomoo加密密钥／授权不变。功能源码213de51的实际轮换已过：新凭据可登录，旧凭据／会话401，原7项关注偏好、42条OI和Core／Cboe哈希保留。表单303／会话200且安全Cookie标志保留，游客查看／更新正常；既有v0.2.7证据仍独立保留。

## PCR summary and execution evidence / PCR摘要与执行证据（v0.2.9）

The dynamic homepage summary uses selected references/watchlists, row-level actual dates, exact prior-session signed PCR changes and source-defined 20/60-session values. Its 20-session percentile excludes current/future data and displays actual sample counts; no values imply net market positions. Owner-only daily diagnostics read safe scheduling/authorization metadata without source calls or credential renewal. A new monitoring start prevents invented pre-activation failures; manual observations and Ready do not prove a scheduled run. Keep CPU Basic sleep limits and the unobserved first actual 17:30 run explicit. No new paid resources, public private-data routes, administrator rotation or local-database migration are included. See the [English Product Spec](../../docs/PRODUCT_SPEC.en.md).

首页动态摘要按市场参考／自选生成，保留逐行实际日期、确切前一交易日PCR带正负号变化及源定义20／60日；20日分位排除当前／未来并显示实际样本数，不代表净多空。所有者每日诊断只读安全计划／授权元数据，不调用来源或续期凭证；监测起点前不追判失败，manual观察和Ready不证明scheduled执行。CPU Basic休眠限制及首次真实17:30尚未观察须保留。本次不新增收费资源、公开私人数据入口、管理员轮换或本机数据库迁移。见[中文产品规格](../../docs/PRODUCT_SPEC.md)。


v0.2.9 actual acceptance / 实际验收：feature source daaf0dd is running; 99 Node plus model/source checks, 27 fixture-browser, 13 real anonymous-cloud browser and 12 read-only HTTP checks passed separately. Current summary rows=11; selected November26 keeps activity dates≤November25. Owner diagnostics show waiting/unobserved, missingDates=[] and refresh_needed metadata without source requests/renewal. Existing preferences, 42 OI observations/Core-Cboe hashes and credentials remain. The first actual 17:30 run is still unobserved.

v0.2.9功能源码daaf0dd已运行，99项Node及模型来源、27项fixture浏览器、13项真实云匿名浏览器和12项只读HTTP分别通过；动态摘要11行，所选26日仍保留≤25日的实际成交日。所有者诊断waiting／unobserved、missingDates=[]，refresh_needed只属元数据，未请求来源／续期。原偏好、42条OI／Core-Cboe哈希及凭据保持；首次真正17:30执行仍未观察。

## Quote-overview shortcuts / 行情概览快捷入口（v0.2.11）

Four shortcuts belong only to the homepage quote card, including when unpinned: Market PCR (#cboe-panel), Index ETFs (#market-etf-reference), Watchlist (#watchlist-panel) and Symbol history (#history-panel). Remove the v0.2.10 top-navigation shortcut. Market/ETF selects the current matching saved item or first saved item, with bilingual disabled reasons for empty/loading/failed settings and no re-addition. ETF shares the existing trend. View changes may GET cached data but never refresh a source, search, write preferences or add polling; date/range, permissions, private storage and quote consent remain. Measured clearance, section focus and reduced motion remain. Build/artifact validation, 7 related frontend tests and 33 fresh-profile fixture-browser checks passed; local installation retained saved data/tasks. Cloud deployment/recovery requires independent runtime evidence rather than inference from local tests, as required by the [English Product Spec](../../docs/PRODUCT_SPEC.en.md).

四入口仅位于首页行情卡，取消悬浮仍可用：整体市场PCR（#cboe-panel）、三大指数ETF（#market-etf-reference）、关注标的（#watchlist-panel）、个股历史（#history-panel）；移除v0.2.10顶栏入口。整体／ETF选择当前匹配保存项或第一保存项；全删／设置加载中或失败时显示双语禁用原因，不自动加回，ETF沿用共用趋势。切换可GET读取缓存，不刷新来源、不搜索、不写偏好或新增轮询，保留日期／区间、权限、私有存储和行情授权；实际高度避让、区域焦点及减少动效保持。构建／发行物校验、7项相关前端及33项全新浏览器夹具检查通过，本机安装保留原数据／任务。云端部署／恢复需独立运行证据，不由本机测试推定，见[中文产品规格](../../docs/PRODUCT_SPEC.md)。

Historical v0.2.10 / 历史证据：the former two-entry navigation passed 27 fixture-browser, 21 anonymous-cloud browser and 12 read-only HTTP checks and was installed locally. Its top-navigation contract is superseded; these counts do not prove v0.2.11. 旧双入口通过27项夹具浏览器、21项云端匿名浏览器和12项只读HTTP并同步本机；旧顶栏契约已替代，这些计数不作为v0.2.11验收。

## 5-session volume PCR / 5日成交量PCR（v0.2.12）

The frontend derives five-session aggregate Put/Call ratios from existing cached daily counts, without new APIs/schema/seeds/source collection. Cboe requires five consecutive expected sessions; OCC retains five acquired activity records. Missing/insufficient quantities or zero aggregate Call yield null; original 20/60, OI and source/check dates remain. Summary/history statistics and daily/5/20/60 series include the new teal measure, with independent existing Cboe/ETF historical comparisons. Full 20-session PCR >/< /= 60-session PCR labels have visible hover/focus explanations of relative activity, not long/short shares or predictions. Preserve navigation, guest/owner access, credentials, private storage and quote-only consent. Calculation/history/summary/calendar checks passed 32/32, including 8 new five-session cases; fixture-browser checks passed 22/22 without JS errors or POST/PUT. Source build/artifact validation and local installation passed with original data/tasks retained. Actual cloud deployment/recovery requires independent runtime evidence as required by the [English Product Spec](../../docs/PRODUCT_SPEC.en.md).

前端用已有缓存每日张数合计派生5日成交量PCR，不增加API／结构／种子／来源采集。Cboe严格连续5个预期交易日，OCC沿用5条取得活动记录；缺失／不足或合计Call为0留空。20／60、OI及数据／检查时间不改。摘要／历史统计和单日／5／20／60四线包含青绿5日，既有Cboe／ETF历史比较独立；完整“20日 PCR >／<／= 60日 PCR”有悬浮／焦点说明，只描述相对活跃度，不代表净多空或预测。导航、游客／所有者权限、凭据、私有存储及只读行情授权保留，计算／历史／摘要／日历32/32（含新增5日8项）及浏览器夹具22/22通过，无JS异常或POST／PUT；源构建／发行物及本机安装校验通过，原数据／任务保留。实际云端部署／恢复仍需独立运行证据，见[中文产品规格](../../docs/PRODUCT_SPEC.md)。

## PCR rule observations / PCR规则观察（v0.2.13）

Summary and selected symbol/Cboe-ETF history readings separately show same-date 5/20/60 ordering, signed exact-prior-U.S.-session changes and a descriptive state. Epsilon1e-12 suppresses floating noise only. A continuation label requires matching nonzero r5/r20 direction over three comparisons on four exact sessions; gaps never count and r60 remains separate background. Any missing current/exact-prior window makes the overall reading insufficient while valid arrows remain. Non-session actual anchors preserve original dates/levels/order but leave directions unknown and cannot confirm continuity. Visible bilingual hover/focus help explains that overlapping windows are not independent signals and fewer Calls can raise PCR. These are not backtested trading signals, forecasts or market-position shares. No APIs/schema/seeds/OI/provider calls/polling or permission changes are added. Interpretation/summary checks passed 22/22, with 8 five-session regressions, 7 permissions/frontend checks and final browser fixtures at 18/18 without JS errors or POST/PUT. Source build/artifact validation and local installation passed, preserving data/tasks. Actual cloud deployment/recovery requires independent runtime evidence under the [English Product Spec](../../docs/PRODUCT_SPEC.en.md).

摘要和个股／CboeETF选中历史分别展示同日5／20／60排序、确切前一美股交易日逐窗差分与描述性状态。1e-12只消除浮点噪音；5／20在4个确切日的3次比较均同向非零才确认规则延续，缺口不算，60单独作背景。任一当前／确切前日窗口缺值使总体不足，已知箭头仍可显示。非交易日实际锚点保留原日／数值／排序，但方向未知、不确认连续。双语hover／焦点说明强调窗口重叠不是独立信号，Call下降也能推高PCR；不代表回测信号、预测或市场净头寸。不增加API／结构／种子／OI／来源调用／轮询或权限变化，解读／摘要22/22、5日回归8项、权限前端7项及最终浏览器夹具18/18通过，无JS异常或POST／PUT；源构建／发行物及本机安装校验通过，原数据／任务保留。实际云端部署／恢复采用独立运行证据，见[中文产品规格](../../docs/PRODUCT_SPEC.md)。

## Gamma / Max Pain（v0.2.14 source / 源码）

The source adds `/option-structure.html` with a 30-calendar-day Gamma default, nearest/seven-day/all alternatives and an excluding-nearest comparison. Strike bars and the hypothetical-spot aggregate profile stay separate. Display provider Call/Put Walls and all returned zero-Gamma points. Max Pain has its own single-expiry selector. Preserve provider update times separately from retrieval times; fixed-OI Max Pain does not move merely because spot moves, whereas GEX may change with spot/time/IV/positioning data. These models neither identify actual dealer inventory nor establish price targets or guaranteed support/resistance. Undisclosed units stay unknown.

Load/selection is cache-only; explicit refresh uses existing server-only quote:read consent. The new public routes accept only symbols actually published in current settings; the old Core default-seven exception does not extend to them. Gamma and Max Pain have independent shared 60-second budgets, bounded process cache and no historical/restart-persistence promise. An exact all-minus-nearest filter exceeding 256 characters is explicitly unavailable, without substituting 30 days. Existing OI archives/Core-Cboe durable cache/tasks/credentials remain. The GitHub v0.2.3 ZIP is unchanged and does not include this source addition. Local provider probes passed; application/browser/HF publication uses separate runtime evidence. See the [English Product Spec](../../docs/PRODUCT_SPEC.en.md) and [backend guide](../../docs/MOOMOO_BACKEND.en.md).

源码新增`/option-structure.html`，Gamma默认30自然日，可选最近到期／7日／全期限，并比较排除最近一期；行权价柱与假设股价下的总GEX蓝线分图，展示供应商Call／Put墙及全部零点。Max Pain单独选一期，源更新时间与查询时间分别保留。固定OI的痛点不随股价本身变化，而GEX可随股价／时间／IV／仓位数据变化；模型不代表真实dealer库存、目标价或必然支撑／压力，未知单位不推算。

载入／切换只读缓存，显式刷新沿用服务端quote:read；新公开接口只允许当前settings实际发布的标的，旧Core七项例外不扩展。Gamma和Max Pain各自共享60秒预算，使用有界进程缓存、不承诺历史／重启恢复。all排最近精确过滤超过256字符则不可用，不换成30日。原OI归档／Core-Cboe持久缓存／任务／凭据保持。GitHub v0.2.3安装包不变且不含这项源码新增；本机provider探测通过，页面／浏览器／HF发布使用独立证据。见[中文产品规格](../../docs/PRODUCT_SPEC.md)和[后端说明](../../docs/MOOMOO_BACKEND.md)。

v0.2.14 pre-update baseline, separate from earlier unobserved-stage records: the existing cloud daily OI task now has actual scheduled-success evidence on 2026-11-26 at 17:30:32–17:30:33 New York time (22:30:32.014Z–22:30:33.959Z UTC), with seven requested, seven saved and zero unavailable; this was not a manual test. The 22:30:40.458Z private backup manifest, SQLite quick_check and SHA were verified, with 56 OI observations and four worker_cache rows. After this update, independent GET-only checks must still confirm these baselines. This is neither scheduled Gamma/Max Pain collection nor proof of this batch's HF publication.

v0.2.14发布前基线补充（与旧阶段“未观察”记录分开）：云端既有每日OI任务已观察到真实scheduled成功，2026-11-26美东17:30:32—17:30:33（UTC22:30:32.014Z—22:30:33.959Z），请求7项、保存7项、不可用0项；不是manual测试。22:30:40.458Z私有备份manifest及SQLite quick_check／SHA已核验，基线为56条OI观察和4行worker_cache。本次更新后仍须GET-only独立核对这些状态；此证据不是新Gamma／Max Pain的定时采集或本批HF发布成功。

## Profile comparison and Chinese labels / 曲线对照与中文命名（v0.2.15）

English retains Gamma / Max Pain. Current Chinese navigation/titles/refresh controls use “伽马 / 最大痛苦”, optionally introducing the original terms. Blue is the selected expiration profile; orange dashed removes its nearest expiry. At equal hypothetical spot and identical remaining inventory/IV/time/model inputs, their difference can describe that expiry's modeled contribution. Distinct-time observations are structural comparisons only, not capital flows or future-profile predictions. Language preferences, calculations, providers, permissions, APIs, databases and existing runtime privacy boundaries are unchanged. See the [English interface contract](../../docs/PRODUCT_SPEC.en.md).

英文保留Gamma / Max Pain，中文当前入口／标题／更新按钮采用“伽马 / 最大痛苦”，首次可附原文。蓝线为选中到期集合，橘黄虚线为排最近一期；只有同假设价格及其余仓位／IV／时间／模型条件一致时，差值才可描述该期模型贡献。异时点仅结构对照，不是实际资金流或未来曲线。语言偏好、计算、来源、权限、API、数据库及既有运行保密边界不变。见[中文界面契约](../../docs/PRODUCT_SPEC.md)。


## Strike distribution and Bitcoin reference / 行权价分布与比特币参考（v0.2.15）

The strike distribution now precedes aggregate profiles, with side-by-side Call/Put bars, gray net-value diamonds at exact strikes and the selected snapshot's own spot/wall markers. Net diamonds are not connected into a curve and adjacent strikes are not aggregated. The default display remains spot ±15%; All prices exposes the complete valid supplied distribution. The independent full-range table still caps display at 500 rows with a truncation notice. Hypothetical-spot blue/orange profiles and the existing single-expiry Max Pain components remain separate; display choices do not change data or calculations.

Market overview adds Bitcoin BTC/USD from Yahoo Finance BTC-USD through existing market endpoints/budgets, not a new moomoo permission. Show USD price/change/provider time independently. Change uses source previousClose (one-day chartPreviousClose fallback), not a guaranteed rolling 24-hour return or previous U.S. stock-session close. Retain UTC source-session date and actual timestamps displayed in New York, distinguish crypto 24/7 trading from possibly delayed quotes, and never relabel older equity prices when crypto updates. No automatic BTC insertion into PCR/GEX/watchlists or database changes. Acceptance for these source/UI changes is separate from deployed HF/browser verification. See the [English Product Spec](../../docs/PRODUCT_SPEC.en.md).

行权价分布在总曲线之前，以并列Call／Put柱、每档灰色净值菱形和所选快照自己的现价／墙位呈现；净值不连线、不合并相邻行权价。默认仍为快照价±15%，可切全部价格看完整有效供应商分布；独立全范围数据表仍最多500行并提示截断。蓝／橘假设股价总曲线及原单到期最大痛苦组成保持分开，不因显示选择改数据／计算。

行情概览沿用原接口／预算新增Yahoo Finance BTC-USD的比特币BTC/USD参考，不新增moomoo权限。独立USD价格／涨跌／源时点，涨跌相对源previousClose（1日请求可后备chartPreviousClose），不是保证的滚动24小时涨幅或美股前一交易日涨跌。保留UTC源日期、用美东显示真实时点，区分加密24／7交易和快照可能延迟；BTC更新不重标股票旧价。不自动加进PCR／GEX／自选，不改数据库；来源／界面验收与HF现场／浏览器证据分开。见[中文产品规格](../../docs/PRODUCT_SPEC.md)。

## Automatic key-level view / 自动关键价视窗（v0.2.16）

Auto is the current default, with manual Near spot ±15% and All alternatives. Distribution includes the selected snapshot's spot/Call Wall/Put Wall. Aggregate comparison includes displayed base/excluding-nearest spots/walls/all roots. Start with spot ±15%, expand for key prices, add 5% of the resulting span at each end and keep the lower bound nonnegative; missing spots/anchors follow explicit fallback rules. Preserve manual choices during current-page rerenders. This changes axes only, without source requests, model recalculation, interpolation/extrapolation, new point coverage or API/permission/database changes. Cards and the independent 500-row table limit remain. See the [English Product Spec](../../docs/PRODUCT_SPEC.en.md).

默认改为自动，手动附近±15%及全部价格保留。分布图纳入所选快照现价／看涨墙／看跌墙；总曲线取已显示基础／排最近快照现价／墙／全部零点并集。以现价±15%起步、扩展关键价、跨度两端各留5%且下界非负；缺价／缺锚点按明确规则回退。当前页重绘保留手动选择。只改坐标轴，不发来源请求、不重算／插值／外推／扩充模型点、不改API／权限／数据库；卡片及独立最多500行表保持。见[中文产品规格](../../docs/PRODUCT_SPEC.md)。

## Durable daily structure history / 每日持久结构历史（v0.2.17）

The separate 17:45 America/New_York process timer archives each actual provider-returned expiry within 30 calendar days for GEX and independent Max Pain, plus 30-day/excluding-nearest GEX, for currently published watchlist/reference symbols. It follows the existing OI monitoring setting unless PCR_STRUCTURE_DAILY_ENABLED=0 disables it separately. The 17:30 OI schedule remains independent. CPU Basic sleep can miss days even with PRO; waking after the due time records only today's actual query day. No paid hardware, Jobs or fabricated backfill is added.

Migration0008 adds append-only compressed structure snapshots and durable run/checkpoint state to the private SQLite/private Bucket backup contract. Live process cache remains volatile and separate. History mode compares actual saved day/expiry/capture selections: Gamma primary blue/comparison purple, independent single-expiry Max Pain and original query/provider times. Unknown settlement dates and missing scopes stay unknown/empty. History/status GETs never query the source. Public status exposes safe aggregates; history exposes only current published symbols. Whole-list capture is owner-only and202 means accepted, not complete.

Sequential collection is bounded to600 requests/20minutes with at least2000ms between requests, a renewing120-second lease, and at most3 scheduled attempts per day15minutes apart. Per-observation raw/gzip limits are1,500,000/512,000bytes; current private SQLite backup files cap at512MiB. Archives grow private storage, are not automatically deleted and are not a complete contract-chain/backtest dataset. Verify a latest valid private backup, PAUSED state and GET-only original-record restoration independently of manual capture, actual scheduled execution, anonymous HTTP or real-browser results. The old GitHub v0.2.3 installer remains unchanged. See the [English backend](../../docs/MOOMOO_BACKEND.en.md) and [hosting guide](../../docs/HUGGING_FACE.en.md).

独立美东17:45进程任务按当前发布自选／参考标的，保存未来30自然日内每个实际到期日的GEX与独立Max Pain，另存30日／排最近GEX；默认跟随OI启用设置，可用PCR_STRUCTURE_DAILY_ENABLED=0单独关闭。原17:30 OI任务保留。CPU Basic即使PRO仍可能休眠漏采，晚唤醒只记当日实际查询，不补造历史、不增加收费硬件或Jobs。

0008迁移新增压缩追加结构快照、运行／checkpoint状态，纳入私人SQLite／Bucket备份；实时进程缓存仍易失并与历史分离。历史模式分别选真实保存日、到期／范围及查询时点，Gamma主选蓝／对照紫，Max Pain独立单期；原查询／源时间保留，未知结算日期与缺失范围不猜测。历史／状态GET不查询来源，游客看当前发布标的及安全状态；整批采集仅管理员，202不等于完成。

顺序采集每次最多600请求／20分钟、间隔至少2000毫秒、120秒续租，每天最多3次定时尝试且相隔15分钟。单条原始／gzip上限1,500,000／512,000字节，当前私人SQLite备份单文件上限512MiB；归档占私人空间且不自动删除，不是完整逐合约链／回测库。最新有效备份、PAUSED、只GET原记录恢复、manual、真实scheduled、匿名HTTP和浏览器分别核验；旧GitHub v0.2.3安装包不改。见[中文后端](../../docs/MOOMOO_BACKEND.md)和[托管说明](../../docs/HUGGING_FACE.md)。

## History-read performance / 历史读取性能（v0.2.18）

Bounded current-page caches reuse validated historical records and short-lived date headers, while coalescing identical concurrent GETs. Explicit history reload/capture completion and symbol/list/permission changes invalidate them. Index/status remain no-store; ordinary backend status uses one read-only SQLite statement with bounded fallback for large checkpoints. Successful local Windows plan metadata may be cached30seconds; dynamic run/lease state is not. This reduces repeated reads, not upstream quote-request intervals. Original data/times, private SQLite/Bucket backups, quote:read, published-symbol/owner boundaries, CPU Basic sleep and existing2000ms/600-request/20-minute collection budgets remain. Controlled benchmarks and actual timings/deployment require separate evidence. See the [English performance contract](../../docs/PRODUCT_SPEC.en.md).

当前页面内有界复用已校验的历史记录／短时日期headers，并合并同键并发GET；显式重读／采集完成及标的／名单／权限变化会失效。index／status保持no-store，常规后台status采用一次只读SQLite查询，大checkpoint保留有界回退。本机Windows计划元信息成功结果最多缓存30秒，动态run／lease不缓存。只减少重复读取，不缩短上游请求间隔；原数据／时间、私人SQLite／Bucket备份、quote:read、发布标的／所有者权限、CPU Basic休眠及原2000毫秒／600请求／20分钟采集预算保持。受控基准、现场耗时和实际发布分别核验。见[中文性能契约](../../docs/PRODUCT_SPEC.md)。

Current hosted application/sign-in and the GitHub Pages showcase default to English on a first visit without a valid URL or saved choice. Valid Chinese URL/device choices remain Chinese, and the control saves either selection. Document links match the selected language; historical static snapshots retain their original language. The showcase is a static feature/download entry point; complete interaction runs on a separately deployed local/cloud backend. The existing GitHubv0.2.3 ZIP is unchanged.

当前托管应用／登录与GitHub Pages介绍页首次无有效URL或已存选择时默认英文，中文直达／设备偏好仍为中文，双向切换保存；文档链接对应所选语言，旧静态快照保留原语言。介绍页是静态功能／下载入口，完整交互由独立本机／云后端运行；GitHub既有v0.2.3 ZIP不变。

## Interface refresh / 界面整理（v0.2.19）

Source v0.2.19 is a front-end-only change: a dark blue-slate theme on every app page (charts and tooltips included), a homepage PCR snapshot strip (TOTAL first), a wide summary table with a sticky first column and decimal-aligned numbers, a compact floating quote bar, an English / 中文 switch showing both options, unified accent bars and PCR trend colours ordered by importance (daily gray, 5-session teal, 20-session bright blue, 60-session amber). No API, calculation, database migration, credential, quote permission, cooldown, polling or public/owner boundary changes. GitHub v0.2.19 was released by CI on 2026-11-28; the Space is updated only through the existing backup → PAUSED → upload/start → GET-only verification procedure. Released v0.2.18 assets stay unchanged.

源码v0.2.19只改前端：全部应用页面改为蓝灰深色主题（含图表与悬浮提示），首页新增PCR快照指标条（TOTAL置首），摘要宽表首列固定、数字按小数点对齐，悬浮行情滚动后收为紧凑条，语言切换同时显示English／中文，色条统一，PCR趋势线按重要性配色（单日灰、5日青绿、20日亮蓝、60日琥珀）。不改API、算法、数据库迁移、凭据、行情权限、冷却、轮询或公开／所有者边界。GitHub v0.2.19已于2026-11-28由CI发布；Space只按既有备份→PAUSED→上传／启动→只GET核验流程更新。已发布的v0.2.18资产不变。

## Day/night mode / 日间／夜间模式（v0.2.20）

A Day/Night switch sits beside English / 中文 on every app page; night stays the default. The choice is kept in the browser and mirrored to a functional `pcr-theme` cookie (light/dark only) so the script-free sign-in page renders the same mode on the server. Chart colours follow the mode with the same hierarchy. No API, calculation, migration, credential, quote permission, cooldown, polling or public/owner boundary changes.

每个应用页面在English／中文旁新增日间／夜间切换，默认仍为夜间。选择保存在浏览器，并镜像为只含light／dark的功能cookie `pcr-theme`，使不运行脚本的登录页在服务端输出相同模式；图表配色随模式切换并保持同一主次。不改API、算法、迁移、凭据、行情权限、冷却、轮询或公开／所有者边界。

## Custom domain / 自定义域名（v0.2.21）

The gateway trusts the custom domains HF lists for this Space in `HF_SPACE_HOST` (default host first, comma-separated; exact lowercase hosts, fail closed, at most five extras), so sign-in and refresh work on `option-chain-watcher.levyquant.ai` as on the hf.space address. The domain has been live since 2026-11-28.

网关信任HF在`HF_SPACE_HOST`中为本Space列出的自定义域名（默认主机在前、逗号分隔；须为精确小写主机名，格式错误即全部不信任，最多5个），因此`option-chain-watcher.levyquant.ai`上的登录与刷新与hf.space地址相同。该域名已于2026-11-28上线。

## Sign-in language / 登录页语言（v0.2.22）

The sign-in page follows the language you last used in the app through a functional `pcr-lang` cookie (zh/en only); a `?lang=` link still wins.

登录页通过只含zh／en的功能cookie `pcr-lang`跟随你在应用中最后使用的语言；带`?lang=`的链接仍然优先。
