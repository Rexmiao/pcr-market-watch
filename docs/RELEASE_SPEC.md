# 发布与安装规格（v0.2.3）

**简体中文** | [English](RELEASE_SPEC.en.md)

## 交付物

下表同时说明当前 `main` 仓库／介绍页与固定发行包。中英文本、GIF 及介绍页可以晚于首次发行；`v0.1.0` ZIP 的实际文件以该标签及附件为准，不保证包含 `main` 后续新增的文档或介绍页功能。

| 交付物 | 内容 | 运行位置 |
| --- | --- | --- |
| GitHub 源码 | `web/`、`worker/`、`db/`、`drizzle/`、`scripts/`、`data/`、`docs/`、构建配置 | 用户自行安装开发依赖并构建 |
| Windows ZIP | 对应版本标签的源码、`dist/server/index.js`、`start.cmd`、`start-local.mjs` | Windows 本机，Node.js 22+ 与 Python 3 |
| README | 默认英文 `README.md`、完整中文 `README.zh-CN.md` 及完整英文兼容副本 `README.en.md`；英文实际界面截图、自动播放 GIF、功能、安装方式及对应语言的 Spec 入口 | 仓库首页默认显示英文 |
| 双语规格 | 产品、Cboe 来源口径、moomoo 后端及发布安装规格的中英文版本 | `docs/`；同语言文档互相连接 |
| GitHub Pages | `site/index.html`、`site/locale.js`、样式及本地图片/GIF | 中英文介绍页，连接对应语言的文档、Release 和源码；不托管完整后台 |
| SHA256SUMS.txt | Windows ZIP 校验值 | Release 附件 |

首次发布版本标签为 `v0.1.0`；这不是历史 Sites 发布编号。源码从当前可运行版本干净导出，不携带原有 Git 历史。

`main` 上的文档和 GitHub Pages 可独立持续更新，不代表已发布的 `v0.1.0` ZIP 已改变。已发布标签与附件保持不变；后续应用运行行为或安装包需要变更时，应发布新版本，而不是覆盖已有版本。

## 介绍页语言与文档入口

- `site/locale.js` 提供中英文切换；正文、导航、按钮、弹窗说明、图片替代文本、页面标题和描述随语言同步更新。
- 有效的 `?lang=zh` 或 `?lang=en` 优先于浏览器已保存的语言；其次读取 `pcr-market-watch:site-language:v1`，没有有效选择时使用中文。切换时保存偏好并更新查询参数，保留 `#preview` 等锚点；无法使用 localStorage 时仍可切换。
- 介绍页中文 README 链接指向 `README.zh-CN.md`，英文指向默认 `README.md`；产品规格仍分别指向 `PRODUCT_SPEC.md`／`PRODUCT_SPEC.en.md`。`README.en.md` 保留完整英文兼容副本，两份英文正文同步；各文档提供中英文互相切换入口。仓库默认英文不改变介绍页默认中文或应用语言偏好。GIF 和实际界面截图保持英文，其说明、替代文本及弹窗文字使用当前页面语言。

