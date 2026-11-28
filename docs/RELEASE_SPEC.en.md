# Release and Installation Specification (v0.2.21 source and Windows release)

[简体中文](RELEASE_SPEC.md) | **English**

The current public Windows release is [v0.2.21](https://github.com/Rexmiao/pcr-market-watch/releases/tag/v0.2.21), adding custom-domain origin support; v0.2.20 added a Day/Night switch on top of v0.2.19, which added the dark theme, PCR snapshot strip and summary-table refresh on top of v0.2.18's Gamma/Max Pain, 30-day per-expiry archives/history and English-on-first-use runtime support. Personal databases, credentials and task configuration are not bundled. Historical v0.2.3 tags/assets remain unchanged.

CI published v0.2.21 at 2026-11-28T10:11:49Z from tagged commit [0cd70dccb471e1e84a57f0648c53da2d69fe8649](https://github.com/Rexmiao/pcr-market-watch/commit/0cd70dccb471e1e84a57f0648c53da2d69fe8649); the Windows ZIP is 3,728,995 bytes, SHA-256 `929ecb4fb521bd2a75235d3b54a8c7528d68cc5d9218edb8fd6ef785512a2738`. CI published v0.2.20 at 2026-11-28T09:38:48Z from tagged commit [341b78eb181e0df188dab49d130bf42e0d00ebde](https://github.com/Rexmiao/pcr-market-watch/commit/341b78eb181e0df188dab49d130bf42e0d00ebde); the Windows ZIP is 3,724,407 bytes, SHA-256 `a8c9f4922dbd356643ee84e7168b05f53e9d4bb1a05ebc51f542b47ae2abf820`. CI published v0.2.19 at 2026-11-28T08:31:28Z from tagged commit [b29e3a21c4ef9407078aed38dde93a89964677cc](https://github.com/Rexmiao/pcr-market-watch/commit/b29e3a21c4ef9407078aed38dde93a89964677cc); the Windows ZIP is 3,706,122 bytes, SHA-256 `bef29f24aaa8aae5bffa27b6987071a52ca8d516729f157ab4f82708b9d26743`. CI published v0.2.18 at 2026-11-27T07:58:47Z from tagged commit [79a2cfb981b4d79f68a0f498b98d90a636e510a4](https://github.com/Rexmiao/pcr-market-watch/commit/79a2cfb981b4d79f68a0f498b98d90a636e510a4). The Windows ZIP is 3,647,876 bytes and the SHA-256 manifest is 103 bytes. Later main-branch documentation/tests/CI registration may evolve without rewriting this tag, ZIP or checksum manifest. A repeated release check finding the existing Release keeps its original assets rather than overwriting them. Changes to installable runtime behavior require a new version.

Historical HF acceptance: v0.2.7 guest PCR viewing/explicit refresh, login and cache recovery were verified; v0.2.8 administrator password-limit changes, actual cloud credential rotation and prior-data preservation were also verified. Owner edits/private pages require login and the Bucket remains private. These earlier deployment records do not replace independent evidence for the current installer, actual cloud operation or scheduled execution.

## Deliverables

The table covers both the current `main` repository/showcase and the fixed release package. Bilingual copy, the GIF, and showcase updates may postdate the first release. The `v0.1.0` tag and attachment determine the ZIP's actual files; it is not guaranteed to contain documentation or showcase features added later on `main`.

| Deliverable | Contents | Where it runs or appears |
| --- | --- | --- |
| GitHub source | `web/`, `worker/`, `db/`, `drizzle/`, `scripts/`, `data/`, `docs/`, and build configuration | Users install development dependencies and build it themselves |
| Windows ZIP | Source at the corresponding version tag, `dist/server/index.js`, `start.cmd`, and `start-local.mjs` | A local Windows computer with Node.js 22+ and Python 3 |
| README | Default English `README.md`, full Chinese `README.zh-CN.md`, and full English compatibility copy `README.en.md`; English screenshots of the actual interface, an automatically playing GIF, features, installation instructions, and specification links in the matching language | Repository homepage defaults to English |
| Bilingual specifications | Chinese and English versions of the product, Cboe source scope, moomoo backend, and release/installation specifications | `docs/`; related documents link to the same-language version |
| GitHub Pages | `site/index.html`, `site/locale.js`, styles, and local images/GIF | A Chinese/English project showcase linking to matching-language documentation, the release, and source; it does not host the full backend |
| SHA256SUMS.txt | Checksum for the Windows ZIP | Release attachment |

The first public release tag is `v0.1.0`; it is separate from historical Sites release numbers. The source is a clean export of the current working version and does not include its previous Git history.

Documentation and GitHub Pages on `main` may continue to change independently; those updates do not change the published `v0.1.0` ZIP. Published tags and attachments remain unchanged. Subsequent changes to application runtime behavior or the installation package require a new release rather than replacing an existing version.

## Showcase language and documentation links

- `site/locale.js` provides Chinese/English switching for page copy, navigation, buttons, dialog captions, image alternative text, the page title, and its description.
- A valid `?lang=zh` or `?lang=en` takes precedence over the browser's saved language. Otherwise, use `pcr-market-watch:site-language:v1`, defaulting to English when neither choice is valid. The current HF application and administrator sign-in share this first-visit default without resetting existing Chinese preferences. Switching saves the preference and updates the query while preserving anchors such as `#preview`; switching still works when localStorage is unavailable.
- Chinese showcase README links open `README.zh-CN.md`; English opens default `README.md`. Product specifications still select `PRODUCT_SPEC.md`/`PRODUCT_SPEC.en.md`. Keep `README.en.md` as a full English compatibility copy with both English bodies synchronized. Documents offer reciprocal language links. The current hosted application, administrator sign-in and showcase default to English with no valid URL or saved preference; existing Chinese preferences and valid Chinese direct entry take precedence. Historical static snapshots retain their original languages. The GIF and actual interface screenshots remain in English; their captions, alternative text, and dialog text follow the page language.

| Document responsibility | Simplified Chinese | English |
| --- | --- | --- |
| Project overview, features, and usage entry points | [README.zh-CN.md](../README.zh-CN.md) | [Default README.md](../README.md), [compatibility README.en.md](../README.en.md) |
| Product behavior, calculation rules, and acceptance criteria | [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | [PRODUCT_SPEC.en.md](PRODUCT_SPEC.en.md) |
| Cboe statistical coverage and EQUITY history methodology | [CBOE_SOURCE_SCOPE.md](CBOE_SOURCE_SCOPE.md) | [CBOE_SOURCE_SCOPE.en.md](CBOE_SOURCE_SCOPE.en.md) |
| Local read-only moomoo integration and credential boundaries | [MOOMOO_BACKEND.md](MOOMOO_BACKEND.md) | [MOOMOO_BACKEND.en.md](MOOMOO_BACKEND.en.md) |
| Release, installation, and public verification | [RELEASE_SPEC.md](RELEASE_SPEC.md) | [RELEASE_SPEC.en.md](RELEASE_SPEC.en.md) |

## Installation behavior

1. The user extracts the ZIP completely and double-clicks `start.cmd` in its root directory.
2. The launcher checks for Node.js and starts `start-local.mjs`. It reuses an existing compatible backend when one is available; otherwise, it starts `scripts/preview.mjs` from the current project directory.
3. Versioned migrations are applied through the SQLite adapter built on Python's standard library. The default database location is `../local-data/pcr.sqlite3`; `PCR_DB_PATH` can override it.
4. The backend listens only on loopback, using `127.0.0.1:8765` by default. If another program occupies it, the release launcher selects an available port such as `127.0.0.1:8766` without stopping that program. The console displays the actual address, which can be opened manually if automatic browser launch fails.
5. CMD does not close automatically. Closing the browser does not stop the backend; ending the backend process stops that instance of the service.
6. When no user database exists, the web interface initializes the recommended lists once according to the product specification. Subsequent visits read the database, and intentionally empty lists do not restore defaults.

Environment variables: `PCR_PYTHON` selects Python, `PCR_DB_PATH` selects the database, and `PCR_PREVIEW_PORT` selects an independent test port. The desktop moomoo interface is optional and is not required to start the core PCR functionality.

## Functional and calculation acceptance criteria

See [PRODUCT_SPEC.en.md](PRODUCT_SPEC.en.md) for detailed fields, interfaces, migrations, and acceptance scenarios. The main additions in this version are:

- The search field uses a generic bilingual hint. Enter adds a valid typed ticker immediately, or adds the highlighted candidate when suggestions are open. Chinese IME confirmation and held-key repeats do not cause duplicate additions.
- Historical percentiles are calculated separately for daily, 5-session, 20-session, and 60-session PCR. Each uses up to 252 valid observations before the current actual data date, handles ties using the midrank method, and displays the actual sample count, `n`.
- Prior-year comparison shows only one selected measure at a time. Curves match exact calendar month and day, leaving missing observations blank. The summary can look back at most seven days and displays both the target date and actual comparison date.
- Changing the visible range does not change the percentile reference samples. Future observations and the current observation must not enter the reference distribution.
- Volume and OI retain separate source and date labels. Missing OI is not filled with zero or substituted with another symbol's value.

## Public export scope

The application source, schema migrations, public-market snapshots, and demonstration screenshots produced by the application may be exported. The release package excludes the actual personal-watchlist database, brokerage accounts or personal positions, AppKey, environment-variable files, DPAPI files, browser profiles, logs, and older deployment packages.

Demonstration screenshots and the GIF come from an isolated, newly created database using the initial recommended symbols. The actual interface shown in these media uses English, and their own displayed data timestamps apply. Changing the showcase language does not change the media language.

## Build and validation

```sh
npm ci
npm run build
npm test
node scripts/validate-artifact.mjs
```

Before packaging, check the file list and sensitive-content patterns, then inspect the final ZIP again. The ZIP contains built output. The source repository excludes build output and runtime state through `.gitignore`.

GitHub Actions `checks.yml` builds and tests under Node.js 22. `pages.yml` publishes only `site/`, using repository-read and Pages-deployment permissions. It does not read the local application database or moomoo credentials.

For subsequent changes, follow the repository's [AGENTS.md](../AGENTS.md) maintenance rules and update the relevant Chinese/English specifications, READMEs, and validation notes together. Documentation distinguishes implemented behavior, the contents of a fixed release package, and future plans.

### GitHub operations and authorization

Use the existing GitHub App/native connection first to read, write, check, and publish within the authorized personal `Rexmiao/pcr-market-watch` repository, without restarting login. Base changes on the current branch and check its expected head before updating to avoid overwriting concurrent changes. Do not start a GitHub CLI/OAuth login flow that includes organization access, access organizations, or request organization permissions. If a tool lacks a capability, identify the specific unavailable repository operation.

## Release verification

- The repository should have `main`, default English README.md, full Chinese README.zh-CN.md, full English compatibility README.en.md, English demonstration images/GIF, and the paired Chinese/English specifications listed above. Link targets must exist and use the matching language; keep both English README bodies synchronized.
- The release should include a version tag, the Windows ZIP, and a SHA-256 checksum file.
- GitHub Pages should return a successful status, and images/GIF plus `locale.js` should resolve under `/pcr-market-watch/`. The GIF should play, and media should remain in English after language switching.
- Verify `?lang=zh` / `?lang=en`, reload after saving, invalid parameters, and switching when localStorage is unavailable. Switching must preserve URL anchors; Chinese README opens README.zh-CN.md and English opens README.md, with product specifications still matching the selected language. The showcase, HF application and administrator sign-in default to English without a valid URL or saved preference; Chinese direct entry and saved Chinese reload stay Chinese. Historical static snapshots retain their language.
- Page titles, descriptions, body copy, buttons, accessibility text, and image dialogs must update in both languages. The layout must not overflow horizontally at 320px, and the language button must remain usable when visiting `#preview` directly.
- Documentation/Pages-only updates must not replace the `v0.1.0` tag, ZIP, or checksum file. When release behavior changes, verify a new version's tag and attachments.
- The maintainer's existing local website, personal database, and cloud-site audience remain separate.

Related methodology: [Cboe source coverage and EQUITY history](CBOE_SOURCE_SCOPE.en.md).


## v0.2.0 options-monitor deliverables

This iteration adds the options activity panel, auto/desktop/webapi selection, source-isolated caches/OI observations, browser screening, and visible-page refresh. Desktop scans one symbol/expiration, at most 20 nearby strikes/40 contracts. Contract fields use get-basic-qot in at most two batches of 20; full snapshots stay independent. Prints cover three contracts with 200 each. Optional WebAPI supplies provider underlying summaries and up to 300 unusual events, requiring an independent AccessToken. See the [Product Spec](PRODUCT_SPEC.en.md) and [moomoo backend guide](MOOMOO_BACKEND.en.md) for rules and acceptance criteria.

Verify source/build completion, tests, local installation, provider connectivity, and publication separately. Query desktop Host directly or verify independent WebAPI token/permissions; controlled tests are not live provider responses. WebAPI does not need Desktop but the local computer/Node backend must remain running. Always-on hosting needs separate deployment and a server secret. Existing Sites cloud version 12 is not automatically upgraded by a new local package or GitHub showcase. GitHub Pages remains the introduction/download site.

v0.2.0 is the original options-monitor release. The auto-selection fix uses a separate `v0.2.1` tag, Windows ZIP, and checksum, preserving existing `v0.2.0`/`v0.1.0` tags and attachments. Preserve the personal database and DPAPI configuration outside the project during upgrades. Apply only new versioned migrations; do not replay or rewrite old migrations or restore personal lists to defaults.

Additional verification covers real prints versus interval increments, scoped PCR and missing values, unavailable/permission/partial failures, unknown OI settlement dates, first OI observations and cross-date persistence, refresh cooldown and hidden-page pause, unchanged watchlists/revisions, and safe fallback when unrelated services occupy the default port. Public archives must also exclude new monitor caches, per-contract OI observations, and private provider responses.


Additional WebAPI checks cover official OAuth 2.1 PKCE with quote:read only, local callback, a separate DPAPI authorization bundle, refresh from actual expiry information, and reconnection after revocation. Accept valid accid context selectors while rejecting write, trade, and unknown permission capabilities. Save normalized quote:read without outputting actual selectors. Omitted initial scope inherits the bound request only; explicit empty/null scope is rejected. No manual/environment-token mode is provided, and tokens are never persisted to .env. Verify rejection of desktop AppKey as Bearer, redacted failures, isolated provider caches without error failover, truncation notices, and expiry filters that do not alter summary PCR. Add a separate WebAPI per-contract OI table through a new migration without rewriting applied migrations; underlying-summary OI history is not implemented. Exclude authorization bundles, tokens, and private responses from archives.


On 2026-11-25, desktop monitoring returned quotes for 40 selected contracts and saved cache/OI observations. Missing fields and print timeouts verified partial availability only; PCR remains blank. Full snapshots still timed out. WebAPI read-only OAuth and DPAPI storage succeeded, and underlying-summary volume/OI PCR plus unusual events returned actual responses. Incomplete pagination yields partial status; exact overview time and OI settlement date remain unknown. Complete prints, real-time entitlement, and hosted Worker integration remain unverified.


## v0.2.1 patch

Fix auto incorrectly selecting desktop after reading nonexistent isConfigured: use actual client status().configured and prefer configured WebAPI. Verify that WebAPI-only configuration selects its own cache/refresh; collection failures still never switch source. Preserve the v0.2.0 tag/package. Visible-page polling and data-coverage rules are unchanged.


## v0.2.2 dedicated page and homepage OI refresh

Move monitoring to `/options-monitor.html`, with navigation between PCR and Market brief. Current main pages share bilingual navigation and active-page indicators; legacy `/#options-monitor` forwards here. Remove the homepage panel and its requests. Enter the dedicated page expanded, retaining preferences and SQLite/API; polling still requires a visible, expanded page. Add bilingual explanations of orange rule hits, contract fields, side/open-close distinctions, and repeated alerts.

Use a separate v0.2.2 tag, ZIP, and checksum, preserving v0.2.0/v0.2.1 tags and attachments. Include the new HTML and migration 0004 for the latest OI summary cache, preserving personal databases. Reuse read-only authorization without adding account/trading capabilities. All 23 dedicated-page and 16 homepage OI browser checks passed, including navigation/redirects, 320px bilingual display, old collapsed preferences, list reuse, no homepage activity polling, blank historical OI, and independent update states. Pure-model and full existing tests passed; verify installed-database preservation and publication separately.


Also fix homepage gray bars remaining on an old snapshot: add manual Moomoo OI summary refresh/source selection, independently of OCC updates, preserving Cboe seeds. GET reads cache; POST caps 40 symbols/two concurrent summary requests, without events/homepage polling. Verify unknown T−1 settlement dates, preserved original times, no side mixing, blank historical gray bars, latest-view gating, and unchanged lists after migration. The cache stores latest values only, not OI history. Actual manual refresh on 2026-11-25 returned complete put/call OI for all requested symbols without source errors; exact settlement dates remain null. Migration 0004 added the cache table. Public materials exclude actual responses and credentials.


## v0.2.3 card side and time

Activity/print alert cards add provider BUY/SELL/NEUTRAL, undisclosed open/close, and New York ET record date/time to the second, linked by eventId. Keep microsecond fill_timestamp distinct from observation/check times; snapshot and interval alerts never impersonate fills. Missing data stays unknown without inferring open/close or net positioning from Put/side/OI.

Use a separate v0.2.3 tag, ZIP, and checksum, preserving v0.2.0/v0.2.1/v0.2.2. Add no APIs, account/trading capabilities, or collection coverage. Before publication verify repeated contracts/opposite sides, unknown fields, microseconds/daylight saving, card-table consistency, both languages, and narrow layouts. Actual read-only records verified event association, side, and record time, with open/close unknown. All 10 v0.2.3 identity/time checks and 14 bilingual browser checks passed, covering 320px, multiple sides/unknowns on one contract, UTC midnight, New York spring/fall daylight saving, and ignoring undocumented raw OPEN flags. Exclude actual private activity responses and runtime credentials from public archives.


## Unpublished local setup: one-time quote review

The working copy adds `capture-quote-review.mjs`, `register-quote-review-task.ps1`, `run-quote-review-task.ps1`, and `show-quote-review-reminder.ps1`. Create no new release or GitHub publication, and do not replace existing v0.2.3 tags, ZIP, or checksums. Published packages do not automatically contain the tool. The capture tool adds no web/worker APIs; v0.2.4 local archive-read APIs are documented separately. Desktop allowlist, PCR methodology, and personal databases remain unchanged.

Use local Node and the current signed-in Windows user's Interactive session. Private configuration/results stay outside the project under `local-data/quote-reviews`, with credentials in Windows DPAPI. Validate scheduled/cutoff times with offset/Z. Sleep resume may be attempted, shutdown cannot run it, and expired execution only records/reminds of a missed capture. Keep scheduled/actual/provider times distinct; promise neither real-time data nor automatic trading/analysis.

Required verification is `node --test scripts/quote-review.test.mjs`, followed by capture/registration dry-runs without network, DPAPI reads, result writes, or notifications. Record actual registration, manual capture, future triggering, and data availability separately; registered does not mean future execution completed. Public materials include generic code/documentation only, never user task configuration, contracts, results, logs, or credentials.


## v0.2.4 local/unpublished: scheduled reviews page

Add `quote-reviews.html` and local `quote-review-archive.mjs` read-only APIs for actual Windows state/next run, latest results, actual ET date archives, detail/downloads, and local archive counts/bytes. No editing, deletion, execution, or automatic cleanup. Preserve capture tasks/data; failed reads remain unknown and manual tests never establish scheduled completion.

Source may identify v0.2.4, but do not publish GitHub or replace existing public packages; v0.2.3 is unchanged. Private `local-data/quote-reviews`, configuration, results, and scheduler details stay out of source/ZIP/public screenshots. Unuploaded archives are not repository files. GitHub Pages remains a static showcase and cloud hosts have no Windows task data.

New acceptance covers complete jobs/storage with filtered/paged runs, 30-second scheduler caching, unreadable placeholders, safe HTML regeneration/allowlisted JSON, index/paging/detail/downloads, actual state versus configuration, ET dates/multiple result modes, traversal/symlinks/redacted errors, bilingual narrow layouts, and read-only permissions. On 2026-11-26, local v0.2.4 installation/restart, full npm test, 18 independent capture/archive tests, 26 frontend fixture checks, and 11 actual read-only UI checks passed. Artifact validation covers the new page and cloud API 501. Actual Windows state/existing-archive GET, bilingual 320px display, and nextRun/manual separation were verified. Nothing was published to GitHub; existing v0.2.3 tag/ZIP/checksums remain unchanged.


## v0.2.5 local/unpublished: brief state, summaries, and calendar hints

Add the local read-only brief-quotes bridge, preferring authorized WebAPI and using desktop only without cloud configuration. Cloud failure never switches source. Cap 20 symbols/15-second cache with fixed stock-quote and no account/trading access. The brief identifies red failures, amber gaps/cooldown/old values, and blue normal/waiting by source/cause. Use strong emphasis for the three index-summary percentages, retaining signs/dates.

The calendar states at least one recorded symbol and shows coverage counts, without guaranteeing complete lists/windows/OI. Historical OI never borrows latest snapshots; latest missing reliable values explain their cause. Cboe/OCC algorithms and seeds are unchanged. Full npm test, three calendar-coverage checks, 11 source-classification checks, 18 frontend fixture checks, and 14 actual read-only UI checks passed. Actual WebAPI quotes succeeded, healthy sources avoided broad failure styling, and pending publication was blue. Cloud 501 artifact behavior, three strong percentages/16px body text, bilingual 892/320px layouts, complete/partial coverage, above-chart OI reasons, and title/aria were verified. All requests were GET without source refresh or watchlist writes. Latest recorded session remains the maximum record-date union, not complete-list coverage. Quote-update time is not a specific trade time; verify installation/deployment and publication separately.

This is local source v0.2.5 only, with no GitHub publication. Retain v0.2.4 local capabilities and public v0.2.3 tags, ZIP, and checksums. Public documents contain no private contracts, configuration, or screenshot paths.

## v0.2.6 local/unpublished: daily OI and Hugging Face source package

| ID | Delivery and acceptance requirement |
| --- | --- |
| REL-OI-001 | Include migration 0005, oi-history/oi-summaries, historical gray bars/date index/bilingual timestamp explanations, and separate daily OI status. Preserve databases/applied migrations, adding only the new table. Legacy cache import uses original query dates only. |
| REL-OI-002 | Include oi-daily and register-oi-daily-task/run-oi-daily-task. Default to daily 17:30 ET with the current persisted list rather than fixed seven symbols. State Interactive/Limited, checked Eastern time zone, sign-in/computer/network requirements. Preserve the one-time Friday quote task. |
| REL-OI-003 | Verify real SQLite append/deduplication/restart, New York midnight/DST, original cache times, no failure-generated new day, zeros/missing sides/unknown settlement dates, exact historical gray bars, independent volume fallback, and bilingual calendar/status. Record registration, manual tests, and future triggering separately without claiming future execution. |
| REL-HF-001 | Supply Dockerfile/.dockerignore, Node 22/Python 3, private authentication gateway, runtime quote-only authorization, consistent backups, and source preparation. Maintain the [English Hugging Face guide](HUGGING_FACE.en.md) and [Chinese guide](HUGGING_FACE.md). Prepared source establishes neither a deployed Space nor a resource purchase. |
| REL-HF-002 | Source allowlists exclude personal databases, OI/quote archives, DPAPI, tokens/.env, accounts/positions, private screenshots, logs, and browser profiles. Include generic source/migrations/public seeds only. Never upload personal data or Windows authorization bundles to HF/GitHub source repositories. |
| REL-HF-003 | Verify password gating, same-origin/identity-header filtering, restricted cloud routes, unexpired quote:read Secrets and expiry failure, ephemeral live-database/mounted-backup separation, consistent backup checksums, and restore. Cloud authorization renewal is unavailable. Sleeping/stopped processes cannot run; unverified durable mounts cannot enable daily archives. Account-plan/storage choices remain separate. |

Keep source v0.2.6 separate from public v0.2.3. Documentation/local installation never replaces existing releases. Future installable behavior needs a new tag, ZIP, and checksum. Record actual installation, checks, and remote deployment separately rather than describing local operation as live Hugging Face hosting.

On 2026-11-26 local v0.2.6 was installed after a consistent pre-migration backup. Actual manual OI capture and original-query-day archive reads succeeded. The daily Windows task is Ready for 17:30 ET and the existing Friday task is preserved. Future scheduled execution remains unobserved. No new GitHub release or Hugging Face deployment is completed.

## v0.2.7: independent cloud grants and durable task state

These current rules supersede v0.2.6 static cloud credentials; older checks describe older versions only.

| ID | Delivery and acceptance |
| --- | --- |
| REL-CLOUD-001 | Include cloud-auth/runtime-auth and tests. Independent quote:read grants use encrypted Secret bootstrap, AES-GCM ciphertext/previous version, cross-process locking and actual-expiry refresh. Do not transfer old DPAPI. Expired refresh grants need consent; raw/static modes are compatibility only. |
| REL-CLOUD-002 | Gateway supports HF Bearer, separate X-PCR-Authorization and12 h signed HttpOnly browser sessions. Verify same-origin login/logout, Secure/SameSite, throttling, expiry/tampering and credential-header stripping. |
| REL-CLOUD-003 | Migration0006 adds oi_daily_state/oi_daily_runs without rewriting applied migrations. Verify failure preserves previous state and real SQLite restore survives missing runtime files without losing run metadata or repeating capture. |
| REL-CLOUD-004 | Verify the actual public Space, CPU Basic, private mounts and source version. Separate guest PCR reads/refresh from owner edits, and distinguish HTTP checks, browser checks, restore and future scheduled execution. Extra billed resources need an explicit choice. |

No GitHub publication is performed in this iteration; preserve v0.2.3 tags/ZIP/checksums. Source preparation/local-container checks do not replace actual remote access/recovery evidence. Disclose CPU Basic sleep and refresh-grant lifetime.

### HF login and durability addendum

| ID | Delivery and acceptance |
| --- | --- |
| REL-CLOUD-005 | Login Referrer-Policy preserves the actual Origin. HF HTTPS partitioned __Host- sessions and5 min signed CSRF support only specified parent compatible login. Other mutations remain app same-origin, rejecting null. Verify real browser separately from APIs. |
| REL-CLOUD-006 | Fixeddatafree IPC after SQLite commit triggers500 ms debounced backup; writes during backup queue another pass. Include5 real SQLite checks andfinalshutdown drain. Abrupt crashes cannot guarantee zero loss. |
| REL-CLOUD-007 | Before updates verify a valid visible backup, pause the old Space until PAUSED, then upload/start and read back state. Never rely on the old Pod'slate shutdown backup catching a new Pod. Private operator helpers stay outside source. |

Independent grants and the first7 OI observations were verified. The current public CPU Basic Space uses a private Bucket without extra billed resources. Login/restore/final anonymous HTTP passed; all24 actual signed-outHF Edge checks passed separately. Future17:30 triggering is unobserved; GitHubv0.2.3 stays unchanged.

### Public-entry acceptance

| ID | Current release boundary |
| --- | --- |
| REL-CLOUD-008 | Selected guest PCR reads/refresh are deployed. Actual anonymous pages/data200, refresh7/7/cooldown429 and private APIs/pages401 passed. Owner login/private Bucket remain; final HF guest-browser checks are separate. The older entry-only gate no longer describes current mode. |
| REL-CLOUD-009 | Retain14 existing OI observations and watchlist/history recovery, plus a new actual7/7 guest capture. Settlement remains unknown; backup metadata may lag seconds. Public settings reportcloud, Windowslocal unchanged. Preserve GitHubv0.2.3; future scheduled execution is unobserved. |

The earlier owner-only verification used commit022db75b9a5f666dd9f413dfdae69ab7be50cae1; final guest HTTP checks use the newer789f9f5 source. Record any final changed commit separately; this is not a permanently latest hash. No extra billed hardware/Jobs.

### Final guest mode (v0.2.7, HF HTTP verified)

| ID | Release acceptance |
| --- | --- |
| REL-PUB-001 | Explicit PCR_PUBLIC_VIEW=1 lets guests view PCR and explicitly refresh sources, using readOnly:true/canRefresh:true. Owner login protects edits/private pages; hide unavailable frontend controls. |
| REL-PUB-002 | Public projection contains published symbols/references and the already-public default-seven core exception. Filter private group names, owners, accounts/positions/credentials, unexpected custom data and raw provider administration. |
| REL-PUB-003 | Share60-second refresh/coalescing with429 retries. Public Cboe GET is cache-only, missing dates200/empty; only budgeted explicit POST fetches. Preserve dates, unknown settlement and calculations. |
| REL-PUB-004 | Local/Docker/frontend and actualHF anonymous HTTP checks passed. The24 actual signed-outHF Edge checks also passed; HTTP is not a browser substitute. Keep the Bucket/server grants private without extra paid resources or replacing GitHubv0.2.3 releases. |

## Durable cloud internal-cache correction (v0.2.7, actual restore verified)

Historical failed restore before the correction: watchlists,28 OI observations and grants restored, but Node Core/Cboe cache was memory-only and fell back to seed. Those HTTP/watchlist/OI checks **did not establish Core/Cboe persistence at that stage**. Retain this failure as history; migration0007 and the separate later no-refresh restart proof below establish the current success.

| ID | Repair contract |
| --- | --- |
| DCACHE-001 | Migration0007_worker_cache.sql adds worker_cache with body_gzip_base64, bringing the migration count to8. Install the SQLite Cache API only in cloud preview; do not change Windows/native Worker behavior, applied migrations or OI/watchlist data. |
| DCACHE-002 | Accept only four key families beneath /__pcr_internal_cache__/: complete-v1, symbol-v1/{ticker}, cboe-v1/{latest or date}, cboe-history-v1/all. Cache only200/public/max-age JSON. Limits: raw≤4MiB, gzip≤512KiB, base64≤700KiB,128 entries; prioritize complete/Cboe full-history/latest. Expire using max-age capped at30days. Expose no arbitrary cache endpoint or authentication/Cookie/admin persistence. |
| DCACHE-003 | Clone Responses before put and return fresh Responses from match. Preserve original JSON/response metadata/checkedAt/asof instead of manufacturing a new query time on reads or restore. Missing/expired/oversized entries are cache misses, never invented or borrowed-date observations. |
| DCACHE-004 | Include the table in existing consistent SQLite backups, retaining controlled post-write backups and a private Bucket. This bounded cache is not an unlimited OI archive; eviction must not remove independent OI history. |
| DCACHE-005 | Actual restore acceptance requires successful Core/Cboe refresh and a verified backup, then PAUSED→upload/start. Without another POST refresh, compare Core data date, snapshot date/original checkedAt and history actualEnd/row count. Post-restart re-fetch is not restoration proof. |

The repair and actual cloud no-refresh restore now passed. Feature source e4a1282 uses 8 migrations. Update Core/Cboe data dates to 2026-11-25, with 252 Cboe history rows, verify 12 private database snapshots plus 12 manifests, then PAUSED→restart the same commit. Public GET only in the new process preserved coreDate/coreCheckedAt/coreRowsSHA and cboeDate/cboeCheckedAt/cboeSnapshotSHA/cboeHistoryEnd/cboeRowCount/cboeRowsSHA exactly, retaining 35 OI observations without post-restart refresh. Full npm test passed 78 Node cases plus model/source checks. Guest/owner boundaries, CPU Basic/no extra paid resources and unobserved future17:30 execution remain unchanged.

## v0.2.8: Administrator login configuration (cloud rotation verified)

Password length is this application's configuration rule, not a Hugging Face platform requirement. Changing it does not require changing saved data or quote authorization.

| ID | Requirement and acceptance |
| --- | --- |
| ADMIN-001 | Administrator passwords allow10 to256 characters, still rejectingCR, LF andNUL. Usernames retain1 to64 ASCII letters, digits, underscores or hyphens. The generic default remains pcr; actual credentials never enter source, documentation, build arguments, URLs or logs. |
| ADMIN-002 | Rotate only the PCR_CLOUD_USERNAME variable and PCR_CLOUD_PASSWORD Secret. Session and CSRF signatures remain derived from username/password, so changing either invalidates old sessions/CSRF and requires the owner to sign in again. Existing login throttling, same-origin, Cookie and guest-access rules remain. |
| ADMIN-003 | Preserve PCR_CLOUD_AUTH_KEY, encrypted moomoo bootstrap/authorization files and quote:read consent. Preserve the database, watchlists, OI archives, worker_cache and private Bucket without a data migration or extra paid resources. Application login changes do not change HF or moomoo account passwords. |
| ADMIN-004 | Verify a private backup and pause toPAUSED before applying new source and both login settings, then start. Verify new credentials work, old credentials/sessions cannot access owner APIs, guest viewing/refresh remains, and prior lists/archives recover. Re-fetching must not stand in for restore evidence. |

Current status: v0.2.8 feature source213de51 is RUNNING onHF. The selected new administrator credentials passed actual owner200 checks; old Basic credentials and old session Cookies returned401. The real form returned303 and session homepage/API200, retaining Secure/HttpOnly/Partitioned flags. The7 prior watchlist preferences,42 OI observations and Core/Cboe row hashes matched, and the quote-encryption key was unchanged. Guests still view without login and may refresh. These are actual HTTP/data checks without publication of personal credentials. Earlier v0.2.7 guest/cache-recovery evidence and GitHub v0.2.3 release files remain unchanged; future17:30 automatic execution is unobserved.

## v0.2.9: Summary and execution-diagnostics delivery

| ID | Release requirement |
| --- | --- |
| REL-029-001 | Package the current-source PCR summary, pure value/calendar model, translations and related checks. Generate rows from current lists rather than a fixed seven-symbol UI limit. Preserve published v0.2.3 ZIPs/tags/checksums. |
| REL-029-002 | Diagnostics extend existing state/run records and the owner-only read endpoint without a new migration or real credentials, accounts/positions, personal databases, logs or private images. Preserve v0.2.8 administrator settings and quote:read consent. Diagnostic reads cannot renew credentials or fetch quotes. |
| REL-029-003 | Verify summary dates/gaps/zeroes/percentiles, dynamic lists, response races, languages and 320px. Cover first activation, due plans, scheduled/manual evidence, safe authorization and zero-effect GETs. Record local/real-browser/HF and the future actual 17:30 run separately; clock fixtures/manual runs are not real scheduled proof. |
| REL-029-004 | Release in verified-private-backup→PAUSED→upload/start→state-readback order, limited to the current personal PCR Space. Retain CPU Basic/sleep limits without automatic hardware/Jobs upgrades. Synchronize paired specs, READMEs and local documentation. |

v0.2.9 feature source daaf0dd passed actual HF deployment checks: 99 Node cases plus model/source checks, 27 fixture-browser, 13 real anonymous-cloud browser and 12 read-only HTTP checks are recorded separately. The 7 prior preferences, 42 OI observations and Core/Cboe hashes remained. Before the first 17:30 plan the task is waiting and scheduledEvidence remains unobserved; tests/manual captures are not actual scheduled execution. The public GitHub release remains v0.2.3, current administrator/quote consent is preserved, and no paid resources were added.

## v0.2.10 historical record: Watchlist shortcuts

The old top-navigation/single-entry contract and acceptance below apply only to v0.2.10. Current navigation follows v0.2.11.

| ID | Release requirement |
| --- | --- |
| REL-030-001 | Package the bilingual native links in the homepage navigation/quote strip, the #watchlist-panel target and required navigation code/styles. Add no API, dependency or database migration, and no targetless links on other pages. |
| REL-030-002 | Verify measured floating-strip clearance, unpinning, mobile/desktop, languages, initial deep links, Enter/Back, section focus and reduced motion in a browser. Confirm zero search/refresh/settings-write side effects and unchanged permissions. Record implementation checks, real HF access and local synchronization separately. |
| REL-030-003 | Preserve administrator credentials, quote:read consent, private databases/Bucket and scheduled tasks. Add no paid resources and do not overwrite GitHub v0.2.3 release files. Deploy after verified backup→PAUSED→upload/start→read-only checks, synchronizing bilingual specs, READMEs and relevant local documentation. |

Actual acceptance: v0.2.10 functionality is running on HF, retaining public CPU Basic hosting and the private Bucket. Source build/artifact validation and 7 related frontend tests passed, along with 27/27 fixture browser checks, 21/21 anonymous cloud browser checks and 12 read-only HTTP checks, with no JS errors. No source refresh or data update was triggered. Existing watchlist, OI, Core/Cboe data, consent and the 17:30 plan were preserved. Relevant local files were installed/built/validated/restarted, retaining private databases and both Windows task configurations. GitHub v0.2.3 release files are unchanged; the first real 17:30 execution remains unobserved.

## v0.2.11: Four quote-overview shortcuts

| ID | Release requirement |
| --- | --- |
| REL-031-001 | Deliver four entries only inside the quote card, stable focusable targets and a shared ETF trend wrapper; remove the old top-navigation Watchlist shortcut. Entries remain usable when unpinned. Market/ETF views select saved items only; empty lists and loading/failed settings show bilingual disabled reasons without restoring entries. |
| REL-031-002 | Verify both languages/desktop/320px, four deep links, keyboard/Back/repeat activation, measured floating clearance and section focus; cover date/range changes followed by unpin/repin and reduced-motion history navigation, plus deferred focus when an initially hidden target becomes visible. Selection may GET existing cached data, with zero source POST/refresh/search/any preference writes/new polling. Retain dates, ranges, saved references and permissions. Record implementation, browser, real HF and local results separately; v0.2.10 evidence does not replace this version's acceptance. |
| REL-031-003 | Add no API, dependency or database migration. Preserve administrator credentials, quote:read, private Bucket/databases and tasks without paid resources. Deploy in backup→PAUSED→upload/start→read-only-check order; synchronize these eight documents and relevant local copies. Keep GitHub v0.2.3 tags/ZIPs/checksums unchanged. |

v0.2.11 release validation: source build/artifact validation, 7 related frontend tests and 33 fresh-profile fixture-browser checks passed, with no JS errors or POST/PUT; ETF reads used cache-only GET. The 18 relevant local files were installed/built/validated/restarted, retaining the watchlist, OI, market preferences, Core/Cboe dates/check times/rows, private SQLite and both Windows task configurations. HF deployment and read-only recovery are verified by independent runtime records, not inferred from these local/fixture results. GitHub v0.2.3 release files are unchanged; the first real 17:30 execution remains unobserved.

## v0.2.12: 5-session volume PCR and full trend explanations

| ID | Release requirement |
| --- | --- |
| REL-032-001 | Package five-session derivation from existing daily counts, the summary column, four series/statistics across three history areas, existing Cboe/ETF historical comparisons and bilingual full >/< /= explanations. Do not alter 20/60, APIs, databases, seeds or provider permissions. |
| REL-032-002 | Independently verify weighted ratios, Cboe consecutive/OCC recorded windows, missing/zero Call, warm-up, cut-date no-look-ahead, derived5, percentile and prior-year comparison. Browser checks cover both languages/320px, hover/focus and preserved dates/ranges/navigation. Record implementation/local and actual HF deployment/recovery separately. |
| REL-032-003 | Synchronize paired Product/Release/Cboe-scope specs, three READMEs and the HF template. Preserve data, credentials, quote:read, private Bucket and tasks. Follow existing backup/pause/deploy/read-check rules without paid resources or changes to GitHub v0.2.3 tags/ZIPs/checksums. |

v0.2.12 release validation: math/history/summary/calendar passed 32/32, including 8 new five-session checks; model 11/11, 3 Cboe/reference/settings, 5 OI-interface, 7 related frontend and 22/22 fresh-profile fixture-browser checks passed, without JS errors or POST/PUT. Source build/artifact validation and installation/build/validation/restart of 32 relevant local files passed, retaining source data, cache, SQLite and both Windows task baselines. HF deployment/read-only recovery use independent runtime evidence, without inferring cloud completion from these results. GitHub v0.2.3 is unchanged and the first real 17:30 task remains unobserved.

## v0.2.13: Observational ordering and per-window changes

| ID | Release requirement |
| --- | --- |
| REL-033-001 | Package the pure pcr-interpretation model, shared bilingual renderer, summary column and selected symbol/Cboe-ETF readings. Sort same-date values and difference each window against the exact preceding U.S. session; three matching comparisons require four exact sessions. Retain 5/20/60 and existing 20-versus-60 help without new APIs/schema/seeds/OI or source collection. |
| REL-033-002 | Independently verify order versus direction, epsilon, holidays/gaps/no look-ahead, partial/insufficient states, three-comparison continuity and independent r60 background. Browser coverage includes both languages/320px, hover/focus, dates/empty lists/history blocks and existing navigation/permissions. Do not present rules as backtested signals or price forecasts. Keep calculation/local and real HF deployment/recovery evidence separate. |
| REL-033-003 | Synchronize paired Product/Release/Cboe-scope specs, three READMEs and the HF template. Preserve data, times, credentials, quote:read, private Bucket and tasks. Follow backup/pause/deploy/read-check rules without paid resources or changes to GitHub v0.2.3 tags/ZIPs/checksums. |

v0.2.13 release validation: 11 interpretation plus 11 summary checks passed (22 Node total), alongside 8 five-session regressions, 7 permissions/frontend checks and final fresh-profile fixture-browser checks at 18/18, without JS errors or POST/PUT. Source build/artifact validation and copying/build/validation/restart of 24 relevant local files passed, retaining data/cache/SQLite and both Windows task baselines. HF deployment/read-only recovery require independent runtime records, not cloud completion inferred from local/fixture tests. GitHub v0.2.3 is unchanged and the first real 17:30 task remains unobserved.

## v0.2.14: Gamma/Max Pain delivery

| ID | Delivery and acceptance |
| --- | --- |
| REL-034-001 | The source package includes the dedicated option-structure page/bilingual controls, strike GEX bars and hypothetical-spot profile,30-day default with nearest/7d/all, excluding-nearest comparison, independent single-expiry Max Pain, fixed official market-data adapters, cache/public boundaries and meaningful checks. Public source excludes actual provider responses, personal databases/screenshots, accounts/positions, grants and runtime logs. |
| REL-034-002 | Verify calendar dates/expiration lists/one-expiry exclusion,256-character filters, missing/multiple roots/missing values/negative numbers, bounded responses/cache, independent failures with original times, cross-day stale state and published-ticker/same-origin/60-second budgets. Explain that the blue line is neither a cumulative strike-bar plot nor a price forecast; provider units/dealer directions are unknown. Fixed-OI Max Pain does not move merely because spot moves and is not a price target. |
| REL-034-003 | Update paired Product/moomoo-backend/Release specs, all three READMEs and showcase language-specific capability/document entries in the same batch. Keep README English by default and its English compatibility body synchronized. Do not overwrite GitHub v0.2.3 tags/ZIPs/checksums or claim the older installer includes this source addition. |
| REL-034-004 | Preserve administrator credentials, quote:read, private Bucket/database, existing Core/Cboe recovery and OI archives/tasks, without new migrations or paid resources. New GEX/Max Pain uses bounded process cache, without historical/restart-persistence promises. Publish through verified backup→PAUSED→source upload/start→read-only restoration checks. Record calculation/fixture/provider probes/local installation and actual HF/browser evidence separately. |

Confirmed local provider probes and limitations are recorded under v0.2.14 in the [moomoo backend guide](MOOMOO_BACKEND.en.md); they do not prove page/installation/HF publication. Application and deployment verification is confirmed by separate release-verification records rather than inferred from local provider probes. The public GitHub release remains v0.2.3.

v0.2.14 pre-update baseline, separate from earlier unobserved-stage records: the existing cloud daily OI task now has actual scheduled-success evidence on 2026-11-26 at 17:30:32–17:30:33 New York time (22:30:32.014Z–22:30:33.959Z UTC), with seven requested, seven saved and zero unavailable; this was not a manual test. The 22:30:40.458Z private backup manifest, SQLite quick_check and SHA were verified, with 56 OI observations and four worker_cache rows. After this update, independent GET-only checks must still confirm these baselines. This is neither scheduled Gamma/Max Pain collection nor proof of this batch's HF publication.

v0.2.14 verification at this stage: 14 backend checks, 11 frontend checks, 19 new fixture-browser checks, eight actual local provider-backed application-route checks and 15 actual local-browser checks passed separately. Full npm tests exited 0 after repairing a missing mock in the pre-existing test harness; the first 54 and later 99 checks and chained scripts are separate records, not added as independent overlapping totals. At this stage 36 relevant files were synchronized to D:, preserving five saved symbols/revision 13, ten local OI observations, the database and both tasks. The provider, local and synthetic-browser evidence above is independent of HF acceptance in the deployed environment. Separate release-verification records confirm cloud deployment, anonymous HTTP and actual-browser results; local tests do not establish them. Later source and documentation changes follow the same acceptance and synchronization rules.

## v0.2.15: Chinese labels, strike distribution and supporting quotes

| ID | Delivery and acceptance |
| --- | --- |
| REL-035-001 | Current Chinese navigation/titles/buttons use “伽马 / 最大痛苦” and the corresponding Chinese terms, optionally introducing Gamma/Max Pain in parentheses. English keeps Gamma / Max Pain. Preserve historical records and official reference titles; synchronize Product GUI-015 requirements, all three READMEs and the HF template's current source version. |
| REL-035-002 | Bilingual help identifies blue as the selected expiration set and orange dashed as excluding its nearest expiry. Profile differences describe that expiry's modeled contribution only at equal hypothetical spot and otherwise identical model conditions. Different times/grids establish no exact contribution, capital flow or future profile. Preserve gaps/individual timestamps; explanation changes do not alter calculations/APIs/permissions/databases/sources or add polling. |
| REL-035-003 | Verify language switching, current names, legends/limits, existing-page regressions and relevant builds. Record local and HF deployment/anonymous-HTTP/actual-browser evidence separately. Local D: synchronization preserves private data/credentials/tasks; cloud updates retain the backup/pause/source-upload/read-only-verification process. Preserve GitHub v0.2.3 tags/ZIPs/checksums without implying the old installer includes this source change. |
| REL-035-004 | Put side-by-side Call/Put strike bars and gray net-value diamonds before the aggregate profiles, without aggregating strikes or connecting net markers into a curve. Keep readable widths and selected-snapshot spot/wall markers. Preserve the default ±15% view plus All prices, full-range table with at most 500 rows/truncation, independent hypothetical-spot curves and Max Pain components. Verify scope/data/calculations are unchanged by display choices. |
| REL-035-005 | Add Yahoo Finance BTC-USD to existing floating Market overview with independent USD price/provider time/check time. Test provider-previous-close change and one-day-only chartPreviousClose fallback, UTC source-date/New York display, missing/stale/partial data, six-item bilingual/narrow/floating layouts and existing refresh budgets. State crypto 24/7 and potentially delayed quotes, without a rolling 24-hour guarantee, new moomoo authorization, PCR/watchlist insertion or new database/source-combination behavior. |

See GUI-015-001 through 008 in the [Product Spec](PRODUCT_SPEC.en.md). Independent release-verification records establish the running version and acceptance outcomes; local checks do not establish deployed cloud state.

## v0.2.16: Automatic views for key prices

| ID | Delivery and acceptance |
| --- | --- |
| REL-036-001 | Current source defaults to Auto price domain, with manual Near spot ±15% and All alternatives, without custom numeric inputs. Distribution uses selected-snapshot spot/Call Wall/Put Wall; aggregate profiles use the displayed snapshots' spots/walls/all roots. Apply Product GUI-016's spot ±15% starting intervals, key-level expansion, 5%-per-end span margins and nonnegative lower bound, with explicit missing-spot/no-anchor fallbacks. |
| REL-036-002 | Verify distant walls, multiple roots/two-snapshot union, missing/invalid anchors/full-source fallback, manual choice across language/scope/snapshot rerenders and existing-chart regressions. Axis changes invent no points, interpolation/extrapolation or recalculation and change no expirations/sources/permissions/cache/database/polling; level cards and the 500-row table limit remain. |
| REL-036-003 | Synchronize paired Product/Release specs, three READMEs and HF current source version. Preserve v0.2.15/earlier history, GitHub v0.2.3 tags/ZIPs/checksums and private data/credentials/tasks. Local and cloud updates retain separate synchronization/backup/pause/source-upload/read-only-verification workflows. Independent release-verification records confirm running versions and actual browser acceptance. |

See GUI-016-001 through 006 in the [Product Spec](PRODUCT_SPEC.en.md) for the display algorithm and limitations; documentation/local checks alone do not establish deployed cloud success.

## v0.2.17: Durable daily structure archive and history comparison

| ID | Delivery and acceptance |
| --- | --- |
| REL-037-001 | Include migration 0008, separate 17:45 scheduling/standalone Windows runner, historical database APIs and bilingual primary/comparison date/scope/expiry controls. Reread the published watchlist/reference union; capture per-expiry GEX/Max Pain within 30 calendar days plus 30d/excluding-nearest GEX. Label failures/budget gaps, without averaging pain points or inventing missing dates. |
| REL-037-002 | Verify append-only/run uniqueness, manual/scheduled distinction, sequential source times, midnight-return boundaries, same-day checkpoints/leases/retries, sleep/late-wake actual-today behavior, database-only history/safe status and owner capture 202. Keep expired historical contracts readable and missing dates empty. Include new tables in consistent private backups and verify originals after restart with GET only. |
| REL-037-003 | Update paired Product/moomoo/Release/HF guides, three READMEs and HF template together. Separate volatile live cache from durable archives and reject full-chain-backtest claims. Preserve PCR/OI/tasks/administrator/quote:read; the new task is distinct from 17:30 OI. Add no paid hardware/Jobs and upload no private data. |
| REL-037-004 | Independently verify local migration/task registration, manual provider observations, cloud backup/pause/source deployment, anonymous HTTP, actual browsers, GET-only recovery and future actual 17:45 execution. Keep personal repository/Space boundaries and GitHub v0.2.3 tags/ZIPs/checksums. Tests/manual success do not prove scheduled execution. |

See GARCH in the [Product Spec](PRODUCT_SPEC.en.md) and the [backend guide](MOOMOO_BACKEND.en.md). Independent release records establish running versions, coverage and verification outcomes.

## v0.2.18: History-read performance and identical-data acceptance

| ID | Delivery and acceptance |
| --- | --- |
| REL-038-001 | Deliver bounded page caches, same-key request coalescing, one ordinary read-only status SQL statement (at most three bounded reads for large checkpoints) and30-second successful Windows-task metadata caching under PERF-018/PERF-API. Add no migration, quote permission, paid resource or collection-rate change. Cover A/B sharing/independent cancellation, TTL/LRU/byte caps, oversized/failed entries not cached, reload/capture-completion/list/permission invalidation and late-request isolation. Preserve SQL results, original times, dynamic lease decisions and write-free GETs. |
| REL-038-002 | Synchronize paired Product/backend/Release/HF guides, three READMEs and the HF template. Current source/Windows release is v0.2.18; later main documentation/tests may evolve independently. Preserve v0.2.17 historical sections, historical v0.2.3 assets and published v0.2.18 tags/ZIPs/checksums without overwriting releases. Record controlled request counts/bytes/p50/p95 separately from actual timings, without treating a benchmark as a cloud promise. Preserve personal local data/tasks. Verify the latest private backup and confirmed PAUSED before cloud upload/start; use GET only after restart to compare original archives/PCR/OI/source times. Verify anonymous HTTP and real browsers separately. |

Manual captures, tests and Ready plans do not establish future 17:45 execution. Reduced repeated page reads must not be described as faster provider-wide chain collection.

This change also makes English the no-preference first-visit default for the current HF application (including administrator sign-in) and GitHub Pages showcase, preserving valid URL/saved Chinese precedence and switching both ways. Reuse HP/AC language acceptance for matching document links, unavailable storage, narrow layouts and historical snapshots' original languages. New source features are not presented as existing v0.2.3 installer contents.

## v0.2.19: Interface refresh and dark theme (released on GitHub and HF)

| ID | Delivery and acceptance |
| --- | --- |
| REL-039-001 | The source package changes the front end only: all 6 app pages load `theme.css` and `theme-dark.css` (dark blue-slate, charts/tooltips included); the homepage PCR snapshot strip (TOTAL first); the wide summary table with a sticky first column and decimal alignment; the compact floating quote bar; a language switch showing both English / 中文; unified accent bars; and PCR trend colours ordered by importance (daily gray, 5-session teal, 20-session bright blue, 60-session amber). See Product Spec UI-019-001 to 010. No API, calculation, database migration, credential, quote:read, cooldown, polling or public/owner permission change; archived static snapshots keep their original look and language. |
| REL-039-002 | Produce `pcr-market-watch-v0.2.19-windows.zip` and `SHA256SUMS.txt` through `npm run build`, the full `npm test`, `validate-artifact` and `scripts/package-release.py`. Check filenames/sensitive patterns before packaging and again in the final ZIP, then start a fresh extraction with a temporary database on a separate port. `hf-prepare.mjs` writes the HF source package to an empty folder outside the project, scanned the same way. |
| REL-039-003 | Publication is a separate step: update `main` and tag v0.2.19 through the existing personal-repository authorization so CI builds the Release assets, without overwriting the v0.2.18 tag/ZIP/checksum; switch README/showcase "current release" links to v0.2.19 only after that Release exists. Update HF through the existing valid private backup → PAUSED → upload/start → GET-only original-record check procedure, with anonymous HTTP and real-browser acceptance recorded separately. |

v0.2.19 local packaging record (2026-11-28): with local Node v26.13.1 (meets 22+), the build, every npm test segment (serial, low priority) and validate passed. `pcr-market-watch-v0.2.19-windows.zip` is 3,706,995 bytes, SHA-256 `483f9957ab7cf9a5ef5139f6ed7eec7e6fe81e4b0bc813302add17cf6b844f98`, 225 files, and matches its checksum list; it contains no .git/qa/release/node_modules/local-data, databases, .env, DPAPI, keys or tokens. A fresh extraction started with a temporary database on a separate port; the homepage, both theme stylesheets, the Gamma and chart-library pages and the new chart colours were served and the database was created. The HF source package has 219 files (plus SOURCE_MANIFEST) with `uploaded:false`. The first scan matched the maintainer's local folder path on line 3 of `docs/GITHUB_NOTES.md` (no credentials); at the maintainer's decision it was replaced with a generic description and everything was repackaged, and the final ZIP and HF package scans have zero matches. This record was written after packaging, so the copy inside the ZIP lacks the exact size and SHA-256 above. `main` commit b29e3a2 (43 files) was then pushed through the existing personal-repository authorization (GitHub CLI fine-grained token), keeping the remote `.gitignore` and the `.openai/hosting.json` without the Sites project ID and leaving out the internal `docs/GITHUB_NOTES.md`. CI checks, Windows packaging and Pages deployment all succeeded; Release v0.2.19 was published as Latest at 2026-11-28T08:31:28Z with a 3,706,122-byte ZIP, SHA-256 `bef29f24aaa8aae5bffa27b6987071a52ca8d516729f157ab4f82708b9d26743` (CI rebuilt on Node 22, so it differs from the local ZIP checksum above), and the showcase returned 200. The HF Space is not updated yet; published v0.2.18 assets are unchanged.

v0.2.19 actual HF update record (2026-11-28): the personal Space `Rexymiao/pcr-market-watch` was updated after the official HF browser device login (token kept in a task-only folder). Before the update, the private Bucket `Rexymiao/pcr-market-watch-data` held 345 manifests/snapshots; the newest valid manifest `pcr-2026-11-27T23-22-21-112Z-4e8838fdb38e2792` (2,654,208 bytes) was checked by metadata only (sha256 in the file name, matching size) without downloading private snapshots. Anonymous GETs showed the structure run completed at 23:22:20Z and older Core/Cboe check times, so nothing was written after that backup. The Space was then paused to PAUSED; no new manifest appeared after the pause (unchanged content is not rewritten). The v0.2.19 source package (218 files; the public `.openai/hosting.json` without the Sites project ID, the Space's existing `.gitignore`, no internal `docs/GITHUB_NOTES.md`) was uploaded as Space commit `8af459b` and started to RUNNING on unchanged CPU Basic hardware. GET-only checks after the restart: Core 7 symbols x 498 rows, asof 2026-11-25, original checkedAt 2026-11-26T10:36:50.576Z and row digest unchanged; Cboe 252 rows, last date 2026-11-25 and row digest unchanged; the QQQ structure-archive index, market-reference settings and structure run record (runId 32ac6679, 144/146 saved) unchanged. The Cboe history checkedAt moved from 11-26 12:36:32Z to 11-27 05:03:20Z because that field is the maximum check time across all records and the newly bundled seed carries the latter; the 11-25 record still keeps its original 11-26 12:36:32Z, so this is not a re-fetch. After the restart there were still 345 manifests and none newer, indicating the startup backup found content identical to an existing snapshot. Independent anonymous checks: public pages/APIs 200, unpublished symbol 403, cross-origin POST 403, private pages 401, sign-in page with English/中文; in a real browser the homepage, Gamma and chart-library pages are dark with no horizontal overflow. The anonymous read-only `/api/watchlist-settings` projection returning 200 is the intended REL-PUB-001/002 behaviour. Remaining: the sign-in page shown to guests on private pages still uses its light inline style and is outside the dark theme. No paid resources were added; future 17:30/17:45 scheduled runs still need separate observation.

## v0.2.20: Day/night mode (released on GitHub and HF)

| ID | Delivery and acceptance |
| --- | --- |
| REL-040-001 | The source package adds `web/theme-mode.js` (loaded first in the `<head>` of all 6 app pages) and `web/chart-palette.js`, scopes `theme-dark.css` to `:root[data-theme="dark"]` and places Day/Night with English／中文 in a nav `.nav-tools` group; the gateway renders the sign-in page in day or night styles from the functional `pcr-theme` cookie. See Product Spec UI-019-011. No API, calculation, database migration, credential, quote:read, cooldown, polling or public/owner permission change. |
| REL-040-002 | Acceptance covers night by default, saved choices, invalid-value fallback, applying before first paint, placement and bilingual labels, choose-save/cookie/announce, cookie attributes inside the huggingface.co iframe and on http, cross-tab sync, both chart palettes and the day/night sign-in page (CSP, CSRF and session cookies unchanged); screenshots of both modes x 6 pages x EN/ZH x 1440/390px show no horizontal overflow; night-mode computed styles on all 6 pages match v0.2.19 element by element. |
| REL-040-003 | Publish through the existing process: push `main` with the existing personal-repository authorization so CI creates Release v0.2.20 from the `package.json` version without overwriting v0.2.19/v0.2.18 assets; switch README/showcase "current release" links only after that Release exists. Update HF through the existing valid private backup → PAUSED → upload/start → GET-only original-record check, recording anonymous HTTP and real-browser acceptance separately. |

v0.2.20 actual HF update record (2026-11-28): the personal Space was updated after the official HF browser device login. Before the update the private Bucket still held 345 manifests with the newest valid manifest `pcr-2026-11-27T23-22-21-112Z-4e8838fdb38e2792` (metadata checked only); the anonymous GET baseline matched the post-v0.2.19 restore. No new manifest appeared after pausing to PAUSED; the v0.2.20 source package (222 files, public `hosting.json`, the Space's existing `.gitignore`, no internal notes) moved the Space commit from `8af459b` to `86a7023`, then started to RUNNING on unchanged CPU Basic hardware. GET-only checks after the restart: Core 7 symbols x 498 rows with the original checkedAt, Cboe 252 rows and checkedAt, the QQQ structure-archive index and market-reference settings all matched the pre-pause baseline (structure status differed only in the per-request `scheduler.metadataCache` field), and there were still 345 manifests with none newer. The live homepage loads `/theme-mode.js` and `theme-dark.css` is scoped to night; anonymous sign-in requests render night without a cookie and day with `pcr-theme=light`, the private-page 401 gate follows the same cookie, and no script is served. Independent real-browser acceptance: night by default after clearing preferences; clicking Day switched background, storage, cookie and the Cboe history chart palette at once and persisted after reload; Gamma and chart-library pages showed no horizontal overflow in day mode and the private-page sign-in gate was light; switching back restored the night palette; at 375px both switches sat together, right-aligned. Anonymous HTTP re-check: public pages/APIs 200, private pages 401, unpublished symbol 403, cross-origin POST 403, sign-in CSP byte-identical with no script. No paid resources were added; future 17:30/17:45 scheduled runs still need separate observation.

## v0.2.21: Custom-domain origins

| ID | Delivery and acceptance |
| --- | --- |
| REL-041-001 | The gateway reads the host list from the HF runtime variable `HF_SPACE_HOST` (falling back to `SPACE_HOST`): the first entry is the canonical origin and the rest are custom domains bound to this Space. Every entry must be an exact lowercase DNS name; any malformed entry or more than five extras trusts no extra origin (the same rule as the LevyQuant digest's `DIGEST_ADMIN_ORIGINS`). Sign-in, sign-out, public refreshes and signed-in writes work on those origins as on the default hf.space host; other origins still get 403. The sign-in page's "open in a new window" link uses the bound host in use, and a forged Host has no effect. Also fixes the gateway failing to start when `SPACE_HOST` contains a comma. HF embedding cookies, CSP, CSRF and the backend seeing only the internal origin are unchanged. |
| REL-041-002 | The target domain is the user-chosen `option-chain-watcher.levyquant.ai`: a Cloudflare CNAME to `hf.space` (DNS only), bound in the Space settings only after v0.2.21 is live, then one restart so the runtime variable includes it. Acceptance checks browsing, sign-in and refresh on the new domain separately and confirms the default hf.space host is unaffected. |

CI published v0.2.21 at 2026-11-28T10:11:49Z (commit `0cd70dc`); the ZIP is 3,728,995 bytes, SHA-256 `929ecb4fb521bd2a75235d3b54a8c7528d68cc5d9218edb8fd6ef785512a2738`. The HF Space runs v0.2.21 (commit `006418e`); backups were unchanged around the pause and GET-only checks matched the original records. The custom domain is verified after the user adds the Cloudflare record and binds it to the Space.

Release-notes fix: CI used the whole `docs/RELEASE_SPEC.md` as the Release body, so its 14 relative links (including the English switch) broke on the Release page and the heading lagged one version. Each version now has concise bilingual notes in `docs/release-notes/v<version>.md` (absolute links to that version's tag), which the release workflow prefers, falling back otherwise; the v0.2.19–v0.2.21 Release bodies were replaced (assets, tags and checksums unchanged).

Custom-domain go-live record (2026-11-28): `option-chain-watcher.levyquant.ai` was bound with `POST /api/spaces/Rexymiao/pcr-market-watch/custom-domain` using the user's HF login; the user created a Cloudflare token limited to DNS edit on levyquant.ai (kept in their Windows user environment, never shown in chat), used to add the CNAME `option-chain-watcher` → `hf.space` (DNS only) through the Cloudflare API. After public DNS (1.1.1.1/8.8.8.8) resolved, the HF stage went PENDING → PENDING_CHALLENGE (certificate issuance) → READY in about 7.5 minutes; backups were confirmed unchanged, the Space was paused to PAUSED and started again so the runtime `HF_SPACE_HOST` includes the domain. 14 checks passed on the new domain: valid Let's Encrypt certificate (until 2027-02-26), homepage/chart library/Gamma 200, public data matching the original records, private pages 401, the sign-in new-window link on the new domain, sign-in POSTs from the new domain reaching password checks (wrong password 401, not 403), hostile and sibling-subdomain origins still 403, and the default hf.space sign-in and link unchanged; GET-only checks after the restart matched the original records.

## v0.2.22: Sign-in page remembers the language

| ID | Delivery and acceptance |
| --- | --- |
| REL-042-001 | `theme-mode.js` mirrors the page `<html lang>` (from the saved or linked language) to a functional `pcr-lang` cookie (zh/en only, same attributes as `pcr-theme`: SameSite=None; Secure; Partitioned inside the huggingface.co iframe, otherwise Lax), without rewriting an unchanged value. When the URL has no valid `?lang=`, the gateway reads that cookie for the sign-in page and the private-page 401 prompt; invalid values fall back to English. CSP, CSRF, session cookies and the post-login redirect are unchanged. |
| REL-042-002 | Acceptance: with cookie zh the sign-in page, 401 prompt and wrong-password page are Chinese and the form keeps the language; `?lang=en` overrides the cookie; case variants, look-alike names, encoded injection and other languages are ignored and no script is served; the mirror is written on mount, updated on language change, not rewritten when current, and partitioned when embedded. Release through GitHub CI and the HF backup → PAUSED → upload/start → GET-only check, re-verified on the custom domain. |
