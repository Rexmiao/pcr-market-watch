# Cboe Daily Report Coverage and the EQUITY Historical Method

[简体中文](CBOE_SOURCE_SCOPE.md) | **English**

Reviewed on 2026-11-24. The data entry point is [Cboe Daily Market Statistics](https://www.cboe.com/markets/us/options/market-statistics/daily/?dt=2026-11-23).

The project stores four categories separately: TOTAL, INDEX, EXCHANGE TRADED PRODUCTS (ETP), and EQUITY. TOTAL includes the other three categories. Do not add TOTAL to INDEX, ETP, or EQUITY again, and do not add the category PCRs directly. In this classification, EQUITY refers to single-stock options; ETP includes options on ETFs and ETNs. See the [official product description](https://www.cboe.com/exchange-traded-stock/).

This daily report uses Cboe's reporting scope and must not be labeled as an aggregate of options activity across all U.S. exchanges. Cboe's [official explanatory article](https://www.cboe.com/insights/posts/how-early-exercise-order-flow-impacts-equity-option-put-call-ratios) identifies the single-stock flow in this series with Cboe Options Exchange (C1), and separately compares it with all-exchange data. The current daily report does not explicitly state that its scope has expanded to all four Cboe exchanges, so the project does not claim that coverage.

## Directly published observations and historical derivation

Newly retrieved official pages are parsed directly for the EQUITY PUT/CALL RATIO and the VOLUME row under EQUITY OPTIONS. The response is marked `derived:false` and `source:cboe_published`; the daily PCR retains the official published value.

The existing historical seed and cloud cache retain only TOTAL, INDEX, and ETP. To reconstruct EQUITY history, the following differences are calculated using the categories in the same daily report:

```text
Equity Put  = Total Put  - Index Put  - ETP Put
Equity Call = Total Call - Index Call - ETP Call
Equity daily PCR = round(Equity Put / Equity Call, 2)
```

The official quantities for the four categories on 2026-11-23 can be checked individually against this identity. The differences give Equity Put volume of 1,836,973 and Call volume of 3,321,053, producing a PCR of 0.55. For the 331 trading sessions from 2025-08-01 through 2026-11-23 in the existing history, the original totals for the three categories all yield nonnegative differences. This is a historical reconstruction based on the category relationship in the same report; it does not mean that the official EQUITY PCR field was retrieved or retained separately for every historical day.

These historical observations must therefore be marked `derived:true`, `source:derived_from_cboe_category_volumes`, and `derivation:total_minus_index_minus_etp`. The method assumes that the category relationship is consistent throughout the reconstructed period. If changes in the official product classification are discovered later, the affected history must be reviewed again; derived observations must not silently be relabeled as directly published data.

The difference calculation requires all Put and Call quantities in the three categories to be present, nonnegative safe integers. The resulting differences must also be nonnegative safe integers. If those checks fail, the EQUITY quantities and PCR remain missing while the original three categories are retained. If the derived Call quantity is zero, the daily PCR is `null`; infinity or a zero ratio must not be presented as a valid reading.

The 5-, 20- and 60-session EQUITY PCRs divide total Equity Put volume by total Equity Call volume within each window. The frontend derives the 5-session value from existing daily quantities; existing 20/60 values and API fields remain unchanged. They do not average the already rounded daily PCRs. A window requires complete, consecutive trading sessions and valid quantities. A gap, insufficient history, or a zero total Call quantity leaves that window's PCR missing. The historical row fields `derived20` and `derived60` indicate whether the corresponding window used any derived data. Later windows may combine directly published quantities with reconstructed quantities whose sources are explicitly identified.

## API compatibility

- Snapshots add `snapshot.metrics.equity`, with the same fields as the other categories plus `derived`, `source`, `derivation`, and `method`.
- History adds `rows[].equity`, containing `daily`/`dailyText`, `p`/`c`, `p20`/`c20`/`r20`, `p60`/`c60`/`r60`, `derived`, `derived20`, `derived60`, `source`, and `method`.
- Older caches containing only the original three categories remain readable, and EQUITY can be reconstructed according to the rules above. A missing EQUITY category does not invalidate the original three categories.
- Source metadata and check times continue to distinguish the activity date from `checkedAt`. Reconstructing historical quantities does not replace the seed's original check time with a new retrieval time.

SPY, QQQ, and DIA PCRs are separate statistics for each ETF's options. They can serve as ETF references for the corresponding indices, but they do not replace the Cboe INDEX aggregate category and are not labeled as PCRs for SPX, NDX, or DJX index options themselves.

## Page coverage and state hints (v0.2.5 local/unpublished)

A watchlist-calendar blue dot means at least one symbol has volume records that day; show valid p/c daily-record counts/totals and missing symbols for complete watchlist items, independent of category filters, with coverage in button title/aria. It does not guarantee every symbol, 20/60-session window, or OI measure is available, or expand Cboe daily-report coverage.

Historical OI and volume are separate. Without reliable historical OI, leave gray bars blank rather than backfilling current snapshots. The latest view also needs reliable selected-source OI and valid call OI denominator. Above-chart reasons identify missing symbols, separating historical actualDate from latest volume date data.asof. Keep check time, volume activity date, and OI settlement date separate, never filling missing values with zero.

Market-brief colors identify sources: failure of a quote endpoint does not invalidate healthy Cboe records. Gaps/old data and normal waiting have distinct messages. These are display/coverage explanations only; category definitions, EQUITY derivation, consecutive-window rules, and original check times are unchanged.

Related documentation: [Product specification](PRODUCT_SPEC.en.md) · [Release specification](RELEASE_SPEC.en.md).

## v0.2.7 public PCR and Cboe cache browsing

| ID | Source and access rule |
| --- | --- |
| CPUB-001 | Guests may view PCR and explicitly refresh data. Configuration editing and source refresh are distinct permissions. Each refresh type shares60-second cooldown/coalescing with429 retry timing, not a new budget per visitor. |
| CPUB-002 | Public /api/cboe GET forces internal x-pcr-cache-only:1, reading verified snapshots/seed/loaded history. Missing requested dates return200 with snapshot:null/refresh_required without substituting another day. No date selects latest actual cache. Date browsing makes no source call or refresh-budget use. |
| CPUB-003 | Only explicit Cboe POST refresh fetches source data within the60-second budget. Waits/closures/failures retain actual dates. TOTAL/INDEX/ETP/EQUITY coverage, quantity-based EQUITY derivation and20/60-session sums remain unchanged. |
| CPUB-004 | Public aggregates and published lists are separate. Generic default-seven core data was already published in source and remains a frontend-contract exception. Custom-symbol/OI queries accept current published lists/references only. Hide private groups/accounts/positions/credentials/raw private moomoo interfaces. OI archives preserve real query days and only explicitly confirmed settlement dates. |

Local/container Cboe cache/rate checks and actualHF anonymous PCR/source-refresh HTTP checks passed. The24 actual signed-outHF Edge checks also passed. Public mode broadens neither Cboe coverage nor PCR interpretation.

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

## v0.2.9: Dates, changes and percentiles in the summary

| ID | Display method |
| --- | --- |
| CSUM-001 | The PCR change summary uses current selected categories/references/personal symbols and labels actual dates per row. Group Cboe aggregates separately from OCC instruments; do not sum or blend ratios. TOTAL/INDEX/ETP/EQUITY stay independent, and ETF references such as SPY/QQQ/DIA are not index options themselves. |
| CSUM-002 | Daily change is PCR on the row's actualDate minus PCR on the exact preceding U.S. session, a signed ratio difference rather than a percentage. A requested-date gap may display an earlier actualDate without relabeling it; a missing preceding session or invalid Call denominator leaves change blank, never substituting the previous available row. |
| CSUM-003 | 20/60-session ratios remain aggregate Put divided by aggregate Call. Cboe windows with missing required sessions remain blank; existing OCC activity-record limits remain. A common summary table does not unify these definitions. |
| CSUM-004 | 20-session percentile uses at most 252 valid r20 values strictly before the actual data date, excluding current/future rows and midpoint-ranking ties. Show actual n/252; n=0 or missing current r20 yields blank. Changes/percentiles describe relative activity/historical position, not net long/short shares or future return probabilities. |
| CSUM-005 | Reuse current caches. Non-CORE GET /api/symbol may carry x-pcr-cache-only:1, taking precedence over refresh=1. Available cache retains original asof/checkedAt even beyond normal refresh freshness. A miss returns 200 with instrument/asof/checkedAt/coverage:null and refresh.status=cache_miss. This read performs no source fetch or attempt/cooldown writes; published-symbol limits and existing Cboe cache-GET rules remain. |
| CSUM-006 | available:false Cboe session-grid placeholders are not source observations. An available:true category record with zero Call/missing PCR keeps that actual date and blank values; it does not borrow an older ratio. |
| CSUM-007 | EQUITY rows label derived history when any current daily/20/60 value or 20-session percentile sample uses it. Derivation subtracts INDEX/ETP Put and Call counts separately from TOTAL, then divides; PCRs are never subtracted. Source labels and 20/60 comparisons stay factual and preserve these distinctions. |

The summary changes neither source coverage nor historical dates. See SUM andAC-81/82 in the [Product Spec](PRODUCT_SPEC.en.md). Record v0.2.9 deployment and actual scheduled execution separately from calculation tests.

Actual v0.2.9 summary acceptance on feature source daaf0dd passed: 11 dynamic deduplicated rows, selected November26 retaining activity dates no later than November25, bilingual 892/320px display and no uncaught exceptions. The 99 Node/model/source checks, 27 fixture-browser, 13 real cloud-browser and 12 HTTP checks are separate evidence; future 17:30 scheduled capture remains unobserved.

## v0.2.12: Five-session derivation from existing quantities

| ID | Source and calculation rule |
| --- | --- |
| CSHORT-001 | The frontend view model computes 5-session volume PCR from summed daily Put/Call quantities for the same category, not mean daily ratios or a newly published Cboe indicator. Use five consecutive expected U.S. sessions ending at that point. available:false, missing sessions/counts or warm-up leave a gap; zero aggregate Call yields null r5 and valid zero Put can yield zero. Add no API field, source request, raw data or seed; existing 20/60 values are unchanged. |
| CSHORT-002 | For EQUITY, subtract each day's Put/Call categories separately under the existing method before summing. A complete five-session window has derived5=true if any daily row is derived; mixed directly published/derived windows remain labeled. Do not rewrite published daily values, source coverage or checkedAt. Cut dates/display lengths neither introduce future rows nor change same-day windows. |
| CSHORT-003 | The same five-session formula over OCC still uses its last five acquired activity records; do not extend Cboe's consecutive-session guarantee to OCC or blend sources. Five-session percentile/prior-year comparisons remain independent and exclude look-ahead. Full 20-session PCR >/< /= 60-session PCR labels with hover/focus explanations describe relative activity, not net long/short shares, open/close or price direction. Add no rolling OI average. |

This extends displayed measures without expanding Cboe exchange/product coverage. Math/history/summary/calendar 32/32, existing model 11/11, 3 Cboe/reference/settings, 5 OI-interface, 7 related frontend and 22/22 fixture-browser checks passed. Source build/artifact and local installation validation passed with data/cache/SQLite/task baselines retained. Fixtures had no JS errors or POST/PUT and do not present simulated values as market observations. Actual HF deployment/read-only recovery and real scheduled execution require independent runtime records. See the [Product Spec](PRODUCT_SPEC.en.md) and [Release Spec](RELEASE_SPEC.en.md).

## v0.2.13: Source boundaries for ordering and per-window direction

| ID | Source and interpretation rule |
| --- | --- |
| CINT-001 | Interpret existing r5/r20/r60 for one provider/category/symbol and one explicit actual date only. Do not approximately substitute missing explicit dates. Differences use the same window on the exact preceding U.S. session, not the previous visible row. Keep Cboe actualEnd, source/derived identity and check times. Interpretation does not unify OCC window limits; OI is excluded. A non-session actual anchor preserves its date/levels/order but has unknown directions, an insufficient reading and no continuity confirmation. |
| CINT-002 | Same-date ranking is independent of up/down direction; 1e-12 suppresses floating-point noise only. Missing prior values make that arrow unknown; any missing current/exact-prior value among three windows makes the overall reading insufficient. Rule continuity requires nonzero same-direction r5/r20 changes over three comparisons on four exact consecutive sessions; gaps cannot count. Keep r60 as independent background, without inferring a major trend. |
| CINT-003 | Three comparisons are descriptive observations, not backtested validation, significance, trading signals or price forecasts. Overlapping windows are not independent signals and decreasing Calls can raise PCR. Rankings/arrows are not net positions/open-close/capital shares/short-seller counts. Add no coverage, source requests, API/schema/seeds or polling; existing 20-versus-60 help and 5/20/60 formulas stay unchanged. |

This adds interpretation only; v0.2.12 evidence remains historical. Interpretation/summary 22 Node checks, 8 five-session regressions, 7 permissions/frontend checks and final fixture-browser checks at 18/18 passed without JS errors or POST/PUT. Source build/artifact and local installation validation passed with data/cache/SQLite/task baselines retained. Actual cloud/read-only recovery and real scheduled execution require separate runtime records. See the [Product Spec](PRODUCT_SPEC.en.md) and [Release Spec](RELEASE_SPEC.en.md).

## v0.2.14: Independent Gamma/Max Pain source

| ID | Source boundary |
| --- | --- |
| CSRC-GEX-001 | New Gamma/GEX, walls, zero-Gamma points and single-expiry Max Pain come from independent moomoo WebAPI. They are neither Cboe INDEX/TOTAL/ETP/EQUITY PCR categories nor OCC completed-day volume. Each retains its own expiration scope, provider/retrieval times and missing state. Do not merge these model measures into PCR or OI history. |
| CSRC-GEX-002 | Existing Cboe/OCC daily/5/20/60, derived-history, percentile, actual-date and gap rules are unchanged. The new endpoints use bounded process snapshot cache, without expanding Cboe coverage or implying Gamma history/real-time dealer inventory. Undisclosed units/directional assumptions stay unknown; PCR does not reconstruct the blue curve, walls or pain point. |

See v0.2.14 of the [Product Spec](PRODUCT_SPEC.en.md) for windows, comparison, changes and acceptance, and the [moomoo backend guide](MOOMOO_BACKEND.en.md) for fields and quote:read boundaries.
