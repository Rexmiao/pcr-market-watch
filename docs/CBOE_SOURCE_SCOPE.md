# Cboe 日报的范围与 EQUITY 历史方法

**简体中文** | [English](CBOE_SOURCE_SCOPE.en.md)

核对日期：2026-11-24。数据入口为 [Cboe Daily Market Statistics](https://www.cboe.com/markets/us/options/market-statistics/daily/?dt=2026-11-23)。

本项目分别保存 TOTAL、INDEX、EXCHANGE TRADED PRODUCTS（ETP）、EQUITY 四类。TOTAL 包含其他三类；不能把 TOTAL 再与 INDEX、ETP 或 EQUITY 相加，也不能直接把各类 PCR 相加。EQUITY 在此分类中为单只股票期权，ETP 包含 ETF 和 ETN 的期权。[官方产品说明](https://www.cboe.com/exchange-traded-stock/)

这张日报采用 Cboe 的统计口径，不能标为美国所有交易所的期权市场汇总。Cboe 的[官方解释文章](https://www.cboe.com/insights/posts/how-early-exercise-order-flow-impacts-equity-option-put-call-ratios)将该系列的单股流量指向 Cboe Options Exchange（C1），并单独比较全交易所数据；当前日报没有明确说明已扩至 Cboe 四所，因此不声明四所全覆盖。

## 直接发布与历史推导

新取得的官方页面直接解析 EQUITY PUT/CALL RATIO 和 EQUITY OPTIONS 的 VOLUME 行。响应标记 `derived:false`、`source:cboe_published`，单日 PCR 保留官方值。

已有历史 seed 和云端缓存只保留 TOTAL、INDEX、ETP 三类。为恢复 EQUITY 历史，按同日报分类做以下差额计算：

```text
Equity Put  = Total Put  - Index Put  - ETP Put
Equity Call = Total Call - Index Call - ETP Call
Equity daily PCR = round(Equity Put / Equity Call, 2)
```

2026-11-23 官方四类张数可逐项核对这一恒等关系，差额得到 Equity Put 1,836,973、Call 3,321,053，计算 PCR 为 0.55。现有 2025-08-01 至 2026-11-23 的 331 个交易日三类原始总量均可得到非负差额；这属于依据同日报分类关系进行的历史重建，并非逐日重新取得或保存了官方 EQUITY PCR 字段。

因此这些历史值必须标记 `derived:true`、`source:derived_from_cboe_category_volumes`、`derivation:total_minus_index_minus_etp`。方法假设所重建期间分类关系一致；之后若发现官方产品分类发生变化，受影响的历史需要重新核查，不能悄悄改称直接发布值。

差额计算要求三类 Put/Call 字段全部存在、为非负安全整数，结果也必须非负且安全；不满足时 EQUITY 数量和 PCR 留空，原三类数据仍保留。推导的 Call 为零时 daily PCR 为 null，不生成无穷大或零比率冒充有效读数。

5/20/60 日 EQUITY PCR 使用窗口内 Equity Put 合计除以 Equity Call 合计，不平均每日已四舍五入 PCR；5日由前端使用已有每日张数派生，既有20／60值及API字段不变。窗口需要完整连续交易日及数量；缺口、数据不足或零 Call 合计使该周期 PCR 留空。历史行的 `derived20` / `derived60` 表示对应窗口是否使用过推导数据，允许之后混合直接发布和已标明来源的重建数量。

## API 兼容

- Snapshot 新增 `snapshot.metrics.equity`，字段与其他类别一致，并补充 derived、source、derivation、method。
- History 新增 `rows[].equity`，包含 daily/dailyText、p/c、p20/c20/r20、p60/c60/r60、derived、derived20、derived60、source、method。
- 原三类别的旧缓存可以读取并按上述规则恢复 EQUITY；缺少 EQUITY 不会使原三类记录失效。
- 所有来源及检查时间继续区分活动日期与 checkedAt；恢复历史数量不会把 seed 的原检查时间改为新抓取时间。

SPY、QQQ、DIA 的 PCR 是各 ETF 期权的独立统计，可作为对应指数的 ETF 参考，不能替代 Cboe INDEX 这一汇总分类，也不称为 SPX、NDX 或 DJX 指数期权本身的 PCR。


## 页面覆盖与状态提示（v0.2.5 本机未发布）

观察名单交易日历的蓝点只表示该日至少一个标的有成交量记录；页面按完整关注名单 items 列出有合法 p/c 日成交记录数／总数和缺记录代码，不随分类筛选改变分母；按钮 title／aria 也包含覆盖数。它不保证每个标的、20／60 日窗口或 OI 数据都齐全，也不代表 Cboe 日报新增全市场覆盖。

历史 OI 与成交量不是同一数据：历史日期没有可靠 OI 时灰柱留空，不借当前快照回填；最新视图也须有可靠所选来源且有效 Call OI 分母才显示；图前说明缺失标的及原因，历史 actualDate 与最新成交日 data.asof 分开。查询时间、成交活动日和 OI 结算日仍分开，空值不补零。

市场解读颜色按来源说明：某报价接口失败不使正常 Cboe 记录失效；缺口／旧数据与正常等待有独立提示。本节只澄清展示和覆盖含义，四类别定义、EQUITY 推导、连续窗口和原始检查时间规则均不变。

相关文档：[产品规格](PRODUCT_SPEC.md) · [发布规格](RELEASE_SPEC.md)。

## v0.2.7公开PCR与Cboe缓存浏览

| 编号 | 来源与访问规则 |
| --- | --- |
| CPUB-001 | 游客可公开查看PCR并显式更新；配置不可编辑与来源可刷新是两种权限。每类更新共享60秒冷却及并发合并，429给出重试时间，不按访客重置。 |
| CPUB-002 | 公开 /api/cboe GET 强制内部x-pcr-cache-only:1，只读取已验证快照、seed或已加载历史；指定日期无记录时200、snapshot:null／refresh_required，不拿前后日冒充。无日期取最新实际缓存。选日期不联网、不消耗更新预算。 |
| CPUB-003 | 仅显式Cboe POST刷新在60秒预算内获取来源；等待发布／休市／失败仍保留真实数据日期。TOTAL／INDEX／ETP／EQUITY覆盖、EQUITY数量推导及20／60日合计规则不变。 |
| CPUB-004 | 公开汇总与已发布名单分开；通用默认七标的基础资料已在源码公开，作为前端契约例外可保留。自定义标的／OI仅当前发布名单与市场参考；不公开私人组名、账户／持仓／凭证、原始moomoo私有接口。OI仍按真实查询日归档，结算日仅明确确认后填写。 |

本机／容器Cboe缓存与限流检查已通过，实际HF匿名PCR读取与来源更新HTTP也已通过。最终实际HF游客Edge24项亦已通过并单独记录；公开模式不扩大Cboe范围，也不将PCR变为净多空持仓比例。

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

## v0.2.9：摘要表中的日期、变化和分位

| 编号 | 展示口径 |
| --- | --- |
| CSUM-001 | PCR变化摘要只汇总用户当前选择的类别／市场参考／个人自选，按实际数据日逐行标示；Cboe汇总与OCC标的分组，不求和或混算比例。TOTAL、INDEX、ETP、EQUITY仍各自独立；SPY／QQQ／DIA等ETF不是指数期权本身。 |
| CSUM-002 | 单日变化为该行actualDate的PCR减确切前一美股交易日PCR，保留正负号的比值差（单位倍），不是百分比。所选日缺记录可显示更早actualDate，但不得改变日期；前一交易日缺失或Call分母无效则变化为空，不能拿前一条记录替代。 |
| CSUM-003 | 20／60日仍是原始Put合计÷Call合计。Cboe连续窗口缺交易日留空；OCC活动记录窗口的既有限制不变，不能因共用摘要表就称已统一。 |
| CSUM-004 | 20日分位使用该行实际数据日前最多252个有效r20，排除当前／未来，平分并列；显示实际n/252，n=0或当前r20未知时分位为空。分位与变化只说明相对活动及历史位置，不表示净空头／多头占比或未来涨跌概率。 |
| CSUM-005 | 摘要复用当前缓存。非CORE标的GET /api/symbol可携x-pcr-cache-only:1，只读优先于refresh=1；有缓存保留原asof／checkedAt，包括超过通常刷新时效的记录，无缓存200、instrument:null／asof:null／checkedAt:null／coverage:null、refresh.status=cache_miss。该读取不联网、不写尝试／冷却计数；公开标的白名单及既有Cboe缓存GET规则保持。 |
| CSUM-006 | Cboe的available:false网格占位行不算真实来源观察；available:true但该类Call为0／PCR缺失的记录保留实际日期和空值，不借旧比例。 |
| CSUM-007 | EQUITY当日／20／60值或20日分位比较样本使用derived时标“含推算历史”；推算先由TOTAL分别减INDEX／ETP的Put、Call张数再相除，不是PCR相减。来源标签和20／60比较说明保持上述区别。 |

新摘要不扩大来源覆盖或更改历史数据日期；具体验收见[产品规格](PRODUCT_SPEC.md)的SUM与AC-81／82。v0.2.9部署及实际定时执行与计算测试分别记录。

v0.2.9功能源码daaf0dd实际摘要验收已过：动态去重11行，所选11月26日保留不晚于25日的实际成交日，中英892／320px和无异常通过。99项Node／模型来源、27项fixture浏览器、13项真实云浏览器及12项HTTP为分别记录的证据；未来17:30实际采集仍未观察。

## v0.2.12：由已有张数派生5日窗口

| 编号 | 来源与计算规则 |
| --- | --- |
| CSHORT-001 | 5日成交量PCR在前端视图模型由同类现有每日Put／Call张数合计后相除，不是五个单日PCR均值，也不是Cboe新发布的独立指标。仅使用该点及之前完整的5个预期美股交易日；available:false、缺日／数量或预热不足留空，合计Call为0则r5为空，合法零Put可为0。不新增API字段、来源请求、原始数据或种子；既有20／60值不改。 |
| CSHORT-002 | EQUITY先逐日按原规则分别减Put／Call再合计；完整5日中任一行派生则derived5为true，混合直接／派生的窗口继续标识。原直接发布的单日值、来源范围和checkedAt不重写，时间裁剪／显示长度不得制造未来数据或改变同日窗口。 |
| CSHORT-003 | 同样的5日公式用于OCC时仍是最近5条取得活动记录，不能把Cboe连续日保证推广给OCC或混合来源。历史5日分位／往年比较独立且排除前视；“20日 PCR >／<／= 60日 PCR”的完整标签及hover／焦点说明仅描述相对活跃度，不是净多空、开平仓或涨跌方向。OI不增加滚动均值。 |

当前合同扩展显示指标，不扩大Cboe交易所／产品覆盖。计算／历史／摘要／日历32/32、既有模型11/11、Cboe／参考／设置3项、OI界面5项、相关前端7项与浏览器夹具22/22通过；源构建／发行物及本机安装校验通过，原数据／缓存／SQLite／任务基线保留。夹具无JS异常或POST／PUT，不把模拟值当行情；真实HF部署／只读恢复及实际定时执行分别凭独立运行记录验收。详见[产品规格](PRODUCT_SPEC.md)与[发行规格](RELEASE_SPEC.md)。

## v0.2.13：排序和逐窗方向的来源约束

| 编号 | 来源与解释规则 |
| --- | --- |
| CINT-001 | 仅解释同一来源／类别／标的、同一明确实际日的已有r5／r20／r60。显式日缺记录不近似替代；差分只与确切前一美股交易日同窗值比较，不用前一可见行。Cboe actualEnd与来源／派生身份、检查时间照旧，OCC窗口限制不因解读统一，OI不参与。非交易日实际锚点保留原日／数值／排序，但方向未知、总体不足、不确认连续。 |
| CINT-002 | 同日高低排序不等于上／下方向；1e-12仅消除浮点噪音。每窗缺前日值时该方向未知，任一当前／确切前日三窗值缺失时总体不足。只有5／20在4个确切连续交易日中3次同向非零才确认规则延续，缺口不凑数；60日仅作独立背景，不推出大趋势。 |
| CINT-003 | 三比较是描述性观察而非回测验证、显著性、买卖信号或价格预测；窗口重叠并非独立信号，Call减少也能推高PCR。排序／箭头不代表净多空、开平仓、资金比例或空头人数。不增加来源覆盖、请求、API／结构／种子数据或新轮询，既有20对60说明与5／20／60公式不变。 |

当前合同仅增加读法，v0.2.12证据保持历史含义。解读／摘要22项Node、5日回归8项、权限前端7项及最终浏览器夹具18/18通过，无JS异常或POST／PUT；源构建／发行物及本机安装校验通过，原数据／缓存／SQLite／任务基线保留。真实云端／只读恢复及实际定时执行分别采用独立运行记录。详见[产品规格](PRODUCT_SPEC.md)与[发行规格](RELEASE_SPEC.md)。

## v0.2.14：Gamma／Max Pain的独立来源

| 编号 | 来源边界 |
| --- | --- |
| CSRC-GEX-001 | 新增Gamma／GEX、墙位、零Gamma与单到期Max Pain从独立moomoo WebAPI读取，不是Cboe INDEX／TOTAL／ETP／EQUITY PCR分类，也不是OCC完整日成交量。它们有各自到期范围、供应商更新时间／查询时间及缺失状态，不把这些模型指标拼入PCR或OI历史。 |
| CSRC-GEX-002 | 原Cboe／OCC单日、5／20／60、derived、分位、实际日期和缺口规则不变。新接口是有界进程快照缓存，不意味着Cboe覆盖扩大或Gamma历史归档／实时做市商库存。单位和方向假设未确认时明确未知，不能由PCR推算蓝线、墙位或痛点。 |

Gamma／Max Pain的窗口、比较、动态与验收见[产品规格](PRODUCT_SPEC.md)的v0.2.14；字段和quote:read权限见[moomoo后端说明](MOOMOO_BACKEND.md)。
