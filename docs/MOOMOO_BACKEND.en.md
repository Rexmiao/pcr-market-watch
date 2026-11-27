# moomoo Backend Integration

[简体中文](MOOMOO_BACKEND.md) | **English**

PCR Market Watch offers two optional read-only paths: **desktop** calls the local moomoo CLI; **webapi** requests moomoo HTTPS market-data endpoints through the backend. WebAPI mode does not need the desktop client, but it still needs a running website backend, a separate AccessToken, and appropriate API permissions. Browsers hold neither credential.

## Desktop market-data endpoints

| Local HTTP API | Example parameters | Purpose |
| --- | --- | --- |
| `/api/providers/moomoo/status` | None | Desktop configuration, CLI availability, last success, and connection state |
| `/api/providers/moomoo/quotes` | `?symbols=AMD,NVDA` | At most 20 stock/option codes per batch; basic quotes and actually returned option-extension, pre-/post-market, or overnight fields |
| `/api/providers/moomoo/kline` | `?symbol=AMD&count=60` | Recent daily candles, up to 1000 |
| `/api/providers/moomoo/expirations` | `?symbol=AMD` | Option expiration dates |
| `/api/providers/moomoo/option-chain` | `?symbol=AMD&begin=2026-11-27&end=2026-11-27` | A selected chain range, at most one calendar month |
| `/api/providers/moomoo/security-snapshots` | `?symbols=AMD` | Independent full snapshot endpoint, at most 100 codes; may time out or be unavailable separately |
| `/api/providers/moomoo/option-trades` | `?symbol=AMD261127C500000&count=200` | Actual prints for one option contract, at most 200 |

Desktop allowlists subscribe, get-basic-qot, get-kline, get-option-expiration-date, get-option-chain, get-security-snapshot, and get-ticker. There is no arbitrary-command proxy or account, position, order, or trading-unlock interface. Child processes use argument arrays and shell:false; desktop AppKey passes only through environment variables, and the Host must be loopback.

## Separate credentials

Desktop mode continues to use `node scripts/configure-moomoo.mjs` or backend `OPENAPI_HOST_APPKEY`, with `moomoo-appkey.dpapi` in PcrMarketWatch under the current user's LocalAppData. It is for the desktop Host and cannot act as a WebAPI Bearer token.

WebAPI defaults to `node scripts/connect-moomoo-webapi.mjs`: OAuth 2.1 PKCE opens moomoo's official consent page, requests only `quote:read`, and receives authorization through a local callback. Access/refresh credentials and expiry information are saved in `%LOCALAPPDATA%/PcrMarketWatch/moomoo-webapi-oauth.dpapi`, a separate Windows DPAPI-encrypted authorization bundle outside the project, Dropbox, and browser. Users are not asked to paste tokens into chat.

If the initial token response omits `scope`, inherit only the `quote:read` explicitly requested by that bound PKCE flow. Explicit scope must contain `quote:read` exactly once; omitted refresh scope inherits only the previous validated scope. Returned `accid:*` or `accid:` followed by 1–32 digits is an account-context selector, accepted only with valid syntax. It does not grant account/position reads, which need the rejected `trade:read` capability. Reject explicit empty/null scope, write, trade, unknown capabilities, and invalid selectors. Save canonical `quote:read` and a context-present boolean; actual selector values never enter logs, browsers, or source.

The backend refreshes AccessToken using actual provider expiry information. Providers can revoke grants and refresh credentials expire, so this is not a permanent-connection guarantee. Reconnect through official consent after expiry/revocation. Another computer or Windows user needs separate setup. `scripts/configure-moomoo-webapi.mjs` is a compatibility entry for the same OAuth connection flow. Local Windows setup has no manual or environment-token mode; tokens are never written to `.env`, source, or startup scripts. Additional permission capabilities are rejected; valid account-context selectors are not extra capabilities.

Credentials are used only in backend memory and provider authorization environments/headers. They never enter webpages, URLs, command lines, database configuration, logs, Git, or release archives. Monitoring WebAPI uses only fixed official HTTPS hosts and fixed read-only overview/event/stock-quote market-data paths, never a caller-selected external address. Configured does not establish a successful connection or real-time entitlement.

## Startup and source selection

1. Run the website backend and use the launcher's actual loopback URL: port 8765 by default, or an available port such as 8766 if an unrelated program occupies it. Do not stop that program.
2. Desktop mode requires signed-in moomoo, external program access, and CLI enabled. Host defaults to `http://127.0.0.1:22222`; `OPENAPI_HOST_URL` may specify another loopback port.
3. WebAPI mode uses independent official read-only OAuth consent and does not need Desktop online. Collection still stops if the computer or local Node backend stops.
4. Open `/options-monitor.html` through Options activity between PCR and Market brief, then select auto, desktop, or webapi. In v0.2.1, auto reads actual client `status().configured`, preferring configured WebAPI and otherwise selecting desktop. It identifies the source and never silently falls back after collection failures. Source and scope are part of cache and OI-comparison identity.

`checkedAt` is backend retrieval time. Use actual provider timestamps for market time, keeping absent times unknown rather than using retrieval time as proof of real time. Verify API and desktop-app permissions independently.

## Dedicated options activity page (v0.2.2)

| HTTP API | Behavior |
| --- | --- |
| `GET /api/options-monitor?symbol=AMD&provider=auto` | Read the actual selected source's saved cache only; optional `expiration=2026-11-27` |
| `POST /api/options-monitor/refresh?symbol=AMD&provider=webapi` | An empty JSON object triggers bounded collection, at least 30 seconds of cooldown, and coalescing |

