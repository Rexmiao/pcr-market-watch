# moomoo 后端接入

本项目通过本机 Node 后端调用桌面端内置的官方 `moomooapp-cli.exe`。
网页不需要接触 AppKey，也不需要单独设置连接按钮。

## 当前已接入的只读能力

| 本机 HTTP API | 参数示例 | 用途 |
| --- | --- | --- |
| `/api/providers/moomoo/status` | 无 | 配置、CLI、最近成功时间和连接状态 |
| `/api/providers/moomoo/quotes` | `?symbols=AMD,NVDA` | 基础行情及接口实际返回的盘前、盘后、夜盘字段 |
| `/api/providers/moomoo/kline` | `?symbol=AMD&count=60` | 最近日 K 线；按需订阅，最多 1000 根 |
| `/api/providers/moomoo/expirations` | `?symbol=AMD` | 期权到期日 |
| `/api/providers/moomoo/option-chain` | `?symbol=AMD&begin=2026-11-27&end=2026-11-27` | 指定到期范围的期权链，单次不超过一个月 |

接口先返回 `provider`、`kind`、`checkedAt` 和 `data`。`checkedAt` 是本后端
查询时间，行情实际时间以 `update_time` / `update_timestamp` 等原始字段为准。
`status` 中的 `configured` 只表示存在配置，首次查询成功后才标记连接成功。
行情实时性和字段覆盖取决于 moomoo 的权限及具体接口；接口连通不代表所有市场
和所有期权都具备实时权限。期权链的静态合约信息也不等于全到期日 PCR。

## 本机启动

1. 保持 moomoo 桌面端已登录；允许外部程序访问并开启 CLI 接口。
2. 本机地址默认为 `http://127.0.0.1:22222`；如果桌面端指定其他端口，设置
   `OPENAPI_HOST_URL`。仅接受本机 loopback 地址。
3. 已配置机器可直接使用“启动本地网站.cmd”。重新设置密钥时，在项目目录运行
   `node scripts/configure-moomoo.mjs` 并输入新的 AppKey；输入不会回显。
4. 密钥通过 Windows DPAPI 加密，位于当前用户 LocalAppData 的 PcrMarketWatch
   目录，保存在项目和 Dropbox 之外。同一用户重启后可以读取；另一台电脑或另一个
   Windows 用户需重新配置。后端环境变量 `OPENAPI_HOST_APPKEY` 可覆盖该配置。
5. 打开本机的 `/api/providers/moomoo/quotes?symbols=AMD,NVDA` 验证行情。

后端仅调用订阅、基础行情、日 K、期权到期日和期权链这五类 CLI 命令，不开放
任意命令代理。AppKey 仅通过子进程环境变量传递，不放入命令行、网页、源码或日志。
没有接入账户查询、持仓查询、下单、撤单或交易解锁。

## 云端范围

云端网站使用云端 D1 保存用户名单。本机网站使用 SQLite，两者目前分别保存，
没有自动同步。云端 Worker 无法直接访问用户电脑上的 `127.0.0.1:22222`，
因此云端 moomoo API 返回 `LOCAL_BACKEND_REQUIRED`，而不是假装提供实时数据。

若以后需要让云端网站显示本机 moomoo 行情，可增加本机采集器，只向云端上传
经过筛选的行情快照；或配置限定只读路由的私有隧道。此桥接尚未实现。不要把整个
券商 Host 接口暴露到公网。桌面端关闭或本机关机后，也不能继续从该桌面端获取新行情。

## PCR 口径

目前日、20 日、60 日成交量 PCR 继续来自 OCC / Cboe。
`PCR = Put 成交张数 / Call 成交张数`，多日窗口按成交量累计后相除。
OI PCR 是另一种按未平仓量计算的快照。它们都不表示市场空头人数或空头资金占比。
moomoo 行情接入与历史 PCR 分开，避免用部分到期日的期权链覆盖全市场统计。
