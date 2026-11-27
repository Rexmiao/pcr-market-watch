# Project maintenance rules / 项目维护规则

Keep implementation and specifications current in the same change. 用户要求：功能有改动时，同步更新相关 Spec，中英文版本一起维护。

## Documentation to update

| Change | Chinese documentation | English documentation |
| --- | --- | --- |
| Features, interactions, API/database contracts, historical comparisons, or homepage behavior | [Product Spec](docs/PRODUCT_SPEC.md) | [Product Spec](docs/PRODUCT_SPEC.en.md) |
| Source coverage, PCR calculations, dates, or missing-data rules | [Cboe source scope](docs/CBOE_SOURCE_SCOPE.md), plus Product Spec | [Cboe source scope](docs/CBOE_SOURCE_SCOPE.en.md), plus Product Spec |
| moomoo connection, allowed queries, provider permissions, or credential handling | [moomoo backend](docs/MOOMOO_BACKEND.md), plus Product Spec | [moomoo backend](docs/MOOMOO_BACKEND.en.md), plus Product Spec |
| Installation, packaging, deployment, release contents, or prerequisites | [Release Spec](docs/RELEASE_SPEC.md) | [Release Spec](docs/RELEASE_SPEC.en.md) |
| User-visible capabilities, setup, or public links | [README](README.zh-CN.md) and homepage translations | [Default README](README.md), [English compatibility copy](README.en.md), and homepage translations |

- Update affected documents before declaring a change complete. Unaffected technical rules do not need cosmetic rewrites.
- Keep matching Chinese/English requirement IDs, calculations, limitations, and acceptance criteria in sync. Preserve existing IDs and append new ones.
- Describe implemented, verified, locally running, and published states separately. Planned capabilities must stay labeled as planned.
- Maintain language-specific README/Spec links and reciprocal document-language links. The homepage's English recordings and screenshots may stay English; surrounding copy follows the selected language.
- Keep the repository's canonical `README.md` in English, the complete Chinese version in `README.zh-CN.md`, and the complete English compatibility copy in `README.en.md`. Update both English bodies together. Chinese links select `README.zh-CN.md`; English links select canonical `README.md`. The user's current requirement makes English the first-visit default for this project's hosted application, administrator sign-in and GitHub Pages showcase when no valid URL language or saved preference exists. Preserve valid Chinese URL/saved preferences, bidirectional switching and language-matched document links. Historical static snapshots keep their original language. / 用户当前要求：本项目托管应用、管理员登录及GitHub Pages介绍页首次无有效URL／已存语言偏好时默认英文；保留有效中文直达／已存中文、双向切换及对应语言文档链接，旧静态快照保持原语言。
- Check relevant documentation links and acceptance criteria. For changed executable behavior, run checks that exercise that behavior; documentation-only changes do not require unrelated application tests.
- Record what was checked and any remaining limitation in the change description.
- Performance maintenance is a user-initiated, one-off task: complete the currently requested round, and perform later optimization only when the user explicitly asks again. Do not create automatic/scheduled optimization or continuous benchmarking tasks. Existing daily market-data/OI/structure archives remain independent; normal verification required for authorized changes still applies. / 性能维护由用户逐次明确发起：完成本轮已要求的优化，后续仅在用户再次要求时做一次，不建立自动／定时提速或持续测速任务。既有每日行情／OI／结构归档独立保留，已授权改动所需的常规验收仍按项目规则完成。

## Publication and privacy

- `main` documentation and the static GitHub Pages showcase may evolve after a release. Do not overwrite an existing release ZIP, tag, or checksum to make it appear current. Publish changed installable application behavior under a new version.
- Keep the static showcase distinct from the locally running PCR backend and database. The showcase does not connect directly to the maintainer's computer.
- Never publish personal databases, account/position information, credentials, private screenshots, runtime logs, or browser profiles.
- Use the existing GitHub App/native connection first for repository reads, writes, checks, and publication. Its selected-repository authorization is scoped to the personal `Rexmiao/pcr-market-watch` repository. Continue within existing authorization without restarting login.
- Do not start a GitHub CLI/OAuth login flow that includes organization access. Do not access organizations or request organization permissions for this project. If a needed operation is unavailable, identify that specific missing repository capability instead of expanding authorization to organizations.


## Hugging Face maintenance / Hugging Face维护