**Desktop coverage:** one symbol and expiration, at most 20 strikes near the underlying price and 40 Call/Put contracts. After reading the chain, obtain contract-quote observations through `get-basic-qot` in at most two batches of 20, using volume and actually returned `option_ex_data` fields such as OI/IV. The full `get-security-snapshot` endpoint remains independently available but is not required by monitoring and does not guarantee complete fields. Read actual prints for at most three active contracts, 200 each and 600 total. Display the expiration, strike range, and coverage count; label local ratios scoped PCR.

**WebAPI coverage:** backend POST to fixed `option-underlying-overview` obtains selected-underlying call_volume, put_volume, and T−1 call/put OI. GET to fixed `option-event` filters provider unusual events by `US_SECURITY` and underlying code, at most 300 rows per batch. Disclose incomplete pagination/truncation; unusual events are not a complete trade tape. Label ratios provider underlying-summary PCR. Undisclosed exchange/expiration aggregation remains unknown. Expiration selection filters events only; it **does not change the underlying-summary PCR scope**.

Provider BUY/SELL/NEUTRAL is side classification. The current quote API has no open/close flag, so open/close is explicitly undisclosed. Cumulative-volume changes between comparable checks are separately labeled interval volume growth, never one large trade. Source/session/scope changes and resets do not cause false alerts. Missing required data and zero call denominators leave PCR blank.

T−1 does not establish an exact verified OI settlement date; keep an undisclosed date unknown. Local SQLite isolates caches by actual source. Desktop per-contract observations use option_monitor_oi; deduplicated contracts returned in WebAPI events use separate option_monitor_webapi_oi. Compare only the same source and contract/scope using actual observation dates. v0.2.6 separately archives WebAPI underlying-summary OI as described below. Missing history stays blank. Changes do not establish opens/closes, exercises, or investor counts. The homepage explicitly selects latest OI summaries or the saved Cboe snapshot, both separate from these per-contract observations.

Initial screening thresholds are 500 contracts and Volume/OI of 2, editable filters rather than trading signals. Optional 30/60/120-second refresh runs only while expanded and visible, pausing when hidden/closed without closed-page notifications. Configuration/authentication/permission/timeout failures remain explicit; retained data keeps its original success time with a stale label. Errors do not switch source or fabricate trades.

### Page and interpretation

The page starts expanded, retaining preferences, lists, and shared SQLite/API. Legacy `/#options-monitor` forwards here. The homepage mounts no monitor and makes no monitor requests. Manual/visible-page refresh rules remain unchanged; leaving, hiding, or collapsing stops polling.

Orange means a threshold was met, not bullish/bearish. Read expiration, strike, and Call/Put with each contract. BUY/SELL is not open/close. A contract can repeat or meet several rules; alert counts are not unique openings or investor counts.

### Card side and time (v0.2.3)

Activity/print cards match original records by eventId and show provider side with undisclosed open/close, never borrowing another record on the same contract. WebAPI fill_timestamp is microseconds, converted to America/New_York date and HH:mm:ss ET, not fixed EST. Check time cannot replace missing record time. Snapshot-ratio and interval-growth alerts show their own observation/check times. Put type, OI, and BUY/SELL/NEUTRAL alone cannot establish net positioning or open/close; cards and tables share these limits.

Actual read-only records verified event association, provider side, and record time, with open/close unknown; actual activity payloads are not public. APIs, data units, and read-only permissions are unchanged. All 10 card identity/time and 14 bilingual browser checks passed, including 320px, different sides on one contract, unknown fields, UTC midnight, and New York spring/fall daylight saving. Undocumented raw OPEN is not open/close evidence.

## Manual homepage OI refresh (v0.2.2)

The homepage defaults to Latest Moomoo, with explicit Saved Cboe selection. Initial `GET /api/oi-summaries?symbols=NVDA,MU` reads cache only. Update data sends an empty JSON `POST /api/oi-summaries/refresh` with the same query, independently of OCC volume. Cap at 40 symbols/two concurrent summary requests; use only `option-underlying-overview`, with no events or homepage polling. Hosted Worker returns 503; local Node and authorization are still required.

Return per-symbol put/call OI, PCR, checkedAt, and status/stale. OI is previous_session; an undisclosed settlement date keeps oiAsOf null. Failure retains a complete cached pair and original time as stale. Never mix a new side with an old side; otherwise PCR is null. New `oi_summary_cache` (migration 0004) stores latest payload_json/checked_at by symbol, not a time series. Preserve Cboe seeds and activity contract observations.

The v0.2.2 behavior above kept latest cache only. v0.2.6 instead reads requestedDate's exact New York query-day archive, showing historical gray bars only with an actual saved observation, independently of volume actualDate fallback. Missing records never borrow latest values or silently switch to Cboe; see daily OI archives below.

## Cloud and publication boundaries

Local SQLite and cloud D1 lists remain independent without automatic synchronization. Cloud localhost cannot access a personal desktop Host. Direct WebAPI can run on a separately hosted backend with deployed collection routes and a server secret. This version's hosted Worker has no WebAPI collection path and monitoring returns `LOCAL_BACKEND_REQUIRED`; adding a token alone does not create cloud collection capability. A new local package does not automatically update existing Sites version 12.

GitHub Pages is a static introduction/download site, without Node, SQLite, or private tokens. Always-on cloud monitoring requires separate deployment and verification. A desktop bridge is not implemented; never expose the whole brokerage Host to the public internet.

## PCR methodology and acceptance

