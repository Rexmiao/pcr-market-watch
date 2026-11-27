# moomoo 后端接入

**简体中文** | [English](MOOMOO_BACKEND.en.md)

PCR 观察台提供两条可选只读路径：**desktop** 使用本机 moomoo 桌面 CLI，**webapi** 通过后端直接请求 moomoo HTTPS 行情接口。WebAPI 模式不需要桌面客户端，但仍需要运行网站后端、独立 AccessToken 及对应 API 权限。浏览器不接触任何凭证。

## 桌面行情接口

| 本机 HTTP API | 参数示例 | 用途 |
| --- | --- | --- |
| `/api/providers/moomoo/status` | 无 | 桌面配置、CLI、最近成功时间与连接状态 |
| `/api/providers/moomoo/quotes` | `?symbols=AMD,NVDA` | 每批最多 20 个股票／期权代码；基础行情及实际返回的期权扩展、盘前、盘后、夜盘字段 |
| `/api/providers/moomoo/kline` | `?symbol=AMD&count=60` | 最近日 K，最多 1000 根 |
| `/api/providers/moomoo/expirations` | `?symbol=AMD` | 期权到期日 |
| `/api/providers/moomoo/option-chain` | `?symbol=AMD&begin=2026-11-27&end=2026-11-27` | 指定范围期权链，单次最多一个月 |
| `/api/providers/moomoo/security-snapshots` | `?symbols=AMD` | 独立完整快照接口，最多 100 代码；可单独超时／不可用 |
| `/api/providers/moomoo/option-trades` | `?symbol=AMD261127C500000&count=200` | 单份期权合约的实际逐笔，最多 200 笔 |

桌面路径固定允许 subscribe、get-basic-qot、get-kline、get-option-expiration-date、get-option-chain、get-security-snapshot、get-ticker，不提供任意命令代理，也没有账户、持仓、订单或交易解锁操作。子进程使用参数数组与 shell:false；桌面 AppKey 仅通过环境变量传递，Host 只接受 loopback。

## 两套独立凭证

桌面模式仍使用 `node scripts/configure-moomoo.mjs` 或后端 `OPENAPI_HOST_APPKEY`，加密文件为当前用户 LocalAppData 下 PcrMarketWatch 的 `moomoo-appkey.dpapi`。它只用于本机桌面 Host，不能直接当作 WebAPI Bearer token。

WebAPI 默认使用 `node scripts/connect-moomoo-webapi.mjs`：通过 OAuth 2.1 PKCE 打开 moomoo 官方授权页，仅请求 `quote:read`，并由本机回调接收授权结果。访问／刷新凭证及有效期存入 `%LOCALAPPDATA%/PcrMarketWatch/moomoo-webapi-oauth.dpapi`，独立 Windows DPAPI 加密文件位于项目、Dropbox 和浏览器之外；不要求在聊天中粘贴 token。

首次令牌响应省略 `scope` 时，仅继承本次绑定 PKCE 流程显式请求的 `quote:read`。显式范围必须恰含一次 `quote:read`；刷新响应省略范围时仅继承上次已验证范围。供应商返回的 `accid:*` 或 `accid:` 后接 1–32 位数字是上下文选择器，合法格式可接受，不授予账户／持仓读取能力；这些操作需要本项目拒绝的 `trade:read`。显式空／null、写入、trade、未知能力或非法选择器仍拒绝。授权包的 scope 只存规范化 `quote:read`，另存上下文存在布尔值，真实选择器值不写日志、网页或源码。

后端根据实际返回的到期信息刷新 AccessToken。供应商可以撤销授权，刷新凭证也会到期，不能承诺永久连接；过期／撤销后在官方页面重新授权。另一台电脑或 Windows 用户需重新配置。`scripts/configure-moomoo-webapi.mjs` 是同一 OAuth 连接流程的兼容入口；本机不提供手动 token 或环境变量 token 模式，不把 token 写入 `.env`、源码或启动脚本。拒绝额外权限能力；合法账户上下文选择器不算新增能力。

凭证只在后端内存及供应商授权环境／请求头中使用，不进入网页、URL、命令行、数据库配置、日志、Git 或发行包。监测 WebAPI 只访问固定官方 HTTPS 主机及两个只读行情路径，不接受用户指定的外部地址。配置存在不代表成功连接或实时权限已验证。

## 启动与来源选择

1. 运行网站后端，使用启动器打印的实际 loopback 地址：默认 8765；无关程序占用时可选 8766，不终止那个程序。
2. 使用 desktop 时保持 moomoo 已登录、允许外部访问并开启 CLI，默认 Host 为 `http://127.0.0.1:22222`，可用 `OPENAPI_HOST_URL` 指定其他 loopback 端口。
3. 使用 webapi 时运行独立的官方 OAuth 只读授权；此模式不依赖桌面应用在线。电脑或本机 Node 后端停止，网页仍不能继续采集。
4. 从顶部 PCR 与市场解读之间的“期权异动”进入 `/options-monitor.html`，再选择 auto、desktop 或 webapi。v0.2.1 的 auto 读取实际客户端 `status().configured`，优先选择已配置 WebAPI，否则选择 desktop，并返回实际来源；采集失败不静默回退。来源和范围纳入缓存及 OI 比较身份。

`checkedAt` 是后端查询时间；行情时间使用供应商实际返回的时间戳。时间未提供就明确未知，不能以抓取时间证明实时。API 权限与桌面 App 权限分别核实。

## 独立期权异动页面（v0.2.2）

| HTTP API | 行为 |
| --- | --- |
| `GET /api/options-monitor?symbol=AMD&provider=auto` | 仅读取已选实际来源的缓存；可选 `expiration=2026-11-27` |
| `POST /api/options-monitor/refresh?symbol=AMD&provider=webapi` | 空 JSON 对象触发受限采集；冷却至少 30 秒、重叠请求合并 |

