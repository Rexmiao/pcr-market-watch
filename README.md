# PCR 观察台 · PCR Market Watch

观察美股期权的每日成交、20／60 日趋势、历史分位和往年同期水平。

[项目主页](https://rexmiao.github.io/pcr-market-watch/) · [下载安装包](https://github.com/Rexmiao/pcr-market-watch/releases/latest) · [完整产品 Spec](docs/PRODUCT_SPEC.md)

![Animated walkthrough: historical percentile and prior-year comparison](site/assets/demo.gif)

![PCR 观察台：市场汇总、数据日期和历史趋势](site/assets/dashboard.png)

## 看什么

- **市场参考**：Cboe INDEX、TOTAL、ETF/ETP、EQUITY，以及自行添加的股票或 ETF。初始推荐项可全部删除。
- **个人自选**：搜索代码、Enter 添加、分类、移除，保存在本地 SQLite；与市场参考名单独立。
- **历史趋势**：单日、20 日、60 日成交量 PCR；选择具体日期和显示区间。
- **历史比较**：分别比较三种 PCR 的历史分位、中位数和样本数；往年同期每次对照一个指标。
- **辅助行情**：三大指数、原油、黄金的报价与源时间；可取消悬浮。
- **可选 moomoo**：本机只读行情适配器；不接交易或账户操作。

![历史比较：历史分位、样本数与 PCR 曲线](site/assets/history.png)

## Windows 快速开始

1. 安装 [Node.js 22 或更新版本](https://nodejs.org/en/download) 和 [Python 3](https://www.python.org/downloads/)。Python 安装时可选择加入 PATH。
2. 从 [Releases](https://github.com/Rexmiao/pcr-market-watch/releases/latest) 下载 Windows ZIP，并**完整解压**。
3. 双击 `start.cmd`。使用期间保留 CMD 窗口，可最小化。
4. 打开 **http://127.0.0.1:8765/**。

Windows ZIP 包含已构建的程序。首次运行会创建数据库及默认名单，不附带作者的个人数据库、密钥或浏览器配置。

关闭浏览器不会结束后台；关闭运行后台的 CMD 窗口会结束该次本地服务。再次双击 `start.cmd` 可重新启动。

如 Python 不在 PATH，先设置 `PCR_PYTHON` 为本机 Python 可执行文件路径。`PCR_DB_PATH` 可指定数据库位置；默认在项目目录外一层的 `local-data/pcr.sqlite3`。

## 从源码运行

```sh
git clone https://github.com/Rexmiao/pcr-market-watch.git
cd pcr-market-watch
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:8765/。Node.js 及 Python 3 是必需运行环境；`npm ci` 安装的开发依赖用于源码构建与数据库迁移开发。

```sh
npm test
node scripts/validate-artifact.mjs
```

## 数据和解释

**PCR = Put 数量 ÷ Call 数量。它不是市场空头人数比例，也不是涨跌概率。**

- 20／60 日成交量 PCR 用窗口内 Put 成交量合计除以 Call 成交量合计，不是每日 PCR 的算术平均。
- Cboe 和 OCC 的来源范围、发布日期和覆盖区间不同。Cboe TOTAL 指其报告覆盖的产品合计，不代表全部美国交易所。
- 较早 EQUITY 历史由 TOTAL 减 INDEX、ETP 的成交量分别推导，界面单独标注。
- OI 是独立保存的未平仓快照，不随成交量刷新。新增标的没有可靠 OI 来源时留空，不能理解为持仓为零。
- 历史分位使用所选统计日之前最多 252 个有效历史值，排除当前日和未来数据；样本不足明确显示数量。
- 往年同期曲线按同月同日对齐，缺失不补零；摘要遇休市日最多向前找 7 天，并显示实际日期。
- 源数据未更新时保留最后一次记录，不把旧数据标成今天。

公共历史快照用于展示与计算，日期以数据本身为准；代码发布不改变第三方数据的权利与使用条件。来源及口径见 [CBOE_SOURCE_SCOPE.md](docs/CBOE_SOURCE_SCOPE.md) 和 [PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)。

## 项目结构与具体 Spec

| 路径 | 内容 |
| --- | --- |
| `web/` | 页面、图表、日历、双语、历史比较和自选交互 |
| `worker/` | Web API 与数据源适配 |
| `db/`、`drizzle/` | 配置表定义及版本化迁移 |
| `scripts/` | 构建、SQLite 本机服务、moomoo 适配和检查 |
| `data/` | 带日期的公共市场快照 |
| `docs/PRODUCT_SPEC.md` | 用户故事、需求、API、算法、数据库约束及验收规则 |
| `site/` | GitHub Pages 项目介绍页，不运行完整后端 |

当前发行包以本地运行方式交付。云端 D1 与身份配置需要单独部署，GitHub Pages 本身不能运行 SQLite / moomoo 后端。

moomoo 的安装、权限与只读接口见 [MOOMOO_BACKEND.md](docs/MOOMOO_BACKEND.md)。AppKey 在本机单独配置，不随发布包分发。当前没有云端访问桌面 moomoo 的常驻桥，也没有 AI chat、dealer GEX 或下单功能。