Original daily/20-/60-session volume PCR continues to use OCC/Cboe and pooled put/call totals. Desktop scoped ratios and WebAPI provider summaries do not replace those historical series. None represents the number of short sellers, capital allocation, or a price-move probability.

See the [Product Spec](PRODUCT_SPEC.en.md) for complete requirements and acceptance. Source and controlled-test success do not verify provider credentials, permissions, or live data; confirm runtime through actual read-only queries.

Official references: [underlying overview](https://open.moomoo.com/api/quote/derivatives/option-underlying-overview), [unusual events](https://open.moomoo.com/api/quote/derivatives/option-event), [setup/authentication](https://open.moomoo.com/api/overview/getting-started), and [permissions](https://open.moomoo.com/api/overview/api-authority).


### Local verification record (2026-11-25)

Desktop monitoring returned basic quotes for 40 selected contracts; caches and contract OI observations can be saved. Missing volume/OI leaves status partial and PCR blank. Print queries timed out; complete prints and real-time entitlement remain unverified. Independent full snapshots also timed out. WebAPI completed read-only OAuth and saved normalized authorization through DPAPI. Underlying-summary volume/OI PCR and unusual events returned actual responses. Incomplete single-page pagination yields partial status; exact overview market time and OI settlement date remain unknown. Desktop is unnecessary, but the local backend must run. This does not establish hosted Worker integration, a complete tape, or real-time entitlement.


v0.2.2 dedicated-page and homepage OI browser checks passed, covering 320px Chinese/English, preference/list reuse, no historical OI, source labels, and independent OCC/OI states. Actual manual summary refresh on 2026-11-25 returned complete put/call OI for all requested symbols, and migration 0004 added the cache table. Exact OI settlement dates remain null. This adds no real-time, complete-tape, OI-history, or coverage guarantee; installation/publication require separate verification.


## Unpublished: local one-time quote review

Standalone `scripts/capture-quote-review.mjs` reads privately configured stocks/options/spread legs, without new worker endpoints or desktop CLI allowlist entries. Reuse `quote:read` in Windows DPAPI outside the project. No account/position queries, trading, or automatic AI analysis. It POSTs only to fixed official `/api/v1.0/quote/snapshot` and `/api/v1.0/quote/stock-quote`, without relying on an open webpage.

Private fields are `jobId, scheduledAt, cutoffAt, timeZone, outputDirectory, underlyings, contracts, spreads`. Times include offset/Z, timezone is `America/New_York`, and output is an absolute private directory outside the project. Symbol entries use `{code,label}` and spreads `{label,longCode,shortCode}`. Cutoff must follow schedule within 24 hours; stock/option/spread counts are 1–8/1–24/1–8. Only same-underlying/expiry bear-put spreads with a higher-strike long leg are supported, with both legs listed in contracts. Actual user dates, codes, and results do not enter public examples.

```powershell
node scripts/capture-quote-review.mjs --config "C:\private\quote-review.json" --dry-run
powershell -NoProfile -File scripts/register-quote-review-task.ps1 -ConfigPath "C:\private\quote-review.json" -DryRun
```

`--dry-run` reads no credentials, uses no network, writes no results, and sends no notifications. Default execution only collects inside the private schedule window. `--capture-now` is manual testing labeled manual; `--notify` enables the local popup/report. Registration optionally accepts `-NodePath`; the reminder is `show-quote-review-reminder.ps1 -ReportPath <local-html> -Status <status>`. Add `-Test -NoOpen` only for separate reminder acceptance without opening a report.

The one-time current-user InteractiveToken/Limited task uses hidden `run-quote-review-task.ps1` to run Node `--config --notify`, without a web server. Login is required; locked-session reminders may appear after unlock. Use UTC StartBoundary and a 24-hour EndBoundary, allow battery operation, IgnoreNew, and a five-minute limit. Do not require network readiness before startup, preserving network-failure reminders. WakeToRun may attempt sleep resume; shutdown cannot run it. Catch-up is allowed only before cutoffAt; expired runs save missed status and remind without passing later quotes off as scheduled capture. Scheduled, actual-capture, and provider times remain distinct, with missing/stale quotes identified.

Static indicative spread entry is long ask minus short bid; exit is long bid minus short ask. Legs may be asynchronous and neither guarantees execution. Amounts require disclosed contract size, never an assumed 100, excluding fees/slippage. Snapshot timestamps over five minutes, absent/unexpected trading dates, and other anomalies are flagged; independent book time/size and actual feed delay are unverified.

Save private `outputDirectory/runs/<actual-time>/snapshot.json`, `index.html`, and `latest.html`, including success/partial/unavailable/missed and source errors. Configuration/reports/logs/authorization stay out of Git/releases. This is an unpublished local addition; existing v0.2.3 is unchanged. Registration and future actual execution require separate verification.


## v0.2.4 local/unpublished: task state and quote archives

Scheduled reviews opens `/quote-reviews.html`, reading local `/api/quote-reviews` for actual Windows state/next run, latest results, and history filtered/paged by actual run date in America/New_York. Configuration schedule, scheduler state, and run results stay distinct. A latest manual test is not scheduled completion; unknown/failure states are not synthesized into normal state.

`scripts/quote-review-archive.mjs` mounts through local preview and reads existing private `local-data/quote-reviews` only. Detail and JSON/HTML accept discovered job/run identities with Origin/Host, path-escape, and symlink validation, redacting private absolute paths/configuration from errors. The page only views/refreshes state, without task editing/deletion/execution, quote recapture, or additional account/trading permissions.

Retain manual, scheduled, failed, and missed results without automatic cleanup. Show scoped local archive counts and total bytes. Unuploaded results are not GitHub repository storage; GitHub Pages/cloud identify local-only support rather than exposing private Windows data. Display scheduled/actual/provider times separately and never label historical snapshots real time. Local v0.2.4 installation/restart, actual Windows state, and existing-archive reads were verified on 2026-11-26; bilingual narrow-layout and GET-only page checks passed. It remains unpublished to GitHub, preserving v0.2.3 releases without claiming future task execution.

| Local GET | Contract |
| --- | --- |
| `/api/quote-reviews` | Optional job, date (actualStartedAt in ET), mode (manual/scheduled), offset, limit (default 25, 1–100). jobs/storage remain complete; only runs are filtered/paged. |
| `/api/quote-reviews/jobs/{jobId}/runs/{runId}` | Safe report/bytes for a discovered run, never an arbitrary file path. |
| Same path `/snapshot.json` | Download allowlisted result JSON, not private configuration/other files. |
| Same path `/report.html` | Regenerate HTML from safe results; never serve archived original files directly. |

scheduler contains state, nextRunAt, lastRunAt, lastTaskResult, and available with a 30-second query TTL. Index checkedAt is not provider quote time. storage totalBytes/runCount/jobCount/unreadableRunCount counts each run's snapshot.json+index.html only, excluding private configuration/registration receipts/latest pointers. Unreadable runs retain unreadable/unknown placeholders.


## v0.2.5 local/unpublished: market-brief quotes

Add read-only `GET /api/brief-quotes/status` and `GET /api/brief-quotes?symbols=...`, preferring configured authorized WebAPI and using desktop only when cloud credentials are absent. Configured cloud failures never silently fall back. Cap batches at 20 strict stocks/ETFs with source-isolated 15-second caching and request coalescing; retain original same-source quote/last-success times rather than substituting check time. WebAPI uses fixed official stock-quote with quote:read, without account/position/trading or arbitrary commands.

The brief reports sources separately: red identifies actual failure/cause, amber means gaps/cooldown/old data, and blue normal/waiting. Desktop quote timeouts are not Cboe/macro failure. Calendar volume coverage and OI availability are independent: a record for one symbol does not establish a complete list. Historical dates never borrow current OI; missing latest OI explains its cause rather than becoming zero.

Status returns provider/configured/connectionStatus/readOnly:true. Quotes return provider/checkedAt/status (current or partial) and data.basic_qot_list. Rows use plain security.code, market 11, cur_price, and second-based quote-data update_timestamp, not a specific trade time. checkedAt likewise never substitutes for market time. Retain actually supplied pre-/after-market/overnight prices only, without inventing independent session times from regular timestamps. current means required price/time fields are present, not real time. Upstream failures return `{provider,checkedAt:null,error,code}` with fixed redacted wording/safe codes. Authentication/permission uses 401/403, timeouts 504, rate limits 429, no data 404, unconfigured/local unavailability 503, and other failures 502. Invalid parameters use 400, cross-origin/invalid Host 403, and non-GET 405. JSON responses set Cache-Control:no-store and X-Content-Type-Options:nosniff. The frontend retains only same-source old prices/original times, never another source.

Cloud routes return 501, supported:false, LOCAL_BACKEND_REQUIRED, without reading personal computers.

Calendar n/N uses complete items, unaffected by category filters, counting valid p/c daily records. Button title/aria and missing-symbol text distinguish a record from complete coverage. OI reasons precede bars, distinguishing selected actual/latest volume dates; latest unavailable or zero-call OI remains blank.

Local v0.2.5 verified actual WebAPI quote GET, independent desktop-timeout attribution, same-source times, and bilingual UI. Healthy Cboe/waiting sources are no longer broadly marked failed. Complete/partial calendar coverage, historical/ latest-view OI explanations, and title/aria agreed at 892/320px, without source-refresh or watchlist writes. Retain v0.2.4/public v0.2.3. No GitHub publication, real-time-entitlement claim, or assertion of completed deployment.

## v0.2.6: daily OI archives and historical gray bars (local/unpublished)

`scripts/oi-history.mjs` and migration `0005_oi_summary_snapshots.sql` append normalized observations under `(symbol,provider,checked_at)`. Each actual query, including manual refresh and daily capture, retains original checkedAt, New York observationDate, put/call OI, PCR, and explicitly confirmed oiAsOf/oiAsOfConfirmed. The current overview endpoint confirms no settlement date, so it remains unknown rather than inferred from T−1/query day. Zero put OI is valid; zero call OI leaves PCR null. Never mix missing sides or archive retained old values as today's observation.

| Endpoint | Contract |
| --- | --- |
| GET `/api/oi-summaries/history?symbols=NVDA,MU&date=2026-11-25` | Each symbol's last actual observation on that exact New York query day, with archived, observationDate, original checkedAt, and separately confirmed settlement date. Missing fields remain empty without earlier/later substitution. |
| GET `/api/oi-summaries/history?symbols=NVDA,MU` | A 3660-day date index, daily count/completeCount, all-time snapshot count and first/last dates. Limit 40 unique valid symbols, same-origin reads without upstream queries. Initial idempotent legacy-cache import preserves original times, never unsaved history. |
| GET `/api/oi-daily` | Read actual scheduler state/next run, 17:30 ET schedule, and latest actual capture/saved counts with 30-second scheduler caching. Page refresh never executes a task. Distinguish manual/scheduled and unknown/success. |

Homepage gray bars read requestedDate archives. On holidays/unpublished dates volume may show an earlier actual trading day, without changing the OI query day. OI-only dates before volume coverage remain selectable with volume empty, never borrowed from future records. Blue calendar markers mean volume records; gray means saved OI, each possibly covering only part of the list. A record does not guarantee a computable PCR. Cboe seeds, latest cache, contract OI, and new summary history remain separate. Static Worker history/daily-status routes return 501/supported:false rather than reading private local directories.

Separate task `PCR-OI-Daily-Snapshot` defaults to **17:30 America/New_York each calendar day**, reading local_user's current persisted SQLite watchlist at execution. Limit 40 symbols/two concurrent option-underlying-overview queries. Weekend/holiday counts may repeat; missing values remain empty. Successful daily execution deduplicates, failures allow at most three attempts at least 15 minutes apart, and a lock prevents overlap. An empty list makes no upstream query. Private `oi-daily` beside the database stores run summaries, while observations append to SQLite without automatic cleanup/upload.

From the project directory, inspect registration before registering:

```powershell
powershell -NoProfile -File scripts/register-oi-daily-task.ps1 -DatabasePath "C:\absolute\private-data\pcr.sqlite3" -DryRun
powershell -NoProfile -File scripts/register-oi-daily-task.ps1 -DatabasePath "C:\absolute\private-data\pcr.sqlite3"
node scripts/oi-daily.mjs --database "C:\absolute\private-data\pcr.sqlite3" --mode manual
```

The last command performs an actual manual capture, not a dry run. Windows must use the checked Eastern time zone to follow daylight saving. The task uses the current Interactive/Limited user and needs sign-in, powered-on computer, and network. Wake/catch-up can be attempted; shutdown cannot run it. Catch-up records the actual query date rather than inventing a missed day. Neither webpage nor preview server needs to stay open; valid cloud WebAPI requires no moomoo desktop. Preserve the existing one-time Friday quote task. Local DPAPI OAuth retains actual-expiry refresh/reconnection behavior.

## v0.2.7: Hugging Face runtime and access control

See the [English hosting guide](HUGGING_FACE.en.md). Use a Docker Space with an independent password/session gateway, Node22/Python3, without desktop interfaces, OAuth management, account or trading routes. Use an independent quote:read grant under a new client; do not transfer local DPAPI or existing refresh state.

| ID | Authorization and durability contract |
| --- | --- |
| MCA-001 | New deployments use encrypted MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON bootstrap and separate PCR_CLOUD_AUTH_KEY (64-hex-character AES-256 Secret). Raw tokens stay in controlled memory, not new-deployment environment variables. PCR_CLOUD_AUTH_FILE points to ciphertext on a verified private mount. |
| MCA-002 | AES-GCM records include nonce/tag and retain the previous encrypted version for valid recovery. A local-container file lock serializes preview/scheduler refresh. Reuse valid access tokens; refresh as needed on actual expiry or401. Expired/revoked refresh grants need official consent; no indefinite guarantee. |
| MCA-003 | Raw MOOMOO_WEBAPI_OAUTH_JSON and static ACCESS_TOKEN/SCOPE/EXPIRES_AT remain compatibility modes, not new-deployment choices. Static grants cannot auto-refresh. Require exactly quote:read without trade/write capabilities. |
| MCA-004 | SeparateHF Bearer andappheader. Ordinarysessions are12 h HttpOnly/Lax; HF HTTPS *.hf.space uses__Host-pcr_embed_session Secure/SameSite=None/Partitioned. SpecifiedHFparent compatible login requires5 min signed CSRF cookie/hiddenvalue; API/logout/othermutations require appOrigin and rejectnull, withCSPancestor limits. Login strict-origin-when-cross-origin preserves actualOrigin; stripcredentialheaders. |
| MOD-001 | Migration0006 oi_daily_state/oi_daily_runs transactionally persist completed reports, retries and same-day deduplication; existing files are compatibility mirrors. Prefer SQLite so stale files cannot override newer state. Backup recovery retains execution facts after temporary directories disappear. |

Live cloud SQLite stays local. The private mounted Storage Bucket holds consistent backups/checksum manifests and encrypted authorization at a separate location. Never commit backups or credential ciphertext into source. Independent cloud consent expands no quote endpoints and migrates no local accounts, positions, databases or Windows tasks.

The personal PRO account completed official consent. Public guest PCR/refresh now runs with verified HTTP/independent quotes/restore. CPU Basic may sleep; no extra billed Jobs/hardware guarantee continuous execution. Local17:30/Friday tasks remain independent and GitHubv0.2.3 unchanged.

## Actual cloud progress and post-write backup

Independent cloud PKCE consent is encrypted in HF Secrets, with actual OI snapshots retaining query times and unknown exact settlement dates. Owner login, paused-update restore and current guest HTTP checks passed; all24 actual signed-outHF Edge checks also passed.

Committed SQLite writes send fixed non-sensitive IPC; the parent debounces 500 ms, repeats after writes during backup and retains startup/hourly/daily/shutdown drain. Abrupt crashes may lose changes not yet successfully backed up. Verify the latest backup, pause until PAUSED, then upload/start to avoid HF overlapping Pods restoring older state. Daily 17:30 plan isenabled butfuture executionunobserved; no paid hardware/Jobsupgrade, with local data/tasks independent.

### Current public scope

The earlier entry-only/login-for-all-data stage is superseded by current guest PCR reads/refresh. Final HF anonymous HTTP checks passed without any HF token, cookie or password: homepage/charts/public APIs/source refresh200, settings storage cloud, private pages/APIs401, valid unpublished symbol403, cross-origin403 and owner form303/session API200. Actual OI refresh succeeded7/7 followed by429, preserving the private Bucket, CPU Basic and existing archives. All24 actual signed-outHF Edge checks passed and are recorded separately from HTTP evidence; future17:30 execution remains unobserved.

## Guest PCR reading and source refresh (v0.2.7, remote HTTP verified)

This explicit user choice supersedes the earlier public-entry-only/login-for-all-data stage. This HF deployment sets PCR_PUBLIC_VIEW=1; generic Docker defaults to0 and does not change other deployments automatically.

| ID | Permission and data contract |
| --- | --- |
| PUB-005 | Guests read PCR charts, dates, measures/ranges and both languages without a password, and may explicitly refresh source data. Public preferences use readOnly:true/canRefresh:true. Read-only means no watchlist/category/group/market-reference edits, not disabled market refresh. Owner edits still require login. |
| PUB-006 | Public custom-symbol/OI routes accept only the owner's current published watchlist/market references. Core /api/watchlist/refresh retain the generic default seven symbols already published in source to preserve frontend contracts. Remove unexpected custom instruments from success/error/retained bodies. This exception grants no arbitrary ticker querying. |
| PUB-007 | Project published settings to ticker codes and generic categories/groups only. Hide private group names, owner identity, accounts, positions, credentials, raw moomoo quotes/events and administration. Private pages/configuration writes are outside the guest allowlist; deny unpublished symbols. |
| PUB-008 | Each refresh operation shares a 60-second cooldown and active-request coalescing across visitors/IPs. Reuse same-signature work; conflicts/cooldowns return429 with retry timing. Existing owner/provider protections remain. Fixed paths/arguments/symbol scopes/response projection prevent arbitrary API proxying or bypassing cost boundaries. |
| PUB-009 | Public Cboe GET forces internal x-pcr-cache-only:1, reading verified snapshots/seed/loaded history only. A missing requested day returns200 with snapshot:null/refresh_required, without borrowing another date. No date selects the latest actual cached day. Only explicit Cboe POST refresh fetches source data under the60-second budget; date navigation consumes none. |
| PUB-010 | Refresh may append actual OI/history while preserving original query times, real sessions and confirmed-or-unknown settlement dates. Publication waits, cooldowns, failures and holidays never relabel old values as new. Public access changes neither PCR calculations nor interpretation. |

Final HF anonymous HTTP checks passed without any HF token, cookie or password: homepage/charts/public APIs/source refresh200, settings storage cloud, private pages/APIs401, valid unpublished symbol403, cross-origin403 and owner form303/session API200. Actual OI refresh succeeded7/7 followed by429, preserving the private Bucket, CPU Basic and existing archives. All24 actual signed-outHF Edge checks passed and are recorded separately from HTTP evidence; future17:30 execution remains unobserved.

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

## v0.2.9: Read-only authorization health metadata

| ID | Interface and permissions |
| --- | --- |
| AUTH-DIAG-001 | Existing runtime authorization adapters provide a safe getAuthorizationStatus projection for owner-only GET /api/oi-daily. Add no moomoo capability or raw public endpoint, query no accounts/positions, and preserve existing quote:read consent. |
| AUTH-DIAG-002 | Show only configured, available/refresh_needed/reconnect_required/not_configured/unavailable state and safe expiry metadata. An expired/near-expiry access token with a usable refresh grant is refresh_needed. Unknown refreshExpiresAt remains null/refreshExpiryKnown:false rather than invented expiry or permanent access. |
| AUTH-DIAG-003 | Reading status never calls getAccessToken, validates over the network, renews/writes a bundle or captures quotes. Windows, encrypted cloud and legacy static paths use their existing saved sources. Failures yield safe unknown state without tokens, keys, clientId, account context, paths or raw errors. |
| AUTH-DIAG-004 | Actual tasks independently use real authorization/networking for read-only quotes. available metadata is not proof of a successful current request, and Ready is not capture success. Preserve session boundaries, private storage, independent encryption key, distinct OCC/Cboe/moomoo sources and the existing local quote-review task. |

See the [hosting guide](HUGGING_FACE.en.md) and [Product Spec](PRODUCT_SPEC.en.md) for diagnostic fields,30-day/5-minute limits and first actual scheduled acceptance. v0.2.9 feature source daaf0dd passed actual cloud read-only diagnostics: authorization=refresh_needed is saved refreshable metadata, health=waiting and scheduledEvidence=unobserved. Reading status requested no quotes/renewal and created no scheduled report; private diagnostics remain401 to guests. Existing quote keys/credentials and 42 OI observations remain. Future 17:30 automatic execution remains unobserved.

## v0.2.14: Provider Gamma/GEX and Max Pain

The dedicated page is `/option-structure.html`; it starts no options polling on the PCR homepage. Reuse independent backend `quote:read` authorization and actual market-data entitlements, without requiring moomoo Desktop to remain open. The local/cloud backend itself must still run. An endpoint being documented does not establish every account's permissions; actual returned results determine connectivity.

| ID | Endpoint and normalization contract |
| --- | --- |
| OSAPI-001 | Extend the exact fixed official HTTPS quote allowlist with `GET /api/v1.0/quote/{code}/option-expiration`, `GET /api/v1.0/quote/{code}/option-gamma-exposure` and `GET /api/v1.0/quote/{code}/option-max-pain`. Accept validated U.S. stock/ETF symbols and date arguments only. Browsers cannot choose a host/path, supply credentials or call account/position/trading operations. |
| OSAPI-002 | Gamma application API: GET `/api/gamma-exposure?symbol=QQQ&window=30d`; POST `/api/gamma-exposure/refresh` accepts `{symbol,window}`. `window` is nearest/7d/30d/all. Return New York `calendarDate`, `currentCalendarDate`, `availableExpiries`, `selectedExpiries`, `nearestExpiry`, and independent `base`/`withoutNearest` observations with status, checkedAt, providerUpdatedAt, underlyingPrice, callWall, putWall, zeroGammaPoints, items(strike,callGex,putGex,netGex), profile(spot,gex), errors and stale. |
| OSAPI-003 | Max Pain application API: GET `/api/max-pain?symbol=QQQ&expiry=YYYY-MM-DD`; POST `/api/max-pain/refresh` accepts `{symbol,expiry?}`. An omitted expiration selects the nearest available today/future date. Return single-expiry `maxPain` and `items(strike,callPain,putPain,totalPain)`, availableExpiries, actual dates, retrieval time, confirmed source update time and independent status. Missing fields stay null rather than zero. |
| OSAPI-004 | The provider GEX profile comes from `profile_points[].spot_price`/`aggregate_gex` or equivalent documented fields; strike contributions come from items. Normalize validated bounded fields only, without forwarding raw responses or provider errors. Walls/roots use source-returned values only. Do not invent undisclosed directional weights, units or OI settlement times. Normalization proves neither actual dealer inventory nor dollars-per-1% units. |
| OSAPI-005 | Filter expirations to today/future New York dates; seven/30 days are inclusive calendar-day windows, without claiming tradability after today's close. All requests the provider's complete scope; excluding nearest must pass the exact remaining set. The official `expire_time` limit is 256 characters. Report `PROVIDER_FILTER_LIMIT` and an unavailable comparison if exceeded, without substituting 30 days, truncating dates or stitching hypothetical-spot grids from partial requests. One-expiry exclusion returns `NO_REMAINING_EXPIRIES` and sends no empty-filter request. |
| OSAPI-006 | GET reads a separate bounded process cache only; a miss contacts no provider. Restart persistence or historical archives are not promised for these new snapshots. Explicit POST shares separate 60-second Gamma/Max Pain budgets and coalesces identical active requests, allowing the two kinds to refresh independently. A failure retains only valid same-signature observations and original times. Cross-day stale state does not rewrite calendarDate. Existing database/OI archives/Core-Cboe durable cache are unchanged without migrations. |
| OSAPI-007 | Public responses project only the watchlist/market-reference set actually published by current settings. The old Core default-seven exception does not extend to these endpoints, and removed defaults or SPY/QQQ/DIA are not automatically exposed. Reject valid unpublished tickers. Preserve same-origin checks, identity-header filtering, owner-only configuration and existing public-refresh controls. Fields retain model/scope/time qualifications and expose no grants, account context, raw errors, paths, private quote archives or runtime configuration. |

Dynamic meaning: GEX changes with spot, time, IV, OI/estimated inventory and expiration scope. Max Pain minimizes aggregate theoretical expiration intrinsic payouts for fixed OI/contracts; spot movement alone changes spot-to-pain distance, not that fixed-OI pain point. OI/contract-scope updates may change the point. Neither predicts that price will reach a level. Separate requests can have substantially different providerUpdatedAt values; a successful check does not mean the provider just recalculated them.

2026-11-26 local provider probe: existing read-only authorization returned HTTP 200/ret_code 0 for QQQ expirations,30-day GEX,30 days excluding nearest, all-expiration GEX and Max Pain. The 30-day scope then contained 12 expirations and the future all scope 31. Excluding nearest from the latter exceeded 256 characters and must remain explicitly unavailable under OSAPI-005. Max Pain's earlier source update was distinguished from successful retrieval time. This is provider-interface evidence, not proof of application routes/browser/local installation/HF publication; those use separate acceptance records.

Official references: [expirations](https://open.moomoo.com/api/quote/derivatives/option-expiration), [Gamma exposure](https://open.moomoo.com/api/quote/derivatives/option-gamma-exposure), [Max Pain](https://open.moomoo.com/api/quote/derivatives/quote-option-max-pain). See the [Product Spec](PRODUCT_SPEC.en.md) for behavior and acceptance.

## v0.2.17: Separate durable structure history APIs and runners

This extends historical storage; OSAPI-006 process cache still serves live views. Reading new SQLite archives is not live-cache restoration. Reuse the existing three official quote:read sources without account/position/trading access. Local/HF Node backends implement archives; static Pages cannot schedule, and a standalone Worker without the Node collector returns 503 rather than implying connectivity.

| ID | API, storage and limits |
| --- | --- |
| GARCH-API-001 | GET `/api/structure-archive/index?symbol=QQQ` returns date summaries for the published symbol. GET `/api/structure-archive?symbol=QQQ&date=YYYY-MM-DD` returns headers/runs; the same path with symbol/id returns a full record/payload. Choose exactly one date or id; history GETs are database-only. Cap the index at 3650 dates and daily headers at 1000 with explicit truncated flags; run summaries cap at 50 without claiming every historical run. |
| GARCH-API-002 | Migration 0008 adds structure_snapshots (gzip/base64 plus raw/compressed byte counts), structure_daily_runs and structure_daily_state. UPDATE/DELETE triggers and unique(run_id,kind,symbol,scope_kind,scope_key) protect immutable observations without automatic archive deletion. Keep observationDate, kind, symbol, scopeKind/scopeKey, expiries, queriedAt, providerUpdatedAt, unknown settlement date, status/units/provenance. Full payloads are validated model fields, not grants or arbitrary raw provider responses. |
| GARCH-API-003 | GET `/api/structure-daily` reads DB/safe authorization/scheduler metadata only: scheduledTime=17:45, timeZone=America/New_York, monitoringEnabled/Since, nextRunAt, lastRun, lastScheduledRun, scheduler, safe authorization state, archive counts and limits. Reading status neither networks, renews nor collects. Run projections contain aggregates, not symbol plans/internal paths. running uses an unexpired SQLite lease across cloud parent/Windows CLI processes. Expired leases with persisted running state project interrupted/retryEligible without GET writes. Owner-only POST `/api/structure-daily/capture` accepts JSON `{}`; 202/queued means accepted, with actual results verified by later status reads. Guests cannot trigger the whole batch. |
| GARCH-API-004 | Cap one run at 600 provider requests/20 minutes, with at least 2000ms between requests. A 120-second SQLite lease renews per step. Scheduled attempts cap at three/day at 15-minute intervals; same-day checkpoints fill unfinished scopes only. Separate manual runs can append, with a 60-second cooldown. Account/endpoint quotas may be lower; HTTP 200/ret_code=-11 is still a rate-limit failure. Budget/failure coverage is not complete collection. |
| GARCH-API-005 | Cap each normalized raw payload at 1,500,000 bytes and gzip at 512,000 bytes. PAYLOAD_LIMIT records oversize results without silently cropping profiles or substituting old snapshots. Save only actual fresh current/partial observations whose checkedAt is no earlier than the request/run and matches observationDate in New York; providerUpdatedAt may be older/unknown. Check day changes after provider returns too. One-expiry exclusion is notApplicable, without an empty all-expiration query or invented observation. |
| GARCH-API-006 | For the published watchlist/reference union, query each actual returned 0–30-calendar-day expiry for GEX/Max Pain, plus 30d and 30d_ex_nearest GEX. Query no accounts, treat no OI summary as a full chain and average no expirations. Public history GETs project current published symbols only. Removed tickers retain private records but old ids cannot bypass guest limits; nested run summaries expose safe aggregates only. |

On Windows, start the project once to create/migrate the private database and configure independent read-only authorization. Use actual database/Node paths and inspect before registering:

```powershell
powershell -NoProfile -File scripts/register-structure-daily-task.ps1 -DatabasePath "..\local-data\pcr.sqlite3" -NodePath "C:\Program Files\nodejs\node.exe" -DryRun
powershell -NoProfile -File scripts/register-structure-daily-task.ps1 -DatabasePath "..\local-data\pcr.sqlite3" -NodePath "C:\Program Files\nodejs\node.exe"
```

The registrar checks Windows Eastern Standard Time, the same Interactive/Limited user, independent PCR-Structure-Daily-Snapshot at 17:45 daily, StartWhenAvailable/attempted wake, no concurrent instances, 15-minute restarts and a 30-minute task limit. It refuses to replace a task with different identity/commands. DryRun reads no quotes/grants and creates no task. `--register-only true` enables DB monitoring metadata only, without creating a Windows task itself. The standalone runner uses `node scripts/structure-archive.mjs --database "actual path" --mode scheduled`, without a webpage/preview backend/moomoo Desktop. User login/computer/network/valid authorization remain required; shutdown cannot execute it. Do not manually claim scheduled-mode tests are actual scheduled evidence.

Cloud 17:45 timers require a running process and respect CPU Basic sleep. Unset PCR_STRUCTURE_DAILY_ENABLED follows existing daily OI enablement; set 0 to disable structure scheduling independently. Enablement does not prove future capture. Late wake records today only. Check actual retrieval/provider times, coverage, manual/scheduled reports and verified private backups separately. See Product [GARCH](PRODUCT_SPEC.en.md) and the [HF guide](HUGGING_FACE.en.md).

## v0.2.18: Fewer repeated reads while viewing history

| ID | Backend reads and boundaries |
| --- | --- |
| PERF-API-001 | In ordinary state, fetch `/api/structure-daily` daily state, latest run, latest scheduled run, archive counts/latest query time and lease in one read-only SQL statement, replacing five SQLite bridge calls. Use `structure-status-read.mjs`, without a BEGIN IMMEDIATE batch that acquires a write lock. Preserve the existing2MB bridge-response boundary: unusually large checkpoints fall back to bounded individual reads by already-selected run ids, with at most three calls overall rather than an oversized combined response. Preserve response fields, missing semantics, safe run projection and current-clock unexpired-lease/interrupted decisions. GET neither writes the database nor queries providers or renews grants. |
| PERF-API-002 | Successful Windows structure-task metadata queries may be cached in process for30seconds, coalescing simultaneous queries; failures are not cached. When returned, `scheduler.metadataCache` contains `status` (fresh/cached/not_cached/unavailable), actual metadata checkedAt, nonnegative ageMs, ttlMs (30000 when cacheable, otherwise0) and boolean coalesced. This applies only to Windows task-plan metadata, which may reflect external configuration changes up to30seconds late. Do not cache database run/lease/coverage state, authorization state or actual quotes; a failed query must not masquerade as an old success. Preserve standalone task execution, cloud timers, daily17:45 and actual scheduled evidence. Explicit client reload does not promise to bypass this30-second metadata cache. |

See PERF-018 in the [Product Spec](PRODUCT_SPEC.en.md) for browser keys, bounds, lifetime and invalidation. Existing history lists read headers only; a single id read decompresses its payload. This change preserves immutable observations, database migrations, published-symbol projection and quote:read permissions; it does not trade a higher provider request rate for faster pages.
