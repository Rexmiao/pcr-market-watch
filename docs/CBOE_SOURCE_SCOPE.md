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

20/60 日 EQUITY PCR 使用窗口内 Equity Put 合计除以 Equity Call 合计，不平均每日已四舍五入 PCR。窗口需要完整连续交易日及数量；缺口、数据不足或零 Call 合计使该周期 PCR 留空。历史行的 `derived20` / `derived60` 表示对应窗口是否使用过推导数据，允许之后混合直接发布和已标明来源的重建数量。

## API 兼容

- Snapshot 新增 `snapshot.metrics.equity`，字段与其他类别一致，并补充 derived、source、derivation、method。
- History 新增 `rows[].equity`，包含 daily/dailyText、p/c、p20/c20/r20、p60/c60/r60、derived、derived20、derived60、source、method。
- 原三类别的旧缓存可以读取并按上述规则恢复 EQUITY；缺少 EQUITY 不会使原三类记录失效。
- 所有来源及检查时间继续区分活动日期与 checkedAt；恢复历史数量不会把 seed 的原检查时间改为新抓取时间。

SPY、QQQ、DIA 的 PCR 是各 ETF 期权的独立统计，可作为对应指数的 ETF 参考，不能替代 Cboe INDEX 这一汇总分类，也不称为 SPX、NDX 或 DJX 指数期权本身的 PCR。
