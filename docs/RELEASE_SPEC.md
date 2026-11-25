# v0.1.0 发布与安装规格

## 交付物

| 交付物 | 内容 | 运行位置 |
| --- | --- | --- |
| GitHub 源码 | `web/`、`worker/`、`db/`、`drizzle/`、`scripts/`、`data/`、`docs/`、构建配置 | 用户自行安装开发依赖并构建 |
| Windows ZIP | 上述源码、`dist/server/index.js`、`start.cmd`、`start-local.mjs` | Windows 本机，Node.js 22+ 与 Python 3 |
| README | 英文实际界面截图、自动播放 GIF、功能、安装方式、Spec 入口 | 仓库首页 |
| GitHub Pages | `site/index.html` 与本地图片 | 介绍页，连接 Release 和源码；不托管完整后台 |
| SHA256SUMS.txt | Windows ZIP 校验值 | Release 附件 |

首次发布版本标签为 `v0.1.0`；这不是历史 Sites 发布编号。源码从当前可运行版本干净导出，不携带原有 Git 历史。

## 安装行为

1. 用户完整解压 ZIP，双击根目录 `start.cmd`。
2. 检查 Node.js，启动 `start-local.mjs`。已有兼容后台时复用该后台；否则从当前目录启动 `scripts/preview.mjs`。
3. 通过 Python 标准库 SQLite 适配器应用版本化迁移。默认数据库位置为 `../local-data/pcr.sqlite3`；可以用 `PCR_DB_PATH` 改变。
4. 后台只监听 `127.0.0.1:8765`，控制台显示地址，浏览器打开失败时可手动访问。
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

演示截图来自隔离的全新数据库，采用初始推荐标的。静态截图的语言为英文；数据时点以截图自身为准。

## 构建和验证

```sh
npm ci
npm run build
npm test
node scripts/validate-artifact.mjs
```

打包前检查文件清单和敏感模式；从最终 ZIP 再检查一次内容。ZIP 包含已构建输出，源码仓库通过 `.gitignore` 排除构建和运行状态。

GitHub Actions 的 `checks.yml` 在 Node.js 22 下构建与测试。`pages.yml` 只发布 `site/`，权限为仓库读取及 Pages 部署；不读取本地应用数据库或 moomoo 凭据。

## 发布验证

- 仓库新建后应有 `main`、README 图片、GIF 和两份具体 Spec。
- Release 应含版本标签、Windows ZIP 和 SHA-256 校验文件。
- GitHub Pages 应返回成功状态，图片路径在 `/pcr-market-watch/` 下可用，手机宽度 320px 无横向溢出。
- 维护者现有本机网站、个人数据库及云端站点访问范围保持独立。