- Limit HF operations to the personal `Rexymiao/pcr-market-watch` Space. The user explicitly chose a public entry/source and anonymous PCR reading plus explicit data refresh; owner configuration edits, private pages and administration still require login. Keep the Bucket private, credentials server-only and moomoo grants quote:read only. / HF仅操作个人`Rexymiao/pcr-market-watch`；用户明确选择公开入口／源码、匿名查看PCR和显式更新，编辑／私人页面／管理仍需登录。Bucket私有，凭证仅服务端，moomoo仅quote:read。
- Public refresh shares the operation cooldown/coalescing budget; public Cboe date GET is cache-only. Preserve published-symbol projection, the already-public generic default-seven core exception and source dates. / 公开更新遵守共享冷却／合并，Cboe日期GET只读缓存；保留发布标的投影、已公开默认七标的例外和真实日期。
- Use the official HF browser device flow with task-scoped authorization. Do not probe old credential caches or Git Credential Manager, and do not access unrelated projects or organizations. / 使用官方HF浏览器设备登录及本任务授权，不探测旧凭证缓存或GCM，不访问无关项目或组织。
- Use the existing PRO plan and CPU Basic. Do not silently upgrade hardware, enable billed Jobs or other paid resources; report sleep limits. / 使用现有PRO及CPU Basic，不自动升级硬件、开通计费Jobs或其他收费资源，说明休眠限制。
- Before updating, verify the latest committed writes have a valid visible private backup, pause the old Space and confirm PAUSED, then upload/start and read back state. Source contains reviewed generic files only, never local D-drive personal databases, credentials, private images or runtime logs. / 更新先确认已提交写入有有效可见备份，暂停旧Space到PAUSED，再上传／启动并读回；源码只含审核过的通用文件，不含D盘个人数据库、凭证、私人图片或日志。
- Maintain paired Chinese/English specs and README links in the same change. Keep actual remote proof separate from local/container tests and future scheduled execution; existing GitHub App/personal-repository restrictions above remain unchanged. / 同批维护双语Spec及README链接；远程证据、本机／容器测试及未来定时执行分开，以上GitHub原生连接／个人仓库权限规则不变。

- Verify public access with a fresh client carrying no HF token, app credential or cookies. Record HTTP and actual-browser checks separately; verify public reads/explicit refresh versus private/admin401, use valid unpublished tickers for403 tests (malformed input can correctly return400), and never infer future scheduled execution from manual captures. / 公开访问用无HF令牌／应用凭证／Cookie的新客户端验证；HTTP和实际浏览器分开记录，区分公开读／显式更新与私人管理401，用合法未发布代码验403（非法输入可正常400），不由手动抓取推断未来定时执行。

- Include cloud internal Cache API storage in private SQLite backups and verify Core/Cboe data dates, original checkedAt and history after restart using GET only. Watchlist/OI recovery or a successful POST does not prove cache recovery; never re-fetch after restart and call it restored. Keep bounded cache eviction separate from OI archives. / cloud内部缓存需进入私有SQLite备份；重启后只GET核对Core／Cboe日期、原checkedAt与历史。名单／OI恢复或POST成功不证明缓存恢复，不能重新抓取后冒称已恢复；缓存淘汰不删OI归档。

- The cloud-only durable Cache API uses worker_cache (migration0007, body_gzip_base64) and the existing bounded/private backup contract. Preserve original source times and keep the earlier failed memory-only restore distinct from the verified e4a1282 no-refresh restart. Cache eviction never deletes independent OI archives. / cloud-only持久Cache API使用worker_cache（0007迁移、body_gzip_base64）及既有有界私有备份契约；保留源时间，区分早期内存恢复失败与e4a1282实际无刷新重启成功，缓存淘汰不删除独立OI归档。

- Keep the PCR change summary tied to current lists and each row's actual date. Preserve exact previous-session signed differences and historical percentile samples; never infer market positions or fetch a source merely to display the summary. / PCR变化摘要跟随当前名单和逐行实际日期，保持确切前一交易日带正负号差值及真实分位样本；不推断市场头寸，不为展示而刷新来源。
- Daily diagnostics read safe metadata only. Distinguish monitoring activation, a Ready plan, manual observations and real scheduled execution; never claim a future17:30 run from earlier tests, and never backfill OI for missed days. / 每日诊断只读安全元数据，区分监测起点、Ready计划、manual观察和实际scheduled执行；不由提前测试冒称未来17:30已执行，不补造漏采日OI。