**desktop 范围：** 一个标的、一个到期日，最多现价附近 20 个行权价／40 份 Call/Put 合约；读取期权链后，通过 `get-basic-qot` 分最多两批、每批 20 份取得合约报价观察，使用实际返回的成交量及 `option_ex_data` 内 OI／IV 等字段。完整 `get-security-snapshot` 接口继续独立提供，但不作为监测必经依赖，也不保证全字段可用。真实逐笔最多三个活跃合约、每个 200 笔、合计 600 笔。显示到期日、行权价范围与覆盖数，局部 PCR 标为“扫描范围内 PCR”。

**webapi 范围：** 后端 POST 固定 `option-underlying-overview` 获取所选标的 call_volume、put_volume 及 T−1 的 Call/Put OI；GET 固定 `option-event`，以 `US_SECURITY` 和标的代码筛选供应商异动列表，单批最多 300 条。显示分页是否完整／是否截断，不把异动列表称为完整逐笔成交带。汇总标为“供应商标的汇总 PCR”。官方未明确的交易所或到期聚合边界保持未知；到期日筛选只过滤异动事件，**不能改变标的汇总 PCR 的范围**。

供应商 BUY/SELL/NEUTRAL 只是方向分类，当前行情接口没有开平仓标志，开平仓明确显示未披露。两次可比较检查之间的累计量增加另列“检查区间成交量增量”，不伪装成单笔大单。换源、跨交易日、范围变化或计数重置不误报。必要值缺失或 Call 分母为零，PCR 留空。

OI 的 T−1 说明不是已核实的具体结算日；实际结算日未披露就保持未知。本地 SQLite 缓存按实际来源隔离；desktop 逐合约 OI 使用 option_monitor_oi，WebAPI 返回事件中去重后的逐合约 OI 使用独立 option_monitor_webapi_oi。只比较同源、同合约／范围的实际观察日期；v0.2.6 的 WebAPI 标的汇总 OI 另用追加归档表，见下方说明。缺历史留空，增减不确定证明开仓／平仓、行权或多空人数变化，首页最新 OI 汇总与原 Cboe 快照可明确切换，均与这里的逐合约观察分开。

默认筛选张数 500、Volume/OI 2 倍，可修改；它们不是买卖信号。自动刷新可选 30／60／120 秒，仅面板展开且页面可见时运行；隐藏或关闭即暂停，没有闭页通知。无配置、鉴权失败、无权限或超时需明确显示；保留旧成功数据时注明原观察时间及过期状态，不自动换源或生成假成交。

### 页面与提示

新页默认展开，保留原偏好、名单和同一 SQLite/API；旧 `/#options-monitor` 转到新页。首页不挂载监测或发起监测请求。手动／可见页轮询规则不变，离开、隐藏或折叠即停。

橘色是阈值命中，不能当作多空信号。结合到期日、行权价、Call/Put 阅读合约；BUY/SELL 不等于开平仓。同一合约可多次出现或命中多规则，提示数不代表独立开仓或投资者人数。

### 卡片方向与时间（v0.2.3）

活动／逐笔卡按 eventId 对应原记录，展示供应商方向与“开平仓未披露”，不能借同合约另一记录填空。WebAPI 的 fill_timestamp 为微秒，转成 America/New_York 的日期与 HH:mm:ss ET；不是固定 EST，也不以检查时间代替缺失记录时间。快照比例和区间增量提示只标自己的观察／检查时间。Put、OI 或 BUY／SELL／NEUTRAL 都不能单独确认净多空或开平仓；卡片和表格遵循同一边界。

真实只读记录已核实事件关联、供应商方向与记录时间，开平仓未知；不公开实际活动载荷。接口、数据单位及只读权限不变。新卡片身份／时间 10 项、中英浏览器 14 项均通过，包括 320px、同合约不同方向、未知字段、UTC 跨日及纽约春秋夏令时；未认可的原始 OPEN 不视为开平仓证据。

## 首页 OI 手动刷新（v0.2.2）

首页默认“最新 Moomoo”，可明确切到“已保存 Cboe”。初次 `GET /api/oi-summaries?symbols=NVDA,MU` 只读缓存；“更新数据”以同一查询参数和空 JSON `POST /api/oi-summaries/refresh`，与 OCC 成交量独立更新。最多 40 标的、2 个并发汇总请求，只读 `option-underlying-overview`，不取事件、不启动首页轮询。托管 Worker 返回 503；本机 Node 和授权仍须可用。

返回逐标的 Put／Call OI、PCR、checkedAt、status／stale；OI 为 previous_session 口径，未提供具体结算日时 oiAsOf 为 null。失败保留原完整缓存与原时间并标 stale；新响应缺一侧不能拼旧侧，否则 PCR 空。新 `oi_summary_cache`（0004 迁移）按 symbol 保存最新 payload_json／checked_at，不是历史序列，原 Cboe 种子与异动合约观察不改。

上述 v0.2.2 只保存最新缓存；v0.2.6 改为按 requestedDate 精确读取纽约查询日归档，有真实记录才显示历史灰柱，不受成交量 actualDate 回退影响。无记录不借最新值，缺 Moomoo 不静默换 Cboe；详见下方每日 OI 归档。

## 云端与发布边界

本机 SQLite 与云端 D1 名单独立，不自动同步。云端 localhost 无法访问个人桌面 Host。直接 WebAPI 可用于另行托管的后端，但需要部署实际采集路由并配置服务端 secret；本版托管 Worker 尚未接入 WebAPI 采集路径，监测返回 `LOCAL_BACKEND_REQUIRED`；仅配置一个 token 不会自动新增云端采集能力。新本机包不自动更新既有 Sites 第 12 版。

GitHub Pages 是静态介绍和下载页，不能运行 Node、SQLite 或持有私人 token。持续云端监测需要单独部署并验证。桌面桥尚未实现，不能把整个券商 Host 暴露到公网。

## PCR 与验收口径

原单日、20／60 日成交量 PCR 仍来自 OCC／Cboe，滚动窗口仍用 Put 合计除以 Call 合计。桌面局部与 WebAPI 供应商汇总不替代这些历史统计。所有 PCR 都不等于市场空头人数、资金占比或未来涨跌概率。

完整规则及验收见 [产品规格](PRODUCT_SPEC.md)。代码和受控测试通过不代表供应商凭证、权限或实时数据已验证；运行状态必须通过实际只读查询核实。

