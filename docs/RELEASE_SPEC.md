# 发布与安装规格（v0.1.0 基线）

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
