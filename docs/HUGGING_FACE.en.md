# Hugging Face deployment

[简体中文](HUGGING_FACE.md) · [Product specification](PRODUCT_SPEC.en.md) · [Release specification](RELEASE_SPEC.en.md)

Historical public-entry acceptance (v0.2.7): the [Space](https://huggingface.co/spaces/Rexymiao/pcr-market-watch) and [PCR app](https://rexymiao-pcr-market-watch.hf.space) run guest mode: read PCR and explicitly refresh without an HF token, cookie or password. Final2026-11-26 remote HTTP checks passed: public pages/data200, OI refresh7/7, immediate429, private pages/APIs401 and cross-origin403. Owner login and the private Bucket remain. All24 actual signed-outHF Edge checks also passed, separately from HTTP evidence. Local/GitHub Pages/other hosting/HF databases are independent; the unobserved 17:30 conclusion belongs to that historical stage. Later actual execution uses independent records; the new 17:45 structure task requires separate acceptance.

**Historical cloud Core/Cboe cache-recovery evidence (v0.2.7):** worker_cache/migration0007 fixed the earlier Core/Cboe memory-only fallback. Actual source e4a1282 PAUSED→same-commit restart, followed by GET only, preserved dates, original checkedAt and row/snapshot SHAs exactly, including 35 OI observations, without re-fetching. Retain the prior failure and later success separately; the then-unobserved 17:30 conclusion retains historical meaning.

## Requirements and boundaries

| ID | Requirement |
| --- | --- |
| HF-001 | Use a Docker Space, port 7860, Node 22 and Python 3. CPU resources suffice; no GPU is required. |
| HF-002 | Login protection is the default. Explicit choice uses PCR_PUBLIC_VIEW=1 for password-free PCR viewing and explicit refresh. App credentials still protect owner edits/private pages, while the Bucket stays private. Public viewing exposes no accounts, trades, arbitrary endpoints or database access. |
| HF-003 | Upload reviewed generic source only, excluding personal databases, watchlists, positions, credentials, DPAPI files, runtime logs and browser profiles. Tokens never enter Dockerfiles, build arguments, READMEs, URLs or source. |
| HF-004 | Keep live SQLite on local container disk. Store consistent backup objects and checksum manifests in a private attached Storage Bucket. An ordinary /data folder is not evidence of persistence; do not put live SQLite on the object mount. |
| HF-005 | Use an independent moomoo quote:read OAuth grant. Refresh access tokens while the refresh grant remains valid; copy no Windows DPAPI and expose no account/trading queries. Expired/revoked/failed refresh grants still require official reauthorization, not a permanent-connection promise. |
| HF-006 | Daily OI requires a running process, network and valid quote authorization. Sleeping/stopped processes cannot collect. Preserve missing days without reconstructing them from later OI. |
| HF-007 | Local and cloud data are independent. Do not automatically migrate personal databases, archives or Windows tasks. Use one active replica for this single-user SQLite deployment. |
| HF-008 | Record prepared, tested, remotely deployed and future scheduled execution separately. Start with CPU Basic under the existing PRO plan; do not upgrade hardware, enable billed Jobs or expand permissions automatically. Additional costs require a specific user choice. |
| HF-009 | Bootstrap new deployments with MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON and a separate 64-hex-character AES-256 key Secret PCR_CLOUD_AUTH_KEY. Persist AES-GCM ciphertext plus its previous version, serializing cross-process refresh with a local file lock. Raw tokens are not environment variables in the new deployment path. |
| HF-010 | Provide12 h signed HttpOnly sessions: ordinary deployments useSameSite=Lax andSecure onHTTPS; HTTPS *.hf.space uses __Host-pcr_embed_session withSecure/SameSite=None/Partitioned forHF frames. Only the compatible HF login path may accept trusted HF parent origins, requiring a5 min signed CSRF-cookie/hidden-value pair. APIs and other mutations stay strictly same-origin; reject Origin:null. Use separate X-PCR-Authorization and strip credentials/cookies/identity before the backend. |
| HF-011 | Migration 0006 transactionally stores daily deduplication, retries and immutable execution metadata in oi_daily_state/oi_daily_runs. SQLite backups restore this state. Lost temporary files cannot erase existing run state or trigger duplicate same-day capture; old local files remain compatibility mirrors. |
| HF-012 | CPU Basic may sleep after 48 idle hours even with PRO. Verify prices and obtain a specific choice before enabling independent scheduled Jobs or continuously running paid hardware. PRO does not imply permanently running resources without additional cost. |
| HF-013 | Login forms use strict-origin-when-cross-origin to preserve the actual form Origin. CSP frame-ancestors permits self and trusted HF parents only. Never fix login by accepting null origins. |
| HF-014 | Successful SQLite commits emit a fixed, data-free IPC change signal. Debounce backups500ms; writes during backup queue another pass. Cover startup, hourly/daily work and normal-shutdown drain. Abrupt crashes can still lose changes not yet successfully backed up. |
| HF-015 | Before updates, verify the latest writes have a visible valid backup, pause the old Space and confirmPAUSED, then upload/restart. HF rolling builds may start a new Pod before the old Pod shutdown backup becomes visible; never rely on that late backup catching the new instance. This maintenance procedure migrates no local database. |

## Prepare source

Run in the reviewed public source tree, with an absolute new empty destination outside it:

```powershell
node scripts/hf-prepare.mjs --output "C:\path\to\pcr-hf-source"
```

The allowlist exporter copies generic source, writes sdk: docker/app_port: 7860 metadata to the destination README, and creates SOURCE_MANIFEST.json with sizes and SHA-256 hashes. It does not log in, create resources, or copy personal databases/credentials. The canonical English repository README remains unchanged. See [official Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker) for source and Secret configuration.

## Private deployment settings

Use a Docker Space under the personal account, starting with CPU Basic and a private Bucket mounted at /data. Private is the default; the user explicitly made this Space and its generic source entry public without changing application login or Bucket privacy. Do not repurpose unrelated projects or replace their mounts. Keep one replica.

| Name | Kind | Purpose |
| --- | --- | --- |
| PCR_CLOUD_PASSWORD | Secret | Required, 10 to256 characters; never reuse a brokerage password. |
| PCR_CLOUD_USERNAME | Variable | Defaults to pcr. |
| PCR_CLOUD_PUBLIC_ORIGIN | Variable | Optional on HF, where SPACE_HOST supplies the actual HTTPS origin; local tests need the exact loopback origin. |
| MOOMOO_WEBAPI_OAUTH_ENCRYPTED_JSON | Secret | Preferred for new deployments: AES-GCM encrypted bootstrap of the independent quote:read OAuth bundle. Encrypt and transfer the raw bundle only in controlled memory. |
| PCR_CLOUD_AUTH_KEY | Secret | Matching 64-hex-character AES-256 key; never place it beside the bootstrap ciphertext in source or logs. |
| PCR_CLOUD_AUTH_FILE | Variable | Example /data/pcr-auth/moomoo.enc.json on a verified private mount, containing ciphertext and its previous version only. |
| PCR_CLOUD_AUTH_LOCK_FILE | Variable | Optional; defaults to the local live-database directory, outside the Bucket, for single-container cross-process refresh serialization. |
| PCR_PUBLIC_VIEW | Variable | Set1 for this deployment to allow bounded guest PCR reads/explicit refresh; Docker defaults0. Owner configuration/private pages and the Bucket remain protected. |
| PCR_OI_DAILY_ENABLED | Variable | Set to 1 only after valid authorization and persistence checks; default 0. |
| PCR_STRUCTURE_DAILY_ENABLED | Variable | Omit to follow existing daily OI enablement, or set 0 to disable 17:45 structure scheduling independently. Valid authorization/verified backups are required; enabled does not mean executed. |
| PCR_HF_BACKUP_DIR | Variable | Example /data/pcr-backups on the actual private Bucket mount. |
| PCR_DB_PATH | Variable | Default /tmp/pcr-runtime/pcr.sqlite3, outside the Bucket. |
| PCR_PYTHON / PORT | Variable | Image defaults python3/7860. |

Raw MOOMOO_WEBAPI_OAUTH_JSON and static MOOMOO_WEBAPI_ACCESS_TOKEN/MOOMOO_WEBAPI_SCOPE/MOOMOO_WEBAPI_EXPIRES_AT remain compatibility modes, not recommended new-deployment settings. Static mode requires a real future expiry and manual replacement after expiry.

Use a separate cloud OAuth client/grant so the environments do not change each other's refresh state. Never transfer local Windows DPAPI files as cloud credentials. Refresh grants themselves expire; revocation requires official consent again. An undisclosed lifetime is not an infinite one.

## Open and sign in

This deployment is public and allows password-free PCR reads/refresh; owner edits/private pages use application sign-in. Other deployments choosing a private Space additionally need platform access. /_pcr/login offers a bilingual form. HTTPS *.hf.space uses independent __Host- partitioned session/CSRF cookies. Only the compatible login route accepts specified trusted HF parent origins and validates the5 min signed cookie against its hidden form value. APIs/logout/other mutations still require the actual app Origin; reject null. Login forms use strict-origin-when-cross-origin to preserve real form origins, without relaxing null checks. CSP frame-ancestors permits self/trustedHF domains only. If the browser still blocks partitioned cookies, open .hf.space in a new tab; never expose the internal port.

Private-Space automation keeps the HF Bearer in Authorization and the application Basic credential in X-PCR-Authorization. Do not combine them in one header or put credentials in URLs. All credentials and cookies are stripped before the loopback backend.

## Persistence and recovery

Startup verifies a real non-root Linux mount. Live SQLite uses local file locking; the Bucket stores closed consistent snapshots, avoiding reliance on unverified SQLite locking semantics of object mounts. See [Spaces storage](https://huggingface.co/docs/hub/spaces-storage) and [Bucket access patterns](https://huggingface.co/docs/hub/storage-buckets-access).

hf-storage.mjs uses the SQLite online backup API, checks integrity, computes SHA-256, writes immutable content and reads it back, then writes its manifest last. Incomplete uploads without valid manifests cannot restore. Identical content is deduplicated. Only when no live database exists, choose the newest valid snapshot among the most recent 50 manifests, falling back after damage; all-invalid manifests fail visibly instead of appearing to be an empty archive. Successful SQLite commits notify the parent using a fixed non-sensitive IPC message. Backups are debounced500ms; writes during backup schedule another pass. Retain startup, daily/hourly work and final normal-shutdown drain without automatic deletion. Reads, zero changes and rolled-back transactions do not fabricate notifications. Storage determines backup duration; abrupt crashes may still lose changes after the last successful backup.

oi_daily_state/oi_daily_runs share SQLite with OI observations, so recovery retains actual start/completion, query day, manual/scheduled mode, saved counts, retries and same-day deduplication. Keep private state and ciphertext outside source; authorization ciphertext and database backups occupy separate locations.

## Scheduling and cost

Default capture is daily at 17:30 America/New_York with daylight-saving changes. Weekends/holidays may return unchanged OI, but query timestamps remain actual. Populate settlement dates only with explicit provider confirmation.

PRO makes a personal account eligible for compute Spaces without removing CPU Basic idle sleep. A sleeping process cannot run the timer; configuration alone is not evidence of capture. Always-running hardware or independent Jobs require separate cost verification and selection; this deployment does not automatically enable them. See [Spaces overview](https://huggingface.co/docs/hub/spaces-overview), [sleep rules](https://huggingface.co/docs/hub/spaces-gpus) and [Jobs pricing](https://huggingface.co/docs/hub/jobs-pricing).

## Acceptance and status

1. Review manifests for private files. Missing owner password rejects startup. Without PCR_PUBLIC_VIEW, default login protection applies. When enabled, unsigned-in clients may read/explicitly refresh the PCR allowlist only; owner edits, private pages and admin APIs remain inaccessible without login.
2. HF Bearer and app login coexist. Verify same-origin login/logout, expiry/tampering, throttling and header stripping.
3. Verify encrypted bootstrap, wrong key/tampering, cross-process refresh, forced401 refresh, expired refresh grant and sanitized errors.
4. Missing authorization or verified durable mounts cannot establish successful collection. Actual OI retains original query time and nullable confirmed settlement date.
5. Restore a real SQLite backup into a fresh runtime without old temporary files. Daily results, deduplication and historical gray bars survive; failed transactions retain prior state.
6. Record actual remote URL, authentication, data reads, refresh and restart recovery separately. Do not migrate the local installation/Friday task or present manual checks as future scheduled execution.

Remote HTTP access/source refresh are verified. The24 actual signed-outHF Edge checks also passed; local/container checks and HTTP proof do not substitute for browser evidence.

## Update order and current checks

First confirm recent committed writes have a visible valid private backup. Pause the old Space and wait forPAUSED before uploading new source and starting it. ActualHF rolling deployment started a newPod before the oldPod shutdown backup became visible, temporarily restoring older state. Shutdown-only backups or restart-only updates are therefore insufficient. Check backups around pause and restore from the confirmed snapshot. Operator helpers/auth caches stay private and outside public source.

Independent grants, actual OI capture, owner login and paused-update restore passed; the Bucket contains private backups and separate ciphertext. Final HF anonymous HTTP checks passed without any HF token, cookie or password: homepage/charts/public APIs/source refresh200, settings storage cloud, private pages/APIs401, valid unpublished symbol403, cross-origin403 and owner form303/session API200. Actual OI refresh succeeded7/7 followed by429, preserving the private Bucket, CPU Basic and existing archives. All24 actual signed-outHF Edge checks passed and are recorded separately from HTTP evidence; the then-unobserved 17:30 conclusion retains historical meaning.

## Current audience and verified behavior

| ID | Current behavior and boundary |
| --- | --- |
| PUB-001 | Explicit user choice makes the Space and guest PCR reading/refresh public. PCR_PUBLIC_VIEW=1 enables a bounded public gateway for generic source and projected PCR data. Secrets, Bucket, runtime database and administration stay protected; migrate no local personal database. |
| PUB-002 | Guests read PCR and explicitly refresh without a password; watchlist/group/reference edits and private pages require owner login. readOnly:true/canRefresh:true protect configuration while allowing source refresh. Real no-token/no-cookie HF HTTP reads/refresh200 and private401 are verified; record the24 passed actual signed-outHF Edge checks separately. |
| PUB-003 | Actual cloud queries succeeded7/7, preserving2026-11-26 query time with0 confirmed settlement dates. Verify-backup→PAUSED→upload→start restored7 watchlist entries and historical OI. The private Bucket contains consistent snapshots/manifests and separate ciphertext; write IPC produced later backups. Metadata may lag seconds, not instant durability. |
| PUB-004 | Actual public HF settings return WATCHLIST_STORAGE=cloud; Windows stays local. This is not per-visitor databases or multi-user authorization. Environments remain independent; cloud17:30 is enabled, with future execution unobserved. |

CPU Basic/storage boundaries remain, with no new paid hardware/Jobs. The earlier entry-only stage is superseded by the selected bounded guest PCR reads/refresh. Owner edits stay protected; record final remote checks separately and change no unrelated project.

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

Final HF anonymous HTTP checks passed without any HF token, cookie or password: homepage/charts/public APIs/source refresh200, settings storage cloud, private pages/APIs401, valid unpublished symbol403, cross-origin403 and owner form303/session API200. Actual OI refresh succeeded7/7 followed by429, preserving the private Bucket, CPU Basic and existing archives. All24 actual signed-outHF Edge checks passed and are recorded separately from HTTP evidence; the then-unobserved 17:30 conclusion retains historical meaning.

## Final remote HTTP record,2026-11-26

Feature source789f9f5 is RUNNING. The verification client used no HF token, cookies or app password. Homepage/charts/public APIs/access flags/settings returned200 with settings.storage=cloud; private APIs/HTML401, cross-origin403 and a valid unpublished ticker403. Owner login remains functional: form303 and session homepage/API200. The Bucket is private and hardware remainsCPU Basic.

Guest OI refresh actually called moomoo and returned7/7 at2026-11-26T08:20:01.812Z. A later eligible refresh at08:21:18.707Z again returned7/7, followed by429 and observed Retry-After:59seconds (not a fixed constant). The14 earlier observations remained. Guest POST /api/refresh returnedHTTP 200/status:updated, advancing volume records to2026-11-25 with checkedAt2026-11-26T08:22:48.122Z. November26 is a holiday: a check date is not that date's trading session. Exact OI settlement dates remain unknown.

The25 local guest-browser checks passed. The actualHF results above are HTTP acceptance; all24 actual signed-outHF Edge checks passed separately and ongoing, not completed by implication. The cloud17:30 schedule is enabled but future triggering unobserved. Later documentation commits may change the source hash without changing this evidence's time/scope.

All24 checks in a fresh signed-out realEdge session passed against actualHF, covering guest banner/canRefresh, hidden editing/private links, Chinese/English at892/320 without overflow and no runtime errors. This is not a fixture; the25 local checks remain separate evidence.

Actual guest Cboe snapshot refresh returnedHTTP 200 with dataDate2026-11-25 and checkedAt2026-11-26T08:23:18.477Z. History refresh returned200; the subsequent history GET had actualEnd/asof2026-11-25 and252 rows. This verifies that refresh/cache read, without expanding Cboe scope or relabeling the November26 holiday as a trading session. Future17:30 scheduled execution remains unobserved.

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

## v0.2.9: Daily diagnostics and first real scheduled acceptance

Reuse the existing owner-only GET /api/oi-daily and Scheduled reviews status area; guests still receive401. Add no API, database migration, paid hardware or Jobs, and change neither current administrator credentials nor moomoo quote:read consent. At startup ensureOiDailyMonitoring registers monitoringEnabled/monitoringEnabledSince in existing oi_daily_state.payload_json. Ordinary status GETs do not register a task or modify that start. Preserve it across normal restarts, reset after disable/re-enable, and do not infer older missed days from an unknown start.

| ID | Cloud diagnostics contract |
| --- | --- |
| HF029-001 | health distinguishes waiting, awaiting, success, partial, failed, missed, empty_watchlist, disabled and unconfirmed. It assesses assessedDate, the latest due day; yesterday's success cannot mean today's future plan is complete. Label currentPlanAt, assessedDueAt, lastScheduledRun, lastSuccessfulScheduledAt and the next plan separately. |
| HF029-002 | Read scheduled evidence independently from existing database runs; later manual records do not overwrite it. Read at most 128 runs and inspect at most 30 recent dates no earlier than activation. First-day due time is max(that day's 17:30,monitoringEnabledSince); add a missingDate only after a 5-minute grace without a valid completed scheduled report. GET does not read/clear capture locks, and absent evidence alone proves neither non-execution nor source failure. Show consecutive missing days and evaluatedFrom without attributing absence to sleep/shutdown/networking as a proven cause. |
| HF029-003 | scheduledEvidence is unobserved, success_observed, partial_observed, failure_observed or empty_watchlist_observed. Ready, manual observation counts and future nextPlannedAt are not substitutes. Real future 17:30 acceptance requires actual scheduled start/completion, query day, requested/saved/unavailable counts and corresponding archives; clock fixtures or later source fetches cannot stand in. |
| HF029-004 | authorization returns only configured, status, accessExpiresAt, refreshExpiresAt, refreshExpiryKnown and renewable. status is available, refresh_needed, reconnect_required, not_configured or unavailable. Unknown refresh expiry remains null/refreshExpiryKnown:false, without permanent-access promises. GET reads already saved safe metadata only, causing no network, renewal, capture or token write and exposing no secrets, paths or raw errors. |
| HF029-005 | Sleeping/stopped CPU Basic cannot run the task. A visit restores current service only; OI never obtained on past dates stays missing. Preserve15-minute retries/at most3 attempts, same-day deduplication and private-backup recovery. Install no external keepalive or silent hardware upgrade; plans, health reads and actual execution are separate evidence. |

See SUM/AC-81 in the [Product Spec](PRODUCT_SPEC.en.md) and [Cboe scope](CBOE_SOURCE_SCOPE.en.md) for the homepage summary: preserve source and row-level actual dates, and never refresh a source merely to display it. v0.2.9 actual status: feature source daaf0dd is running on HF. Full npm test passed 99 Node cases plus model/source checks; 27 fixture-browser, 13 real anonymous-cloud browser and 12 read-only HTTP checks passed separately. Current references/watchlists deduplicate to 11 rows. For selected 2026-11-26, activity dates remain no later than November 25; English/Chinese at 892/320px have no page overflow or uncaught exceptions, and visitor refresh remains available. Owner diagnostics return health=waiting, scheduledEvidence=unobserved and missingDates=[]. Monitoring began at 2026-11-26T10:23:40.250Z (05:23:40 ET), with the next plan at 2026-11-26T22:30:00Z (17:30 ET). authorization=refresh_needed describes saved refreshable metadata, not a failed current connection. Diagnostic checks performed no quote request, renewal or invented scheduled run. The 7 prior watchlist preferences, 42 OI observations and Core/Cboe hashes remained; private diagnostics returned 401 and unpublished symbols 403 without credential disclosure. Actual future 17:30 execution remains unobserved and cannot be inferred from these tests. Preserve GitHub v0.2.3 release files, current administrator settings and private storage.

## v0.2.17: Durable structure archives, backups and sleep

| ID | Cloud boundary |
| --- | --- |
| HFGARCH-001 | New 0008 snapshots/runs/state share private SQLite and existing consistent backups/manifests in a private Bucket. Live SQLite stays on local container disk, not directly on the object mount. Keep OI archives, cloud Core/Cboe worker_cache and volatile live GEX cache distinct; historical reads do not establish live-cache restoration. |
| HFGARCH-002 | Check daily 17:45 America/New_York with DST while the cloud process runs. Default follows daily OI enablement; PCR_STRUCTURE_DAILY_ENABLED=0 independently disables structure scheduling. OI remains 17:30 with separate states/actual-scheduled evidence. PRO CPU Basic can still sleep; punctual/full daily collection is not guaranteed. Add no compute upgrade, external keepalive or billed Jobs. |
| HFGARCH-003 | After sleep, capture actual-today observations only if today's due time/budgets permit, without reconstructing missed days or writing new queries under old dates. Persistent leases, same-day checkpoints, up to three scheduled attempts separated by 15 minutes, and request/20-minute budgets still depend on uptime. Provider updates may predate query day. Historical selections show saved observations, not confirmed OI settlement that day. |
| HFGARCH-004 | Project public history to currently published symbols only; safe structure status is public, while whole-batch manual capture requires owner login and 202 is not completion. History/status reads neither fetch providers nor renew grants. Preserve quote:read/owner edits/admin/private boundaries. Archives are not complete contract chains, actual dealer inventory or automatically reconstructed backtest history. |
| HFGARCH-005 | Current consistent SQLite backups have a 512MiB single-file cap. Append-only new tables grow private disk/Bucket/backups, not GitHub quote files. Per-observation raw/gzip limits are 1,500,000/512,000 bytes; lists are bounded but database archives are not automatically deleted. Capacity is not unlimited. savedCount/local commits do not prove successful backup: inspect the latest valid manifest. Limits/failures neither silently delete history nor establish recoverability; storage changes need a separate choice. |
| HFGARCH-006 | Before updates, verify a valid private backup containing latest archives/run state, then PAUSED→source upload/start. Use GET only after restart to compare original snapshot ids/counts/provider-query times/scopes/content and existing PCR/OI data. Refetching is not restoration. Record manual capture, configuration, actual 17:45 execution, backup recovery, anonymous HTTP and real browsers separately. |

See the [backend guide](MOOMOO_BACKEND.en.md) for history APIs/standalone Windows tasks and [Product Spec](PRODUCT_SPEC.en.md) for coverage/comparison. Local and HF archives remain independent, without automatic personal-database or local-grant migration.

## v0.2.18: History-page read performance

| ID | Hosting and preservation |
| --- | --- |
| HFPERF-001 | Bounded successful-record/short-lived date-header caches and same-key coalescing within the current page reduce repeated historical GETs only; index/safe status remain no-store. One ordinary read-only status SQL statement reduces database-bridge work, with bounded fallback for large checkpoints. Dynamic run/lease state still uses current database values and the clock; the30-second Windows-task cache applies only to local plan metadata. Add no migration, authorization, replica, paid hardware or Jobs, preserving CPU Basic sleep limits. Page caches do not replace private SQLite/Bucket archives/backups. Reload/invalidation preserves current published-symbol and owner permissions. Verify existing backup→PAUSED→update→GET-only original-data recovery; cache hits neither retimestamp sources nor establish faster upstream collection. |

See PERF-018 in the [Product Spec](PRODUCT_SPEC.en.md) and PERF-API in the [backend guide](MOOMOO_BACKEND.en.md) for bounds, lifetime, invalidation and reproducible measurement. Record deployment and actual timings separately.

The current application and administrator sign-in default to English without a valid language choice. Valid URL/saved Chinese preferences take precedence; users can switch both ways and save the choice. The showcase shares this default rule with independent device preferences. Historical static snapshots retain their original languages. Language changes alter no authorization, account or archive data.
