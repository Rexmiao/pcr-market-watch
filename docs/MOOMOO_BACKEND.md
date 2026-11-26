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

后端根据实际返回的到期信息刷新 AccessToken。供应商可以撤销授权，刷新凭证也会到期，不能承诺永久连接；过期／撤销后在官方页面重新授权。另一台电脑或 Windows 用户需重新配置。`scripts/configure-moomoo-webapi.mjs` 是同一 OAuth 连接流程的兼容入口；不提供手动 token 或环境变量 token 模式，不把 token 写入 `.env`、源码或启动脚本。拒绝额外权限能力；合法账户上下文选择器不算新增能力。

凭证只在后端内存及供应商授权环境／请求头中使用，不进入网页、URL、命令行、数据库配置、日志、Git 或发行包。WebAPI 只访问固定官方 HTTPS 主机及两个只读行情路径，不接受用户指定的外部地址。配置存在不代表成功连接或实时权限已验证。

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

OI 的 T−1 说明不是已核实的具体结算日；实际结算日未披露就保持未知。本地 SQLite 缓存按实际来源隔离；desktop 逐合约 OI 使用 option_monitor_oi，WebAPI 返回事件中去重后的逐合约 OI 使用独立 option_monitor_webapi_oi。只比较同源、同合约／范围的实际观察日期；WebAPI 标的汇总 OI 历史尚未实现。缺历史留空，增减不确定证明开仓／平仓、行权或多空人数变化，首页最新 OI 汇总与原 Cboe 快照可明确切换，均与这里的逐合约观察分开。

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

只在现有 `view.isLatest`（actualDate === data.asof）时显示灰柱；这是最新成交量视图，不能当作 OI 日期。历史灰柱空，所选来源和时间始终分开，缺 Moomoo 不静默换 Cboe。

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