| 文档职责 | 简体中文 | English |
| --- | --- | --- |
| 项目介绍、功能与使用入口 | [README.zh-CN.md](../README.zh-CN.md) | [默认 README.md](../README.md)，[兼容 README.en.md](../README.en.md) |
| 产品行为、计算规则与验收条件 | [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | [PRODUCT_SPEC.en.md](PRODUCT_SPEC.en.md) |
| Cboe 统计覆盖及 EQUITY 历史口径 | [CBOE_SOURCE_SCOPE.md](CBOE_SOURCE_SCOPE.md) | [CBOE_SOURCE_SCOPE.en.md](CBOE_SOURCE_SCOPE.en.md) |
| moomoo 本机只读接入与凭证边界 | [MOOMOO_BACKEND.md](MOOMOO_BACKEND.md) | [MOOMOO_BACKEND.en.md](MOOMOO_BACKEND.en.md) |
| 发布、安装与公开验证 | [RELEASE_SPEC.md](RELEASE_SPEC.md) | [RELEASE_SPEC.en.md](RELEASE_SPEC.en.md) |

## 安装行为

1. 用户完整解压 ZIP，双击根目录 `start.cmd`。
2. 检查 Node.js，启动 `start-local.mjs`。已有兼容后台时复用该后台；否则从当前目录启动 `scripts/preview.mjs`。
3. 通过 Python 标准库 SQLite 适配器应用版本化迁移。默认数据库位置为 `../local-data/pcr.sqlite3`；可以用 `PCR_DB_PATH` 改变。
4. 后台只监听 loopback，默认 `127.0.0.1:8765`。其他程序占用时，发行启动器选择可用端口，例如 `127.0.0.1:8766`，不会终止该程序；控制台显示实际地址，浏览器打开失败时可手动访问。
5. CMD 不自动关闭。关闭浏览器不停止后台；结束所属后台进程才停止该次服务。
6. 没有用户数据库时，网页按 Spec 首次初始化推荐名单；之后按数据库读取，空名单不恢复默认值。

环境变量：`PCR_PYTHON` 指定 Python、`PCR_DB_PATH` 指定数据库、`PCR_PREVIEW_PORT` 用于独立测试端口。桌面 moomoo 为可选接口，不是 PCR 基础功能的启动前提。

## 具体功能与计算验收

详细字段、接口、迁移及验收场景见 [PRODUCT_SPEC.md](PRODUCT_SPEC.md)。本版新增重点：

- 搜索框为通用双语提示。输入合法代码直接 Enter 添加；候选打开时 Enter 添加高亮项；中文输入法确认和长按重复键不会重复添加。
- 历史分位分别比较单日、20 日、60 日 PCR，仅用当前实际数据日之前最多 252 个有效值，中位秩处理相等值，显示实际 n。
- 往年同期每次仅比较一个指标。曲线严格同月同日匹配，缺失留空；摘要最多回退 7 天并列出目标日和实际日。
- 分位样本不随显示区间改变；未来数据和当前观察不得进入参照分布。
- 成交量与 OI 来源、日期分别标注。OI 缺失不补零，也不借用其他标的的数值。

## 可公开范围

允许导出应用源代码、结构迁移、公共市场快照及应用自身生成的演示截图。发布包不含实际个人自选数据库、券商账户/个人持仓、AppKey、环境变量文件、DPAPI 文件、浏览器配置、日志或旧部署包。

演示截图和 GIF 来自隔离的全新数据库，采用初始推荐标的。媒体中的实际界面为英文；数据时点以媒体自身为准，切换介绍页语言不改变媒体语言。

## 构建和验证

```sh
npm ci
npm run build
npm test
node scripts/validate-artifact.mjs
```

打包前检查文件清单和敏感模式；从最终 ZIP 再检查一次内容。ZIP 包含已构建输出，源码仓库通过 `.gitignore` 排除构建和运行状态。

GitHub Actions 的 `checks.yml` 在 Node.js 22 下构建与测试。`pages.yml` 只发布 `site/`，权限为仓库读取及 Pages 部署；不读取本地应用数据库或 moomoo 凭据。

后续改动按仓库 [AGENTS.md](../AGENTS.md) 的维护规则同步相关中英文规格、README 与验收说明；文档应区分已实现行为、固定发行包内容和后续计划。

### GitHub 操作方式与权限

直接优先使用现有 GitHub App／原生连接，在已授权的个人 `Rexmiao/pcr-market-watch` 仓库完成读写、检查和发布；不重复登录。提交基于读取到的当前分支，更新前核对分支仍指向预期提交，避免覆盖其他改动。不再启动包含组织访问的 GitHub CLI／OAuth 登录流程，不读取组织或申请组织权限；若工具缺少能力，说明具体缺失的仓库操作。

## 发布验证

- 仓库应有 `main`、默认英文 README.md、完整中文 README.zh-CN.md、完整英文兼容副本 README.en.md、英文演示图片/GIF，以及上表列出的成对中英文规格；链接目标应存在且使用对应语言，两份英文 README 正文保持同步。
- Release 应含版本标签、Windows ZIP 和 SHA-256 校验文件。
- GitHub Pages 应返回成功状态，图片/GIF 与 `locale.js` 在 `/pcr-market-watch/` 下可用；GIF 能播放，切换语言后媒体仍为英文。
- 验证 `?lang=zh` / `?lang=en`、保存后重载、无效参数和 localStorage 不可用时的切换；URL 切换保留锚点，中文 README 进入 README.zh-CN.md、英文进入 README.md，产品规格保持对应语言；介绍页默认中文与应用语言偏好不受仓库默认语言影响。
- 两种语言的页面标题、描述、正文、按钮、无障碍文本及图片弹窗同步更新；手机宽度 320px 无横向溢出，直接访问 `#preview` 时仍可使用语言按钮。
- 仅文档/Pages 的更新不覆盖 `v0.1.0` 标签、ZIP 或校验文件；发行行为改变时检查新版本的标签及附件。
- 维护者现有本机网站、个人数据库及云端站点访问范围保持独立。

相关口径：[Cboe 来源范围与 EQUITY 历史](CBOE_SOURCE_SCOPE.md)。


## v0.2.0 期权监测交付范围

本轮新增网页期权异动监测、auto／desktop／webapi 来源选择、来源隔离缓存及 OI 观察、浏览器筛选和可见页面自动刷新。desktop 扫描一个标的／到期日、最多 20 个邻近行权价／40 份合约，合约字段用 get-basic-qot 分最多两批、每批 20 份读取，完整快照独立保留；逐笔最多三个合约、每个 200 笔；可选 webapi 提供供应商标的汇总与最多 300 条异动事件，需独立 AccessToken。完整规则及验收在 [产品规格](PRODUCT_SPEC.md) 与 [moomoo 后端说明](MOOMOO_BACKEND.md)。

发行包的源码／构建完成、测试通过、本机安装、供应商连通和线上发布分别核实。desktop 需实际查询 Host，webapi 需实际验证独立 token／权限；受控测试不能充当真实市场响应。WebAPI 模式无需桌面客户端，但本机 Node／电脑仍需运行；持续托管采集需另行部署和服务端 secret。既有 Sites 云端第 12 版不会因新本机包或 GitHub 介绍页更新而自动升级。GitHub Pages 仍只提供介绍和下载。

v0.2.0 是期权监测功能的原始交付版本；auto 选源修复使用独立 `v0.2.1` 标签、Windows ZIP 和校验值，不覆盖既有 `v0.2.0`／`v0.1.0` 标签或附件。安装更新前保留项目外的个人数据库和 DPAPI 配置；只应用新增版本化迁移，不重放或改写原迁移，不把个人自选恢复为默认。

新增验证包括：真实逐笔与区间增量分开、局部 PCR 范围和缺失值、无源／无权限／部分失败、未知 OI 结算日、首次 OI 观察和跨日持久、刷新冷却及隐藏页面暂停、原自选及 revision 不变，以及端口被无关服务占用时安全选择新端口。公开归档还须排除新监测缓存、逐合约 OI 观察和私人供应商响应。


WebAPI 新增验证：官方 OAuth 2.1 PKCE 只读 quote:read 授权、本机回调、独立 DPAPI 加密授权包、按实际有效期刷新和撤销后重新授权；接受合法 accid 上下文选择器但拒绝写入、trade 和未知权限能力；仅保存规范化 quote:read，不输出真实选择器。首次 scope 省略仅继承绑定请求，显式空／null 拒绝。不提供手动／环境变量 token 模式，也不持久化到 .env。验证桌面 AppKey 不充当 Bearer、缺失／过期／权限失败脱敏、provider 缓存隔离和错误不换源、事件截断及到期筛选不改变汇总 PCR。新增迁移使用独立 WebAPI 合约 OI 表，不改写已应用迁移；未实现标的汇总 OI 历史。授权包、token 和私人响应均排除在归档外。


2026-11-25 桌面监测已返回 40 份所选合约报价，并保存缓存／OI 观察；因字段缺失及逐笔超时，仅验证部分可用，PCR 留空。完整快照仍超时。WebAPI 只读 OAuth 和 DPAPI 保存已成功，标的汇总成交量／OI PCR 与异动事件已有真实响应；分页未完导致 partial，汇总精确时点及 OI 结算日未知。完整逐笔、实时权限和托管 Worker 接入仍未验证。


## v0.2.1 补丁

修复 auto 读取不存在的 isConfigured 而误选桌面来源：改用实际客户端 status().configured，优先已配置 WebAPI。验证仅配置 WebAPI 时 auto 可取得对应来源缓存／刷新；采集失败仍不换源。v0.2.0 标签和安装包保持不变；可见页面轮询及数据覆盖规则不变。


## v0.2.2 独立页面与首页 OI 刷新

期权监测移至 `/options-monitor.html`，顶部入口位于 PCR 与市场解读之间；各主页面同步中英导航和当前页标记，旧 `/#options-monitor` 转址。首页移除面板及其请求；新页进入默认展开，保留原偏好与 SQLite/API，继续只在可见且展开时轮询。新增橘色规则命中、合约字段、方向／开平仓及重复提示的中英说明。

使用独立 v0.2.2 标签、ZIP 和校验值，保留 v0.2.0／v0.2.1 标签与附件。构建需包含新 HTML 与 0004 最新 OI 汇总缓存迁移，保留原个人数据库；复用只读授权，不新增账户／交易权限。独立页 23 项及首页 OI 16 项浏览器验收已通过，包括导航／转址、320px 双语、旧折叠偏好、名单复用、首页无异动轮询、历史 OI 留空及独立更新状态。纯模型与完整现有测试通过；安装后数据库保留与发布仍另行核查。


同批修复首页灰柱停留在旧快照的问题：新增手动 Moomoo OI 汇总刷新与来源切换，OCC／OI 更新独立；原 Cboe 种子不覆盖。GET 只读缓存，POST 最多 40 标的／2 并发、无事件或首页轮询。验收 T−1 未知结算日、原时间保留、缺侧不拼接、历史灰柱空、最新视图限定及迁移后名单不变。缓存只存最新值，无 OI 历史序列。2026-11-25 实测手动刷新中全部请求标的返回完整两侧 OI、无源错误；具体结算日仍为 null。0004 新缓存表已应用，公开材料不含真实响应或凭证。


## v0.2.3 卡片方向与时间

活动／逐笔提示卡新增供应商 BUY／SELL／NEUTRAL、开平仓未披露及记录日期／到秒的纽约 ET 时间；按 eventId 与原事件关联。微秒 fill_timestamp 与观察／检查时间分开；快照和区间增量不冒充成交。没有数据仍未知，不由 Put／方向／OI 反推开平仓或净多空。

使用独立 v0.2.3 标签、ZIP 与校验值，保留 v0.2.0／v0.2.1／v0.2.2；不增加接口、账户／交易权限或数据采集范围。发布前验证重复合约与相反方向、未知字段、微秒／夏令时、卡片表格一致、中英与窄屏；真实只读记录已核实事件关联、方向与记录时间，开平仓仍未知。v0.2.3 的 10 项身份／时间检查和 14 项中英浏览器检查均通过，覆盖 320px、同合约多方向／未知值、UTC 跨日、纽约春秋夏令时及未认可原始 OPEN 的忽略。公开包不含真实私人活动响应或运行凭证。
