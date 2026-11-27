# Hugging Face 部署

[English](HUGGING_FACE.en.md) · [产品规格](PRODUCT_SPEC.md) · [发布规格](RELEASE_SPEC.md)

历史公开入口验收（v0.2.7）：[Space](https://huggingface.co/spaces/Rexymiao/pcr-market-watch)及[PCR应用](https://rexymiao-pcr-market-watch.hf.space)已运行游客模式：无需HF令牌、Cookie或密码即可查看PCR和显式更新。2026-11-26最终远程HTTP验收已过：页面／公开数据200、OI更新7／7成功、紧接429、私人页及API401、跨源403；所有者登录与私有Bucket保留。最终实际HF游客Edge24项亦已通过，与HTTP证据分别记录。本机、GitHub Pages、其他托管及HF数据库独立，该阶段17:30未观察为历史结论，后续真实执行以独立验证记录为准；新增17:45结构任务另行验收。

**历史云端Core／Cboe缓存恢复证据（v0.2.7）：** Core／Cboe此前仅内存、重启回seed的失败现已通过worker_cache／迁移0007修复。功能源码e4a1282实际PAUSED→同提交重启后，仅GET核对日期、原checkedAt及行／快照SHA全部一致，35条OI也完整保留；未重新抓取补回。历史失败与本次成功分别保留，当时17:30未观察的结论保留历史含义。

## 需求与边界

| 编号 | 要求 |
| --- | --- |
| HF-001 | 使用 Docker Space、7860 端口、Node 22 和 Python 3。CPU 即可运行，不需要 GPU。 |
| HF-002 | 默认登录保护；本次用户明确选择PCR_PUBLIC_VIEW=1，让游客免密码查看PCR和显式更新。应用密码仍保护所有者编辑／私人页面，Bucket私有；不能因公开查看而开放账户交易、任意接口或数据库。 |
| HF-003 | 上传经过检查的通用源码；排除个人数据库、自选名单、持仓、凭证、DPAPI 文件、运行日志和浏览器资料。令牌不得进入 Dockerfile、构建参数、README、URL 或源码。 |
| HF-004 | 活动 SQLite 留在容器本地磁盘；已挂载私有 Storage Bucket 存储一致备份及校验清单。普通 /data 文件夹不构成持久化证明，不把活动库直接置于对象挂载卷。 |
| HF-005 | 云端使用独立 moomoo quote:read OAuth 授权，访问令牌到期时在有效刷新授权范围内自动续期；不复制本机 DPAPI，不查询账户或交易。刷新授权到期、撤销或失败仍需重新确认，不能承诺永久连接。 |
| HF-006 | 每日 OI 仅在进程运行、网络和有效行情授权可用时采集；休眠／停止不能执行。未取得的日子保留缺失，不能用后来 OI 反填。 |
| HF-007 | 本机与云端数据独立，不自动迁移个人数据库、已有归档或 Windows 任务。单用户 SQLite 部署只运行一个副本。 |
| HF-008 | 分别记录已准备、已测试、实际部署和未来定时运行；使用现有 PRO 的 CPU Basic，不自动升级硬件、开通计费 Jobs 或扩大权限。额外费用需用户明确选择。 |
| HF-009 | 新部署用 MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON 加密 Secret 引导授权，PCR_CLOUD_AUTH_KEY 为独立 64 位十六进制 AES-256 密钥 Secret。刷新后只保存 AES-GCM 密文及上一版本；跨进程使用本地文件锁。原始令牌不作为新部署的环境变量。 |
| HF-010 | 网关提供12小时签名HttpOnly会话：普通部署SameSite=Lax／HTTPS加Secure；HTTPS *.hf.space 使用 __Host-pcr_embed_session、Secure、SameSite=None、Partitioned 以支持HF iframe。只有兼容HF登录路径可接受受信HF父来源，并需5分钟签名CSRF Cookie／隐藏值配对；API与其他修改请求仍严格同源，Origin:null拒绝。应用凭证用独立X-PCR-Authorization，所有凭证／Cookie／身份头不进入内部后台。 |
| HF-011 | 迁移 0006 的 oi_daily_state／oi_daily_runs 将每日去重、重试及执行元数据事务保存到 SQLite，随数据库备份恢复。临时文件丢失不能清空已有运行状态或造成同日重复采集；旧本机文件保留兼容用途。 |
| HF-012 | CPU Basic 即使账号为 PRO，仍可能在闲置 48 小时后休眠。若需要独立定时 Jobs 或持续运行的收费硬件，先核实价格并取得具体选择，不能把 PRO 等同于无额外费用的永久在线。 |
| HF-013 | 登录表单使用 strict-origin-when-cross-origin，保留真实表单Origin；CSP frame-ancestors 仅允许自身与受信HF父域。不能以允许null来源来修复登录。 |
| HF-014 | SQLite成功提交后发出固定、无数据内容的IPC通知；500毫秒合并排队备份，备份中有新写入则再备份。启动、每小时、每日任务及正常关闭均执行相应备份；突然崩溃仍可能丢失最近未成功备份的变化。 |
| HF-015 | 更新前先确认最新写入的备份可见／有效，再暂停旧Space并确认PAUSED，随后上传／重启。HF滚动构建可能让新Pod早于旧Pod的关闭备份启动，不能依赖关闭备份追上新实例；此维护步骤不迁移本机数据库。 |

## 准备源码

在已检查的公开源码目录运行，目标必须是该目录之外的绝对路径新空目录：

```powershell
node scripts/hf-prepare.mjs --output "C:\path\to\pcr-hf-source"
```

脚本按允许清单复制通用源码，为目标 README 写入 sdk: docker／app_port: 7860 元数据，并生成 SOURCE_MANIFEST.json（大小和 SHA-256）。脚本不登录、不创建资源、不复制个人数据库或凭证；仓库默认英文 README 不受替换。来源及 Secret 配置见 [官方 Docker Space 文档](https://huggingface.co/docs/hub/spaces-sdks-docker)。

## 私有部署配置

在个人账号使用Docker Space，以CPU Basic起步；挂载私有Storage Bucket到/data。默认私有，本次在用户明确选择后只将Space及通用源码入口改为公开，应用登录和Bucket私有性不变。不要复用无关项目或替换其挂载；保持单副本。

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| PCR_CLOUD_PASSWORD | Secret | 必填，10至256字符；不要复用券商密码。 |
| PCR_CLOUD_USERNAME | Variable | 默认 pcr。 |
| PCR_CLOUD_PUBLIC_ORIGIN | Variable | HF 可省略，由 SPACE_HOST 取得真实 HTTPS 来源；本地测试需准确回环来源。 |
| MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON | Secret | 新部署首选；独立 quote:read OAuth 包的 AES-GCM 加密引导值。原始授权包仅在受控内存中加密与传送。 |
| PCR_CLOUD_AUTH_KEY | Secret | 对应的 64 位十六进制 AES-256 密钥；不与引导密文一同写进源码或日志。 |
| PCR_CLOUD_AUTH_FILE | Variable | 例如 /data/pcr-auth/moomoo.enc.json，位于已验证的私有挂载；只保存密文和上一版本。 |
| PCR_CLOUD_AUTH_LOCK_FILE | Variable | 可省略；默认在本地活动库目录中，必须位于 Bucket 外，用于单容器跨进程刷新互斥。 |
| PCR_PUBLIC_VIEW | Variable | 本次设为1，允许游客查看有限PCR和显式更新；Docker默认0。所有者配置编辑、私人页面及Bucket仍受保护。 |
| PCR_OI_DAILY_ENABLED | Variable | 完成有效授权及持久化验证后设为 1；默认 0。 |
| PCR_STRUCTURE_DAILY_ENABLED | Variable | 可省略并跟随既有每日OI启用状态；设0可单独关闭17:45结构定时。需要有效授权与已验证备份，启用不等于已执行。 |
| PCR_HF_BACKUP_DIR | Variable | 例如 /data/pcr-backups，位于实际私有 Bucket 挂载中。 |
| PCR_DB_PATH | Variable | 默认 /tmp/pcr-runtime/pcr.sqlite3；位于 Bucket 外。 |
| PCR_PYTHON / PORT | Variable | 镜像默认 python3／7860。 |

MOOMOO_WEBAPI_OAUTH_JSON 原始包及 MOOMOO_WEBAPI_ACCESS_TOKEN／MOOMOO_WEBAPI_SCOPE／MOOMOO_WEBAPI_EXPIRES_AT 静态模式仅保留兼容，不是新部署推荐配置。静态模式仍要真实未来有效期，过期需人工更新。

云端 OAuth 使用单独客户端与授权，避免两个环境互相修改刷新状态。本机 Windows DPAPI 不上传、不作为云凭证。刷新授权自身有期限，服务商撤销后仍需官方重新授权；不知道的期限不能推算为无限期。

## 打开与登录

本次为公开Space，游客无需密码可看PCR和更新；所有者编辑／私人页面使用应用登录。其他采用私有Space的部署还需HF平台访问检查。/_pcr/login 提供中英表单。HTTPS *.hf.space 下使用独立 __Host- 前缀分区会话和CSRF Cookie；仅对指定HF父域的兼容登录路径放行，并验证5分钟签名Cookie与表单隐藏值。API、退出和其他修改请求仍要求真实应用Origin，null来源拒绝。登录表单的 strict-origin-when-cross-origin 保留真实表单来源，不能放宽null来源绕过错误。CSP限制frame-ancestors为自身与受信HF域。浏览器仍限制分区Cookie时可在新标签页打开 .hf.space；不要公开内部端口。

访问私有 Space 的自动化保留 HF Bearer 在 Authorization 头，应用密码放在独立 X-PCR-Authorization 头；两者不可塞进同一头，也不能写在 URL 中。所有凭证与 Cookie 在进入 loopback 后台前剥离。

## 持久化与恢复

启动检查真实非根 Linux 挂载。活动 SQLite 使用本地文件锁；Bucket 只保存已关闭的一致性快照，避免依赖尚未确认的对象挂载 SQLite 锁语义。[Spaces 存储](https://huggingface.co/docs/hub/spaces-storage)和[Bucket 访问方式](https://huggingface.co/docs/hub/storage-buckets-access)说明平台行为。

hf-storage.mjs 用 SQLite 在线备份 API，执行完整性检查，计算 SHA-256，写不可变内容并读回确认，最后写清单。没有有效清单的未完成上传不参与恢复。相同内容去重；仅在活动库不存在时，从最近 50 个清单选最新有效快照，损坏则回退；清单全部无效时明确失败，不伪装为空库。SQLite提交成功后，经固定非敏感IPC消息通知父进程，500毫秒合并排队备份；备份期间新增写入会再排一次。启动、每日任务、每小时及正常退出最终排空均保留备份，不自动删档。读取、零变更、回滚不伪造写入通知。备份实际耗时取决于存储，突然崩溃仍可能丢失最近成功备份之后的变更。

oi_daily_state／oi_daily_runs 与 OI 观察共存在 SQLite，因此恢复可保留实际开始／完成时间、查询日、manual／scheduled、保存数量、重试和同日去重。私有状态和密文不提交源码；加密授权文件与数据库备份分开保存。

## 定时与费用

默认每天 America/New_York 17:30，随夏令时变化。周末／节假日 OI 可能不变，但保留实际查询时间；结算日期只在供应商明确确认后填写。

PRO 让个人账号符合新建计算 Space 的条件，并不取消 CPU Basic 的闲置休眠。进程睡眠时不会执行每日定时器，不能仅凭配置存在声称当日已抓取。需要持续运行的硬件或独立 Jobs 时，必须另外核实和选择费用；本部署没有自动开通这些资源。[官方概览](https://huggingface.co/docs/hub/spaces-overview)、[休眠规则](https://huggingface.co/docs/hub/spaces-gpus)、[Jobs 计费](https://huggingface.co/docs/hub/jobs-pricing)。

## 验收与状态

1. 核对源码清单，无私人文件；缺所有者密码仍拒绝启动。PCR_PUBLIC_VIEW未开启时默认登录保护；开启时游客只能读取／显式更新PCR白名单，所有者编辑、私人页面和管理API仍拒绝未登录访问。
2. HF Bearer 与应用登录可并存，同源登录／退出、会话过期／篡改、限流及凭证头剥离通过检查。
3. 加密引导、密文篡改／错密钥、并发跨进程续期、401 强制刷新、刷新授权过期与错误脱敏均可验证。
4. 有效持久挂载与授权缺失时不能宣称采集成功；实际 OI 查询保留原时间和可空的已确认结算日。
5. 用真实 SQLite 备份在临时文件已丢失的新运行目录恢复，原每日结果、去重及历史灰柱应保留；事务失败不改旧状态。
6. 实际远程地址、认证、数据读取、刷新及重启恢复分别记录；本机安装和周五任务不迁移，不把手动测试冒充未来定时运行。

远程HTTP访问与来源更新已验证；最终实际HF游客Edge24项已通过。源码／容器检查与实际HF结果分别记录，不能互相替代。

## 更新顺序与当前核验

先确认最近提交已经写入可见且有效的私有备份；暂停旧Space并等待PAUSED，再上传新源码及启动。这次实际观察到HF滚动更新可先启动新Pod、后让旧Pod写关闭备份，导致新实例暂时恢复旧版本状态。因此不能仅靠退出备份或仅调用restart；暂停前后均核对备份，再从确认的快照恢复。操作者使用本机私有部署助手；该助手及授权缓存不进入公开源包。

独立云授权、实际OI归档、所有者登录和暂停更新恢复均已验证，Bucket含私有备份及独立密文。最终HF匿名HTTP验收已通过：无HF令牌／Cookie／密码的首页、图表、公开API和来源更新200；公开settings为cloud，私人页面／API401，未发布合法标的403，跨源403，所有者表单303及会话API200。实际更新7／7且紧接429，私有Bucket、CPU Basic及既有归档保留。最终实际HF游客Edge24项亦已通过并单独记录，不能由HTTP成功替代；未来17:30执行仍未观察。

## 当前访问范围与已验证结果

| 编号 | 当前行为与边界 |
| --- | --- |
| PUB-001 | 用户明确选择公开Space及游客PCR查看／更新。PCR_PUBLIC_VIEW=1启用有限公开网关，通用源码与经投影的PCR数据可公开；Secret、Bucket、运行数据库、管理操作仍受保护，不迁移本机个人库。 |
| PUB-002 | 游客免密码查看PCR并显式更新，修改名单／分组／市场参考及私人页面仍需所有者登录。公开偏好readOnly:true／canRefresh:true约束配置编辑而允许来源刷新。实际无令牌／无Cookie的HF HTTP查看与更新200、私人401已验证；最终实际HF游客Edge24项已通过并单独记录。 |
| PUB-003 | 实际云查询7／7成功，2026-11-26归档时间保留、已确认结算日0。按“验证备份→PAUSED→上传→启动”恢复7项关注与历史OI；私有Bucket已观察到一致备份、清单及独立密文，写后IPC产生后续备份。元数据可延迟数秒，不作瞬时持久化承诺。 |
| PUB-004 | 实际HF公开settings已返回WATCHLIST_STORAGE=cloud，Windows仍local；不表示每位访客独立数据库或多用户权限系统。跨环境独立，云17:30计划启用，未来执行未观察。 |

CPU Basic及私有存储边界不变，没有新增收费硬件／Jobs。此前阶段仅公开入口；用户现已选择游客PCR查看与显式更新，新版远程验收待完成。所有者编辑仍需登录，没有修改其他项目。

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

## 2026-11-26最终远程HTTP记录

本次功能核验源码前缀789f9f5已RUNNING。验证客户端不带HF令牌、Cookie或应用密码：首页、charts、公开API／access flags及settings均200，settings.storage为cloud；所有私人API及HTML401、跨源403、合法但未发布的代码403。所有者仍可登录，表单303、会话首页／API200；Bucket仍私有，CPU Basic不变。

访客OI更新真实调用moomoo并取得7／7，查询时间2026-11-26T08:20:01.812Z；下一轮合法更新于08:21:18.707Z再次7／7，紧接请求429，实测Retry-After为59秒（不是固定常数）。原14份观察仍保留。访客POST /api/refresh返回HTTP200／status:updated，成交量记录推进到2026-11-25，检查时间2026-11-26T08:22:48.122Z。11月26日为假日，不能把检查日期标作成交交易日；具体OI结算日仍未知。

本机25项游客浏览器检查已通过；上述实际HF结果是HTTP验收，最终实际无登录HF游客Edge24项也已通过，包含权限控件、中英文892／320及无异常检查。云17:30定时计划已启用，但未来触发尚未观察。文档后续提交可以改变源码哈希，不改变这次证据的时间和范围。

最终实际全新无登录Edge的24项检查已通过，包含游客banner／canRefresh、隐藏编辑与私人入口、中英文892／320无溢出和无异常。该结果来自实际HF，不是fixture；本机25项检查仍是另一组证据。

实际访客Cboe快照刷新HTTP200，数据日2026-11-25、checkedAt为2026-11-26T08:23:18.477Z；历史刷新HTTP200，随后GET history的actualEnd／asof均为2026-11-25、252行。这说明当次来源更新及缓存读取成功，不改变Cboe覆盖范围，也不把11月26日假日伪装成成交日。该阶段17:30未观察为历史结论，后续真实执行以独立验证记录为准；新增17:45结构任务另行验收。

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

## v0.2.8：管理员登录配置（实际云端轮换已验证）

密码长度是本应用的配置规则，不是 Hugging Face 的平台要求；无需改变已保存的数据或行情授权。

| 编号 | 要求与验收 |
| --- | --- |
| ADMIN-001 | 管理员密码范围改为10至256字符，仍拒绝CR、LF、NUL；用户名保留1至64位ASCII字母、数字、下划线或连字符。通用默认用户名仍为pcr，实际凭据不得写入源码、文档、构建参数、URL或日志。 |
| ADMIN-002 | 轮换只更新PCR_CLOUD_USERNAME变量和PCR_CLOUD_PASSWORD Secret。会话及CSRF签名仍由用户名与密码派生；任一变更使旧会话／旧CSRF失效，所有者需重新登录。现有登录限流、同源、Cookie及游客权限规则不变。 |
| ADMIN-003 | 保持PCR_CLOUD_AUTH_KEY、moomoo引导密文／授权文件与quote:read授权不变；保留数据库、名单、OI归档、worker_cache和私有Bucket，不新增数据迁移或收费资源。更改网站登录不等于更改HF或moomoo账号密码。 |
| ADMIN-004 | 部署前确认私有备份并暂停到PAUSED，应用新代码及两项登录配置后再启动。验收新凭据登录成功、旧凭据与旧会话不能访问所有者接口、游客查看／更新保持，以及原名单和归档恢复；不得通过重新抓取冒充恢复。 |

历史公开入口验收（v0.2.7）：v0.2.8功能源码213de51已在HF运行，已选择的新管理员凭据通过实际owner200验收；旧Basic凭据和旧会话Cookie均401。真实表单303、会话首页／API200，Secure／HttpOnly／Partitioned标志保留。原7项关注偏好、42条OI及Core／Cboe行哈希一致，行情加密密钥未改；游客仍免登录查看并可更新。以上为实际HTTP与数据核验，不公开个人凭据。此前v0.2.7游客／缓存恢复证据保留；GitHub v0.2.3发行物不变，未来17:30自动触发仍未观察。

## v0.2.9：每日归档诊断与首次真实定时验收

复用既有所有者GET /api/oi-daily及定时复核页状态区，游客仍401。本次不新增API、数据库迁移、付费硬件或Jobs，也不改变当前管理员凭据及moomoo quote:read授权。启动时ensureOiDailyMonitoring仅登记既有oi_daily_state.payload_json中的monitoringEnabled／monitoringEnabledSince；普通状态GET不登记任务或修改此起点。正常重启保留起点，禁用再启用重新登记，未知起点不追判过去漏采。

| 编号 | 云端诊断契约 |
| --- | --- |
| HF029-001 | health区分waiting、awaiting、success、partial、failed、missed、empty_watchlist、disabled、unconfirmed。它评估assessedDate这一最近应执行日，不能把昨日成功写成今天计划已完成。currentPlanAt、assessedDueAt、lastScheduledRun、lastSuccessfulScheduledAt与下一计划各自标时。 |
| HF029-002 | scheduled运行从既有数据库记录独立读取，最后manual不覆盖其证据；最多读取128份记录，漏采评估最多最近30日且不早于启用日。首日到期点取max(当日17:30,monitoringEnabledSince)，到期后5分钟仍无合法完成scheduled报告才列入missingDates；GET不读／清采集锁，不能据此断言进程未运行或来源失败；显示连续未记录日及evaluatedFrom，不能证明休眠／停机／网络中哪项是原因。 |
| HF029-003 | scheduledEvidence区分unobserved、success_observed、partial_observed、failure_observed、empty_watchlist_observed；task Ready、手动归档数及未来nextPlannedAt均不能代替。未来17:30真正验收须读实际scheduled开始／完成、查询日、请求／保存／失败数及对应归档，不改时钟、不用事后抓取冒充。 |
| HF029-004 | authorization仅返回configured、status、accessExpiresAt、refreshExpiresAt、refreshExpiryKnown、renewable。status为available、refresh_needed、reconnect_required、not_configured或unavailable；未知刷新授权到期为null且refreshExpiryKnown:false，不能承诺永久可用。诊断GET只读本已保存的安全元数据，不联网／续期／采集或写token，不公开秘密、路径及原始错误。 |
| HF029-005 | CPU Basic睡眠／停止不能执行任务，访问唤醒只恢复当前服务；未取得的旧日OI保持缺失。原15分钟重试／最多3次、同日去重及私有备份恢复保持。本次不安装外部保活，不默默升级算力；计划、读取健康状态和实际执行必须分别记录。 |

首页PCR变化摘要见[Product Spec](PRODUCT_SPEC.md)的SUM／AC-81与[Cboe口径](CBOE_SOURCE_SCOPE.md)：来源和逐行实际日期不混淆，摘要读取不触发来源更新。v0.2.9实际状态：功能源码daaf0dd已在HF运行。完整npm test通过99项Node测试及模型／来源检查；fixture浏览器27项、真实云端匿名浏览器13项和只读HTTP12项分别通过。当前实际参考／自选去重形成11行，所选2026-11-26各行成交日不晚于11月25日，中英892／320px无页面溢出且无未捕获异常，访客更新保持可用。所有者诊断为health=waiting、scheduledEvidence=unobserved、missingDates=[]；监测起点2026-11-26T10:23:40.250Z（05:23:40 ET），下次2026-11-26T22:30:00Z（17:30 ET）。authorization=refresh_needed仅表示已保存授权元数据可续期，不是本次联网失败；诊断核验未请求行情、续期或制造scheduled记录。原7项关注偏好、42条OI与Core／Cboe哈希保持，私人诊断401、未发布标的403，无凭据泄露。未来真正17:30执行仍未观察，不能由上述测试冒称已完成；GitHub v0.2.3发行物及现有管理员／私有存储保持。

## v0.2.17：持久结构归档、备份与休眠

| ID | 云端边界 |
| --- | --- |
| HFGARCH-001 | 新0008结构快照／runs／state进入同一私人SQLite，随既有一致备份／manifest进入私有Bucket；活动库仍在容器本地盘，不在对象挂载中直接运行。与OI归档、云端Core／Cboe worker_cache及易失live GEX缓存分开，不借历史读取冒称live恢复。 |
| HFGARCH-002 | 云端每天17:45 America/New_York（含DST）在进程活着时检查，默认跟随既有OI启用状态，可用PCR_STRUCTURE_DAILY_ENABLED=0单独关闭。旧OI仍17:30；两套状态／真实scheduled证据独立。CPU Basic即使PRO仍可休眠，无法保证准点或每天全量；不升级算力、不安装外部保活、不新开收费Jobs。 |
| HFGARCH-003 | 休眠后仅当今日到期点已过且符合预算时采今日实际观察；不补错过日，不把新的查询时间写旧日。持久lease／同日checkpoint／最多3次15分钟重试及请求／20分钟预算同样受停机影响。源更新时间可旧于查询日，日期选择展示实际保存内容，不证明OI在所选日结算。 |
| HFGARCH-004 | 公开历史只按当前已发布symbol投影，安全结构状态可公开；整批手动capture需所有者且202不代表完成。查询历史／状态不请求供应商或续期；保持quote:read、owner编辑／管理与私有数据边界。新归档不是完整逐合约链、真实dealer库存或自动生成的回测历史。 |
| HFGARCH-005 | 当前一致SQLite备份单文件限制512MiB；新表追加会增长私人磁盘／Bucket及备份体积，不进GitHub。单观察另有原始1,500,000字节／gzip512,000字节限制，列表有界但数据库归档不自动删除；不承诺无限容量。savedCount或本地提交不证明已成功备份，需核对最新有效manifest；超限／失败不能静默删历史或冒称可恢复，存储方案调整需独立选择。 |
| HFGARCH-006 | 更新前核对包含最新归档／run状态的有效私有备份，PAUSED后上传源码／启动。重启后仅GET比对原snapshot id／数量／源与查询时点／范围／内容及旧PCR／OI数据，不重新抓取冒充恢复。手动采集、任务配置、实际17:45运行、备份恢复、匿名HTTP与真实浏览器分别记录。 |

历史API／Windows独立任务见[后端说明](MOOMOO_BACKEND.md)，覆盖与比较规则见[产品规格](PRODUCT_SPEC.md)。本机与HF归档各自独立，不自动迁移个人数据库或共享本机授权。

## v0.2.18：历史页面读取性能

| ID | 托管与保全 |
| --- | --- |
| HFPERF-001 | 当前页面内有界成功记录／短时日期headers缓存及同键读取合并，只减少重复历史GET；index／安全status保持no-store。常规状态一次只读SQL减少数据库桥接，大checkpoint保留有界回退；动态run／lease仍按当前数据库和时钟读取，Windows任务30秒缓存仅适用本机计划元信息。无需新数据库迁移、授权、复制副本、收费硬件或Jobs；CPU Basic休眠限制保持。页面缓存不替代私有SQLite／Bucket归档和备份，重载／失效后仍受当前公开symbol和所有者权限约束。按既有备份→PAUSED→更新→只GET原数据恢复流程验收，不因缓存命中重标源时间或声称更快的上游采集。 |

容量、时效、失效和可复现测速见[产品规格](PRODUCT_SPEC.md)PERF-018与[后端说明](MOOMOO_BACKEND.md)PERF-API；部署与实际耗时证据另行记录。

当前应用及管理员登录首次无有效语言选择时默认英文；有效URL／保存中文偏好优先，可双向切换并保存。介绍页采用同一默认规则但设备偏好独立，历史静态快照原语言保持；语言改变不更改授权、账户或归档数据。