官方参考：[标的汇总](https://open.moomoo.com/api/quote/derivatives/option-underlying-overview)、[异动事件](https://open.moomoo.com/api/quote/derivatives/option-event)、[接入与鉴权](https://open.moomoo.com/api/overview/getting-started)、[权限](https://open.moomoo.com/api/overview/api-authority)。


### 本机验证记录（2026-11-25）

桌面监测已返回 40 份所选合约的基础报价，缓存及合约 OI 观察可保存。部分成交量／OI 缺失，因此状态为 partial，PCR 留空；逐笔查询超时，完整逐笔及实时权限尚未核实。独立完整快照仍超时。WebAPI 已完成只读 OAuth 并将规范化授权存入 DPAPI；标的汇总成交量／OI PCR 和异动事件已有真实响应。单页分页未完导致 partial，汇总精确行情时点及 OI 结算日仍未知；无需桌面端，但本机后端仍需运行。这不代表托管 Worker 已接入或完整成交带／实时权限已验证。


v0.2.2 独立页与首页 OI 浏览器验收已通过，覆盖 320px 中英、偏好／名单复用、历史无 OI、来源标签及独立 OCC／OI 状态。2026-11-25 手动汇总刷新为全部请求标的返回完整 Put／Call OI，0004 新缓存表已应用；具体 OI 结算日仍为 null。不因此新增实时性、完整成交带、OI 历史序列或覆盖保证；安装／发布另行核实。


## 未发布：本机一次性报价复核

新增独立 `scripts/capture-quote-review.mjs`，读取私有配置的股票、期权及价差双腿，不增加网页 worker 接口或桌面 CLI allowlist。沿用项目外 Windows DPAPI 的 `quote:read`；不查询账户／持仓、不交易、不自动 AI 分析。工具只 POST 固定官方 `/api/v1.0/quote/snapshot` 和 `/api/v1.0/quote/stock-quote`，不靠网页保持开启。

私有配置字段为 `jobId, scheduledAt, cutoffAt, timeZone, outputDirectory, underlyings, contracts, spreads`；时间含 offset／Z、时区为 `America/New_York`，输出目录为项目外绝对路径。标的项为 `{code,label}`，价差为 `{label,longCode,shortCode}`。截止须晚于预定且在 24 小时内；股票／期权／价差分别为 1–8／1–24／1–8 项。目前价差只支持同标的同到期、长腿高行权价的熊市 Put，双腿须已列在 contracts。当前用户的实际日期、代码与运行结果不写进公开示例。

```powershell
node scripts/capture-quote-review.mjs --config "C:\private\quote-review.json" --dry-run
powershell -NoProfile -File scripts/register-quote-review-task.ps1 -ConfigPath "C:\private\quote-review.json" -DryRun
```

`--dry-run` 不读凭证、联网、写结果或通知。正式默认运行仅在私有预定窗口内联网；`--capture-now` 为明确标 manual 的手动测试，`--notify` 才启用本机弹窗／打开报告。注册脚本可传 `-NodePath`；通知脚本为 `show-quote-review-reminder.ps1 -ReportPath <本机html> -Status <状态>`；独立提醒验收可加 `-Test -NoOpen`，不打开报告。

Windows 任务为当前用户一次性 InteractiveToken／Limited，以隐藏 `run-quote-review-task.ps1` 包装 Node `--config --notify`，无需网页服务器。需用户登录；锁屏时提醒可能解锁后才看到。UTC StartBoundary、预定后 24 小时 EndBoundary，允许电池、IgnoreNew、限时 5 分钟；不设置网络就绪前置，以保留网络失败提醒。WakeToRun 只尝试唤醒睡眠，关机不执行。错过后只在 cutoffAt 前补跑；过期保存 missed 并提醒，不拿之后报价冒充预定抓取。计划、实际抓取、供应商时间分开；缺失／过期行情如实标示。

静态价差估值按长腿 Ask−短腿 Bid 计算新开指示支出、长腿 Bid−短腿 Ask 计算平仓指示收入；双腿可能不同步，均不保证成交。金额只用披露的合约股数，缺失不默认 100；不含费用／滑点。供应商快照时戳超过 5 分钟、日期异常／缺失等均警示，盘口独立时间／数量及真实延迟未核验。

输出为私有 `outputDirectory/runs/<实际时间>/snapshot.json`、`index.html` 和 `latest.html`，含 success／partial／unavailable／missed 及来源错误。配置、报告、日志与授权包不进入 Git／发行包。此新增仅本机未发布，现有 v0.2.3 不变；注册与未来实际触发需分别核实。


## v0.2.4 本机未发布：任务状态与报价归档

顶部“定时复核”打开 `/quote-reviews.html`，从本机只读 `/api/quote-reviews` 查看真实 Windows 任务状态／下次运行、最近结果及按实际运行日期（America/New_York）筛选分页的历史报告。配置预定时间、调度器状态和运行结果分开；最近 manual 测试不代表定时任务已完成，未知／失败不合成为正常。

`scripts/quote-review-archive.mjs` 由本机 preview 挂载，只读取已有私有 `local-data/quote-reviews`。详情及 JSON／HTML 只允许已发现的 job/run，Origin／Host、越界路径／符号链接均校验，错误不回显私有绝对路径或原始配置。页面仅查看／刷新状态，不编辑、删除、执行任务或重新抓行情，也不新增交易／账户权限。

保留手动、定时、失败和错过结果，无自动清理；显示有统计范围说明的本机归档次数和总字节数。结果未上传 GitHub，不是仓库空间用量；GitHub Pages 和云端显示仅本机支持，不显示私人 Windows 数据。实际任务／运行／供应商时间分别展示，历史快照不称实时。本机 v0.2.4 安装／重启及实际 Windows 状态、已有归档读取已于 2026-11-26 核实；中英窄屏和 GET-only 页面检查通过。版本仍未发布 GitHub，v0.2.3 发行物不变；未宣称未来任务已执行。

| 本机 GET | 契约 |
| --- | --- |
| `/api/quote-reviews` | 可选 job、date（ET actualStartedAt 日期）、mode（manual／scheduled）、offset、limit（默认 25，1–100）；jobs／storage 全量，只有 runs 过滤分页。 |
| `/api/quote-reviews/jobs/{jobId}/runs/{runId}` | 返回已发现 run 的安全 report 与 bytes；不接受任意文件路径。 |
| 同路径 `/snapshot.json` | 下载白名单 JSON 结果，不读取私有配置或其他文件。 |
| 同路径 `/report.html` | 由安全结果重新渲染 HTML，绝不直接服务归档原文件。 |

scheduler 含 state、nextRunAt、lastRunAt、lastTaskResult、available，查询缓存 30 秒；索引 checkedAt 不是供应商报价时点。storage 的 totalBytes／runCount／jobCount／unreadableRunCount 只统计每次 run 的 snapshot.json+index.html，不含私有配置／注册回执／latest 指针。不可读 run 保留 unreadable／unknown 占位。


## v0.2.5 本机未发布：市场解读报价

新增只读 `GET /api/brief-quotes/status` 和 `GET /api/brief-quotes?symbols=...`，优先已配置的授权 WebAPI，只有云凭证未配置才走桌面；已配置云端失败不静默回退。每批最多 20 个严格股票／ETF，15 秒分来源缓存与并发合并，保留同来源的原始报价／成功时点，不用检查时间冒充行情时刻。WebAPI 固定官方 stock-quote 路径，沿用 quote:read，不访问账户、持仓或交易，也不扩展任意命令入口。

解读页分来源列状态：红色明确失败原因／来源，琥珀表示缺口／冷却／旧数据，蓝色表示正常或等待；桌面报价超时不等于 Cboe 或宏观失败。日历成交记录与 OI 可用性也独立：至少一个标的有记录不保证名单齐全，历史日期不借当前 OI，最新 OI 缺失解释原因而非补零。

status 响应为 provider／configured／connectionStatus／readOnly:true。quotes 响应为 provider／checkedAt／status（current 或 partial）及 data.basic_qot_list；行中 security.code 使用普通代码、market 为 11，cur_price 为报价，update_timestamp 为秒级数据更新时间，不是某笔成交时间；checkedAt 也不代替行情时点。盘前／盘后／隔夜只保留实际提供的 price，云响应没有各时段独立时戳时不借常规时间补造。current 只代表本轮请求必要价格／时间字段齐全，不代表实时。上游失败为 `{provider,checkedAt:null,error,code}`，使用脱敏固定说明及安全错误码。鉴权／权限对应 401／403，超时 504，限流 429、无数据 404，未配置／本机不可用 503，其他失败 502；参数错误 400、跨源／错误 Host 403、非 GET 405。响应为 JSON、Cache-Control:no-store、X-Content-Type-Options:nosniff。前端仅保留同来源旧价格和原时戳，不跨源回填。

云端同路径返回 501、supported:false、LOCAL_BACKEND_REQUIRED，不读取个人电脑。

日历 n/N 按完整 items，不随分类过滤；只计合法 p/c 日记录，按钮 title／aria 及缺失代码说明不把有记录当作全齐。OI 原因位于柱图前，历史实际日期／最新成交日分别说明；最新无 OI 或 Call OI=0 仍空。

本机 v0.2.5 的实际 WebAPI 报价 GET、旧桌面超时独立归因、同源时间保留及双语页面已验证；正常 Cboe／等待来源不再被泛称失败。日历完整与部分覆盖、历史 OI 留空／仅最新视图提示及 title／aria 一致，892／320px 均通过，未触发来源刷新或名单写入。保留 v0.2.4 和公开 v0.2.3；未发布 GitHub，不声明实时权限或已完成新版本部署。

## v0.2.6：每日 OI 归档与历史灰柱（本机未发布）

`scripts/oi-history.mjs` 与迁移 `0005_oi_summary_snapshots.sql` 按 `(symbol,provider,checked_at)` 只追加规范化观察。每次有效查询（包括手动刷新和每日抓取）保存原 checkedAt、纽约 observationDate、Put／Call OI、PCR，以及可确认的 oiAsOf／oiAsOfConfirmed。当前汇总接口没有确认结算日，仍显示未知；不由 T−1 或查询日推算。零 Put 可保存，零 Call 的 PCR 为空，缺侧不拼接；刷新失败不把旧值重记为今天。

| 接口 | 契约 |
| --- | --- |
| GET `/api/oi-summaries/history?symbols=NVDA,MU&date=2026-11-25` | 精确查询所选纽约查询日各标的最后真实观察；archived、observationDate、原 checkedAt、可确认结算日分别返回。无记录字段为空，不向前／向后借值。 |
| GET `/api/oi-summaries/history?symbols=NVDA,MU` | 最近 3660 日日期索引、每日 count／completeCount、全量总快照数及首尾日期；最多 40 个唯一合法标的，同源只读，不联网。首次可幂等导入旧缓存的原始时间，但不补造未保存历史。 |
| GET `/api/oi-daily` | 只读真实调度状态／下次运行、17:30 ET 计划与最近实际抓取／保存数量；30 秒调度缓存，刷新页面不执行任务。manual 与 scheduled 分开，未知不标成功。 |

首页灰柱读取 requestedDate 对应归档；成交量在休市／未发布日可显示此前实际交易日，但不会改变 OI 查询日；早于成交量覆盖起点的 OI 归档日仍可选择，此时成交量为空而不借未来记录。蓝色日历标记为成交记录，灰色标记为保存过 OI，均可仅覆盖部分名单；记录不等于能计算全部 PCR。旧 Cboe 种子、最新缓存、逐合约 OI 及新汇总历史互相独立。静态 Worker 的历史／每日状态返回 501／supported:false，不读取本机私有目录。

独立任务名为 `PCR-OI-Daily-Snapshot`，默认每个日历日 **17:30 America/New_York**，执行时读取 SQLite 中 local_user 当前名单，最多 40 标的／2 并发，仅请求 option-underlying-overview。周末／假日可能保存相同数值；缺失仍留空。按日成功后去重，失败最多三次、间隔至少 15 分钟；任务锁避免并发，空名单不抓取。运行摘要保存在数据库同级私有 `oi-daily`，数值追加到 SQLite；不自动清理或上传。

从项目目录可先检查注册配置，再注册：

```powershell
powershell -NoProfile -File scripts/register-oi-daily-task.ps1 -DatabasePath "C:\absolute\private-data\pcr.sqlite3" -DryRun
powershell -NoProfile -File scripts/register-oi-daily-task.ps1 -DatabasePath "C:\absolute\private-data\pcr.sqlite3"
node scripts/oi-daily.mjs --database "C:\absolute\private-data\pcr.sqlite3" --mode manual
```

最后一条是真实手动抓取，不是 dry-run。Windows 必须使用 Eastern 时区以随夏令时变化；任务为当前用户 Interactive／Limited，需登录、电脑开启和网络有效。可尝试睡眠唤醒／可用后补跑，但关机不能执行；补跑只记录当时实际查询日，不补造错过日。无需网页或预览后台常开；使用有效云 WebAPI 时无需 moomoo 桌面。既有周五一次性报价任务不被替换。本机继续用 DPAPI OAuth 按有效期刷新，失效需重新授权。

## v0.2.7：Hugging Face 云运行与访问控制

参见[中文托管说明](HUGGING_FACE.md)。云端使用Docker Space与独立密码／会话网关，Node22／Python3；不暴露桌面接口、OAuth 管理、账户或交易。使用新客户端的独立 quote:read 授权，本机 DPAPI 和现有刷新状态不迁移。

| 编号 | 授权与持久化契约 |
| --- | --- |
| MCA-001 | 新部署使用 MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON 加密引导及独立 PCR_CLOUD_AUTH_KEY（64位十六进制 AES-256 Secret）；原始令牌仅在受控内存中处理，不作为新部署的环境变量。PCR_CLOUD_AUTH_FILE 指向经验证私有挂载上的密文。 |
| MCA-002 | AES-GCM 密文包括 nonce／tag；保存上一密文供有效恢复。本地容器文件锁将预览及调度进程的刷新串行化；有效访问令牌直接使用，真实到期或401才按需要刷新。刷新授权到期或撤销需官方重新确认，不保证无限期授权。 |
| MCA-003 | 兼容原始 MOOMOO_WEBAPI_OAUTH_JSON 与静态 ACCESS_TOKEN／SCOPE／EXPIRES_AT；新部署不采用这些模式。静态授权不能自动续期；权限仍严格为 quote:read，不接受 trade／写入能力。 |
| MCA-004 | HF Bearer与应用头分离。普通会话12小时HttpOnly／Lax；HF HTTPS *.hf.space采用__Host-pcr_embed_session Secure／SameSite=None／Partitioned。指定HF父域兼容登录须5分钟签名CSRF Cookie与隐藏值；API／退出等修改严格应用同源、null拒绝，CSP限制父域。登录页strict-origin-when-cross-origin保留真实Origin；凭证头均剥离。 |
| MOD-001 | 新迁移0006 的 oi_daily_state／oi_daily_runs 事务保存实际完成报告、重试和同日去重，既有文件只作兼容镜像。SQLite优先，旧文件不覆盖新状态；数据库备份恢复可在临时目录丢失后保留原执行信息。 |

云活动 SQLite 仍在容器本地，挂载的私有 Storage Bucket 存一致备份／校验清单及独立位置的加密授权。备份与授权密文不能提交源码。独立云授权的创建不扩大行情查询端点，也不迁移本机账户、持仓、数据库或Windows任务。

个人PRO账号通过官方授权，当前公开Space运行游客PCR／更新；实际HTTP、独立行情及恢复已验证。CPU Basic可闲置休眠，未开收费Jobs／硬件，不保证全天候执行；本机17:30和周五任务独立，GitHubv0.2.3不变。

## 云端实际进展与写后备份

独立云端PKCE授权已加密写入HF Secret，并实际查询／保存2026-11-26的7条OI观察；结算日期仍未获供应商明确确认。私有Bucket含SQLite备份与分开保存的授权密文。应用地址为 https://rexymiao-pcr-market-watch.hf.space ，登录表单／会话、真实Edge四项及暂停更新后的名单／历史恢复已通过验证。

SQLite已提交写入发固定非敏感IPC；父进程500毫秒合并备份，期间再写则再备份，启动／小时／每日／退出排空也保存。突然崩溃仍可能丢最近未完成备份的变化。更新应先确认最新备份，再暂停到PAUSED后上传／启动，避免HF新旧Pod重叠导致旧恢复。云每日17:30已启用，未来触发未观察；无额外付费Jobs或硬件升级，本机数据／任务独立保留。

### 当前公开范围

此前入口-only阶段要求所有数据登录；该阶段已被当前游客PCR查看／更新模式替代。最终HF匿名HTTP验收已通过：无HF令牌／Cookie／密码的首页、图表、公开API和来源更新200；公开settings为cloud，私人页面／API401，未发布合法标的403，跨源403，所有者表单303及会话API200。实际更新7／7且紧接429，私有Bucket、CPU Basic及既有归档保留。最终实际HF游客Edge24项亦已通过并单独记录，不能由HTTP成功替代；未来17:30执行仍未观察。

## 游客PCR查看与来源更新（v0.2.7，远程HTTP已验证）

本节按用户明确选择替代此前“仅公开入口、数据均需登录”的阶段说明。PCR_PUBLIC_VIEW=1为本次HF部署配置；通用Docker默认0，不能据此自动改变其他部署。

| 编号 | 权限与数据契约 |
| --- | --- |
| PUB-005 | 游客免密码查看PCR图表、历史日期、指标／区间及中英文，并可点击更新来源数据；公开偏好readOnly:true、canRefresh:true。只读指不能修改名单、分类、分组和市场参考；不是禁止刷新市场观察记录。所有者编辑仍需登录。 |
| PUB-006 | 新增自定义标的／OI公开查询仅限当前所有者已发布关注名单及市场参考。基础 /api/watchlist／refresh 保留已在通用源码公开的默认七标的资料，以维持前端数据契约；自定义异常标的在成功、错误及保留值响应中均剔除。该例外不是任意代码查询权限。 |
| PUB-007 | 公开名单只投影标的代码和通用分类／分组，不暴露私人组名、所有者身份、账户、持仓、凭证、原始moomoo报价／异动或管理状态。私人页面和配置写接口不进入游客白名单，未发布标的查询拒绝。 |
| PUB-008 | 每种来源更新操作共享60秒冷却及进行中合并，不按访客/IP重新预算。同签名并发复用结果，冲突／冷却返回429及重试时间；所有者与供应商原有保护仍适用。更新受固定路径、参数、标的、响应投影限制，不能代理任意API或绕开费用边界。 |
| PUB-009 | 游客Cboe普通GET强制内部x-pcr-cache-only:1，只读已验证快照、seed或已加载历史；日期缺记录返回200、snapshot:null／refresh_required，不借其他日期。无date取最近实际缓存日。仅显式Cboe POST更新可发起来源读取，受60秒预算，日期切换不消耗该预算。 |
| PUB-010 | 更新可能追加真实OI／历史记录，但保留原查询时间、真实交易日及已确认／未知结算日；等待发布、冷却、来源失败或假日不能把旧值冒充新数据。公开访问不改变PCR计算口径和多空含义。 |

最终HF匿名HTTP验收已通过：无HF令牌／Cookie／密码的首页、图表、公开API和来源更新200；公开settings为cloud，私人页面／API401，未发布合法标的403，跨源403，所有者表单303及会话API200。实际更新7／7且紧接429，私有Bucket、CPU Basic及既有归档保留。最终实际HF游客Edge24项亦已通过并单独记录，不能由HTTP成功替代；未来17:30执行仍未观察。

## Cloud内部缓存持久化修正（v0.2.7，实际恢复已验证）

修正前的失败记录：当时名单、28条OI观察及加密授权可从私有Bucket恢复，但Node的Core／Cboe Cache API只有内存，重启回seed。此前HTTP更新和名单／OI恢复**当时不能证明Core／Cboe持久化**。该失败作为历史保留；迁移0007的修复与下面另一次实际无刷新恢复才建立当前成功结论。

| 编号 | 修复契约 |
| --- | --- |
| DCACHE-001 | 迁移0007_worker_cache.sql新增worker_cache表，压缩正文列body_gzip_base64，总迁移8项。SQLite Cache API仅在cloud preview安装，不改变Windows或原生Worker策略，不改旧迁移及OI／名单数据。 |
| DCACHE-002 | 仅接受四类内部键：complete-v1、symbol-v1/{ticker}、cboe-v1/{latest或日期}、cboe-history-v1/all（均位于/__pcr_internal_cache__/）。仅存200、public且有max-age的JSON响应；原文≤4MiB、gzip≤512KiB、Base64≤700KiB，最多128条，complete／Cboe总历史／latest优先保留。按max-age过期、最多30天；无公开任意缓存入口，不保存认证／Cookie／管理接口。 |
| DCACHE-003 | put克隆Response后存储，match返回新的Response；保存原JSON、响应元数据及原checkedAt／asof，不在恢复或读取时改成新查询时间。缺失／过期／超限按缓存缺失处理，不伪造数据或借别日补值。 |
| DCACHE-004 | 该缓存表进入既有一致性SQLite备份，写入仍触发受控合并备份；保持私有Bucket。内部缓存不是无限期OI归档，不能用缓存回收规则删除独立OI历史。 |
| DCACHE-005 | 真实恢复验收须先成功更新Core／Cboe并确认备份，再PAUSED→上传／启动；恢复后不再POST刷新，比较Core数据日、Cboe快照日期／原checkedAt及历史actualEnd／行数。不能靠重启后重新联网补回伪称恢复。 |

当前修复及实际云端无刷新恢复已通过。功能源码e4a1282、总计8项迁移；实际将Core／Cboe数据日更新到2026-11-25（Cboe历史252行），确认私有Bucket有12份一致数据库及12份清单后，PAUSED→同提交重启。新进程仅公开GET，coreDate／coreCheckedAt／coreRowsSHA、cboeDate／cboeCheckedAt／cboeSnapshotSHA／cboeHistoryEnd／cboeRowCount／cboeRowsSHA全部与重启前一致，35条OI完整保留，未用重启后刷新补回。完整npm test的78项Node测试及模型／来源检查通过。游客与所有者权限、CPU Basic和无额外付费资源不变，未来17:30执行仍未观察。

## v0.2.9：只读授权健康元数据

| 编号 | 接口与权限 |
| --- | --- |
| AUTH-DIAG-001 | 各既有运行时授权适配器提供getAuthorizationStatus安全投影，供所有者GET /api/oi-daily使用；不新增moomoo能力或公开原始接口，不查询账户／持仓，不改变现有quote:read授权。 |
| AUTH-DIAG-002 | 仅显示configured、available／refresh_needed／reconnect_required／not_configured／unavailable状态及安全到期元数据。访问令牌到期或接近到期、但刷新授权可用时标refresh_needed；未知refreshExpiresAt保持null／refreshExpiryKnown:false，不能伪造到期时间或永久授权。 |
| AUTH-DIAG-003 | 查看状态不调用getAccessToken、不发网络验证、不触发续期／写入授权包或采集。Windows、加密云端及旧静态兼容路径各按已有授权来源读取；失败为安全未知状态，不回传token、密钥、clientId、账户上下文、路径或原始错误。 |
| AUTH-DIAG-004 | 任务执行仍独立按实际授权及网络调用只读行情；状态available不是本次联网成功，任务Ready也不是采集成功。保留新旧会话边界、私有Bucket、独立加密密钥、OCC／Cboe／moomoo来源分别显示，以及原本机报价复核任务。 |

完整诊断字段、30日／5分钟边界与首次实际scheduled验收见[托管说明](HUGGING_FACE.md)及[产品规格](PRODUCT_SPEC.md)。v0.2.9功能源码daaf0dd已完成实际云端只读诊断验收：当前authorization=refresh_needed为可续期的保存元数据，health=waiting、scheduledEvidence=unobserved，没有为查看状态请求行情、续期或制造定时报告；私人诊断对游客401。原授权密钥／凭据与42条OI保持，未来17:30自动执行仍未观察。

## v0.2.14：供应商 Gamma／GEX 与 Max Pain

独立页面为`/option-structure.html`，不在PCR首页启动期权轮询。沿用既有后端独立`quote:read`授权与实际行情权限，无需保持moomoo桌面客户端打开；本机／云端后端本身仍须运行。官方文档列出接口不代表每个账号都已获得权限，连通性以实际结果为准。

| ID | 接口与规范化契约 |
| --- | --- |
| OSAPI-001 | 精确扩展固定官方HTTPS行情allowlist：`GET /api/v1.0/quote/{code}/option-expiration`、`GET /api/v1.0/quote/{code}/option-gamma-exposure`与`GET /api/v1.0/quote/{code}/option-max-pain`。只接受经过校验的美股／ETF标的和日期参数；浏览器不能指定host／path、传凭证或调用账户／持仓／交易。 |
| OSAPI-002 | Gamma本机网站接口：GET `/api/gamma-exposure?symbol=QQQ&window=30d`；POST `/api/gamma-exposure/refresh`接收`{symbol,window}`。`window`为nearest／7d／30d／all。返回美东`calendarDate`、`currentCalendarDate`、`availableExpiries`、`selectedExpiries`、`nearestExpiry`，以及`base`／`withoutNearest`两组各自的status、checkedAt、providerUpdatedAt、underlyingPrice、callWall、putWall、zeroGammaPoints、items(strike,callGex,putGex,netGex)、profile(spot,gex)、errors和stale。 |
| OSAPI-003 | Max Pain本机网站接口：GET `/api/max-pain?symbol=QQQ&expiry=YYYY-MM-DD`；POST `/api/max-pain/refresh`接收`{symbol,expiry?}`，省略到期日选最近当日／未来可用日期。返回单到期日`maxPain`和`items(strike,callPain,putPain,totalPain)`，附availableExpiries、实际日期、查询时间、可确认的源更新时间及独立状态。缺字段保持null，不把空值转0。 |
| OSAPI-004 | 官方GEX蓝线由`profile_points[].spot_price`／`aggregate_gex`等字段提供；单档GEX由items返回。只规范化合法、有界的字段，不把原始响应或供应商错误整包转发。墙／零点只使用源返回值；未披露方向权重、单位、OI结算时间不自行补写。归一化不意味着已获得真实做市商库存或每1%美元口径。 |
| OSAPI-005 | 到期列表按纽约当天及以后日期筛选，7／30日为含端点的自然日窗口，不宣称当天收盘后仍可交易。all请求整个供应商范围；排除最近一期必须准确传剩余集合。`expire_time`官方上限256字符；超限报告`PROVIDER_FILTER_LIMIT`比较不可用，不换成30日、不截断、不分批拼接假设股价网格。仅一期排除返回`NO_REMAINING_EXPIRIES`且不发空过滤请求。 |
| OSAPI-006 | GET只读独立有界进程缓存；没有缓存不连接行情源，重启不承诺恢复这些新快照或历史归档。显式POST按Gamma／Max Pain操作分别共享60秒冷却并合并同签名并发；两项可独立刷新。失败只保留相同签名有效旧观察及原时点，跨日stale不改旧calendarDate。现有数据库、OI归档和Core／Cboe持久缓存不迁移、不变更。 |
| OSAPI-007 | 公共响应只投影当前settings实际发布的名单／市场参考集合；旧Core默认七项例外不扩展到新接口，不自动开放已移除的默认标的或SPY／QQQ／DIA。未公开合法ticker拒绝；同源、身份头过滤、owner-only配置与现有公开刷新预算保持。字段带模型／范围／时点说明，不能暴露授权包、账户上下文、源错误、路径、私人报价归档或运行配置。 |

动态含义：GEX会随标的价格、时间、IV、OI／估计仓位和所选期限变化。Max Pain为固定OI／范围下理论到期内在价值合计最小点，股价变化本身只改变现价与其距离，不直接改变固定OI痛点；OI／合约范围更新可能改变痛点。两者不证明价格将到达某点，且不同请求的providerUpdatedAt可能明显不同；一次成功检查不等于供应商刚更新计算。

2026-11-26本机来源探测：既有只读授权已对QQQ到期列表、30日GEX、30日排最近、全期限GEX和Max Pain取得HTTP200／ret_code0。当时30日返回12期、全期限未来31期，后者排最近过滤超过256字符，必须按OSAPI-005显式不可比较。Max Pain源更新时间较早，已与查询成功时点区分。这是来源接口探测，不等于网站路由／浏览器／本机安装／HF已发布；其验收另行记录。

官方参考：[到期日](https://open.moomoo.com/api/quote/derivatives/option-expiration)、[Gamma敞口](https://open.moomoo.com/api/quote/derivatives/option-gamma-exposure)、[Max Pain](https://open.moomoo.com/api/quote/derivatives/quote-option-max-pain)。功能与验收见[产品规格](PRODUCT_SPEC.md)。

## v0.2.17：独立持久结构归档接口与任务

本节扩展历史存储，旧OSAPI-006的进程缓存仍用于实时视图；读取新的SQLite归档不是恢复实时缓存。沿用现有三个quote:read官方来源接口，不新增账户／持仓／交易权限。Node本机／HF后端实现归档；静态Pages不能调度，独立Worker没有此Node采集服务时返回503，不冒称已接通。

| ID | 接口、存储与限额 |
| --- | --- |
| GARCH-API-001 | GET `/api/structure-archive/index?symbol=QQQ`返回该公开标的日期摘要；GET `/api/structure-archive?symbol=QQQ&date=YYYY-MM-DD`返回当日headers／runs；同一路径使用`symbol&id`读取一条完整record／payload。date与id必须二选一；历史GET仅DB读取。日期索引最多3650日，当日headers最多1000条并显式truncated；run摘要最多50条，不承诺其覆盖全部历史运行。 |
| GARCH-API-002 | 0008迁移新增structure_snapshots（gzip／base64及原始／压缩字节计数）、structure_daily_runs和structure_daily_state；结构快照有UPDATE／DELETE拒绝触发器及(run_id,kind,symbol,scope_kind,scope_key)唯一性，不自动删归档。记录包含observationDate、kind、symbol、scopeKind／scopeKey、expiries、queriedAt、providerUpdatedAt、未知结算日及status／units／来源；完整payload是经验证的模型字段，不是原始授权或任意供应商响应。 |
| GARCH-API-003 | GET `/api/structure-daily`仅DB及安全授权／调度元数据：scheduledTime=17:45、timeZone=America/New_York、monitoringEnabled／Since、nextRunAt、lastRun、lastScheduledRun、scheduler、authorization安全状态、archive计数及limits。状态读取不联网、不续期、不采集；run只投影聚合计数，不公开symbol计划／内部路径。running按SQLite未过期lease判断，兼容云父进程与Windows独立CLI；过期且仍标running的run仅只读投影为interrupted／retryEligible，GET不写库。所有者POST `/api/structure-daily/capture`接受JSON`{}`，202／queued只表示接受，随后读状态确认真实结果；游客不能触发整批任务。 |
| GARCH-API-004 | 单run最多600次来源请求／20分钟，请求最少间隔2000毫秒；持久SQLite lease为120秒并逐步续租。scheduled每天最多3次、间隔15分钟；同日checkpoint仅补未完成范围，manual不同run可追加但共享60秒冷却。供应商账号／端点额度可能更低，HTTP200／ret_code=-11仍为限额失败；实际预算／失败覆盖不能冒称全量。 |
| GARCH-API-005 | 每条原始规范化payload最多1,500,000字节，gzip最多512,000字节；超限记录PAYLOAD_LIMIT，不静默裁掉曲线或以旧快照代替。仅实际fresh checkedAt、不早于本次请求／run且与observationDate同一美东日的有效current／partial观察可保存；providerUpdatedAt可以更早或未知。跨日请求返回也会阻止落旧日。仅一期排最近为notApplicable，不发空过滤all请求、不造快照。 |
| GARCH-API-006 | 采集按已发布名单／参考并集，每个当日返回的0—30自然日到期逐期查询GEX与Max Pain，另查30d和30d_ex_nearest GEX；不查账户、不把汇总OI当全链，也不把期限平均。所有历史公开GET按当前已发布symbol投影，移除ticker保留私人记录但游客旧id不可绕过；嵌套run摘要只返回安全聚合字段。 |

Windows先运行项目以创建／迁移个人数据库，并配置独立只读授权。用实际数据库路径和Node路径先检查再注册：

```powershell
powershell -NoProfile -File scripts/register-structure-daily-task.ps1 -DatabasePath "..\local-data\pcr.sqlite3" -NodePath "C:\Program Files\nodejs\node.exe" -DryRun
powershell -NoProfile -File scripts/register-structure-daily-task.ps1 -DatabasePath "..\local-data\pcr.sqlite3" -NodePath "C:\Program Files\nodejs\node.exe"
```

注册器检查Windows Eastern Standard Time时区、同一用户Interactive／Limited、独立PCR-Structure-Daily-Snapshot每日17:45、错过可用时启动／尝试唤醒、禁止重复并发、15分钟重启／30分钟任务上限。已存在但身份／命令不同的任务拒绝覆盖。`-DryRun`不读行情／凭证、不创建任务；仅`--register-only true`启用DB监测元数据，不自行创建Windows任务。standalone runner使用`node scripts/structure-archive.mjs --database "实际路径" --mode scheduled`，无需网页、预览后端或moomoo桌面；用户登录／电脑／网络／有效授权仍必需，关机不执行。不要为测试手动伪造scheduled模式的定时证据。

云端17:45计时受进程和CPU Basic休眠约束；`PCR_STRUCTURE_DAILY_ENABLED`未设置时跟随既有OI每日启用状态，可设0单独关闭结构定时。启用不保证未来采集，晚唤醒只记今天。实际来源查询时间、源更新时间、日期覆盖、手动／定时报告与已校验私有备份分开核查。详细规则见[产品规格](PRODUCT_SPEC.md)GARCH及[HF说明](HUGGING_FACE.md)。

## v0.2.18：减少历史查看的重复读取

| ID | 后端读取与边界 |
| --- | --- |
| PERF-API-001 | `/api/structure-daily`的daily state、最新run、最新scheduled run、归档计数／最新查询时间及lease在常规状态下由一次只读SQL取得，替代五次SQLite桥接调用；使用`structure-status-read.mjs`，不使用会获取写锁的BEGIN IMMEDIATE批处理。为保留既有2MB桥接响应边界，异常大checkpoint按已确定run id回退到有界单独读取，总调用最多3次，不拼接成超限响应。输出字段、缺失语义、安全run投影及按当前时钟计算的未过期lease／interrupted判断保持一致，GET不写库、不查询供应商或续期。 |
| PERF-API-002 | Windows结构任务元信息的成功查询可在进程内缓存30秒，并合并同一时刻的查询；失败不缓存。`scheduler.metadataCache`如返回，包含`status`（fresh／cached／not_cached／unavailable）、实际元信息检查时间checkedAt、非负ageMs、ttlMs（可缓存时30000，否则0）及coalesced布尔值。该缓存只涵盖Windows任务计划元信息，最多延迟30秒反映外部任务配置变化，不缓存数据库run／lease／覆盖状态、授权状态或实际行情；失败不得用旧成功值冒充。它不改变独立任务执行、云端计时、每日17:45及其真实scheduled证据；客户端显式重载不承诺绕过该30秒元信息缓存。 |

浏览器缓存的键、容量、有效期与失效规则见[产品规格](PRODUCT_SPEC.md)的PERF-018。现有历史列表仅读headers，单条id读取才解压payload；本次不改变不可变记录、数据库迁移、公开symbol投影或quote:read权限，不以增大来源请求速率换取页面速度。
