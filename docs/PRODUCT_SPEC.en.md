# PCR Market Watch Product Specification

[简体中文](PRODUCT_SPEC.md) | **English**

Date: 2026-11-25. Scope: the current project's watchlists, groups, PCR data, historical comparisons, local moomoo market-data backend, and bilingual GitHub Pages showcase and documentation entry points. This document describes source-code behavior and acceptance requirements for this iteration. Completed source changes, passing tests, local operation, and a published deployment are separate states.

Maintenance requirement: changes to features, data methodology, or publication must update the affected Chinese and English specifications in the same change. See [project maintenance rules](../AGENTS.md) for documentation responsibilities and completion criteria.

The structure uses user stories, requirement IDs, acceptance scenarios, and verifiable success criteria, drawing on the [official GitHub Spec Kit specification template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md). Only the writing structure is reused; Spec Kit, OpenBB, and a new application framework are not installed.

## 1. Product goal and current boundaries

Users can maintain personal U.S. stock watchlists and groups, view OCC volume PCR for individual stocks and ETFs, and view Cboe INDEX, TOTAL, ETP, and EQUITY aggregate PCR. The interface must clearly distinguish activity dates, check times, coverage, and missing values.

| Capability | Current source status | Boundary |
| --- | --- | --- |
| Database-backed watchlists and groups | API, frontend models, and database migrations implemented | Hosted operation uses D1; local preview uses independent SQLite. They do not automatically copy data between environments. |
| Unified management of initial and added symbols | Implemented | Defaults are used only for first initialization; no core symbol is permanently undeletable. |
| OCC stock/ETF volume PCR | Implemented | Completed-day source, not real-time intraday PCR. Added symbols retain independent coverage. |
| Editable market PCR references and history | Independent settings API, model, and editing interface implemented | The initial seven recommendations are four Cboe categories plus SPY, QQQ, and DIA. Every recommendation is removable; supported Cboe categories and valid OCC stocks/ETFs can be added. This list is independent of the personal watchlist. |
| OI PCR | Existing one-time snapshot retained | Not refreshed with volume. An unknown actual settlement date is identified explicitly; unavailable sources remain blank. |
| Historical comparisons | Implemented and passed local acceptance checks | Historical percentiles and prior-year comparisons are separate views. Historical statistics are not converted into price-direction probabilities. |
| Local moomoo market-data backend | Read-only adapter endpoints implemented | Requires the local CLI, market-data service, and actual permissions. This does not imply a complete market-data terminal interface. |
| Bilingual GitHub Pages showcase | Chinese/English switching, an English GIF, and language-specific documentation links published | Static showcase and download entry point. The full PCR interface, database, and refresh run on the local backend. |
| Cloud access to moomoo on the user's computer | Not implemented; a possible later option | No persistent cloud bridge, remote-computer connection, or automatic credential synchronization. |
| Trading and brokerage account/position operations | Outside product scope | No account/position queries, order placement, modification, cancellation, or trading unlock. |

## 2. User stories

### US-01: Maintain personal watchlists and groups (P1)

Users want initial and subsequently added symbols to follow the same rules for addition, removal, classification, and restoration. The webpage supports creating custom groups and deleting default or custom groups. There is currently no group-renaming control in the webpage; the API can change names when saving the complete `groups` document.

Independent acceptance: create watchlists for two users. Remove all defaults for the first user, add SNDK, create a group with a Chinese name, move a symbol, delete the group, and reopen the page. Results must come from the database, and the second user's watchlist must remain unaffected.

### US-02: Understand current readings and historical windows (P1)

Users select a date to view daily, 20-session, and 60-session PCR, with source and coverage dates. If a complete report for that date is unavailable, the page must show missing data or pending publication rather than presenting the previous day's number as that day's value.

Independent acceptance: recompute all three periods from the same raw Put/Call quantities. Select an unpublished date, a historical date, and Cboe history containing a gap; verify empty states, actual history end dates, and OI display rules.

### US-03: Prevent concurrent windows from overwriting each other (P1)

When users edit the same list in two browser windows, a later submission based on an old revision must not silently overwrite the newer version saved by the other window.

Independent acceptance: save different lists from two windows using the same revision. Only one save succeeds; the other receives a conflict and displays the server's current items and groups.

### US-04: Read moomoo market data locally (P2)

Users can read quotes, daily K-lines, option expiration dates, and option chains within a specified expiration range in local preview. Connection or permission failures must show the actual failure state and must not imply that real-time data has been obtained.

Independent acceptance: use controlled CLI responses to verify allowed queries, timestamps, timeouts, and errors. Confirm that trading commands and arbitrary commands cannot be invoked from the webpage.

### US-05: Freely edit market PCR references (P1)

Users want the upper market PCR list to support additions and removals. The initial recommendations are four Cboe categories, INDEX, TOTAL, ETP, and EQUITY, plus the three OCC ETFs SPY, QQQ, and DIA. These entries are not permanently fixed. Valid OCC stocks or ETFs can be added to the same selector, with each entry retaining its own source and coverage dates.

Independent acceptance: remove all seven recommendations and reopen the page; the list remains empty. Add SNDK and an OCC ticker with the same text as a Cboe category; source identities and curves must not mix. Editing the market list must not change the original personal items or groups, and the reverse must also remain independent.

### US-06: Choose the showcase and documentation language (P1)

Visitors can switch the GitHub Pages showcase between Chinese and English and open the corresponding README and product Spec. Their language preference is retained on return visits; English demonstration images and the GIF keep their original content.

GitHub displays the English `README.md` by default. The full Chinese version is `README.zh-CN.md`; `README.en.md` remains a full English compatibility copy. This repository default does not change the showcase's Chinese default or existing application language preferences.

Independent acceptance: open Chinese and English direct links to `#preview`, switch language, open the demo dialog and documentation links, and return. Check the language, metadata, document targets, and mobile layout.

## 3. Watchlist and group requirements

| ID | Requirement |
| --- | --- |
| WL-001 | One user configuration saves `items` and `groups` together, replacing the complete document and sharing one revision. |
| WL-002 | `items` accepts at most 30 distinct tickers, retaining user-provided order. For duplicate tickers, retain the first entry. |
| WL-003 | Trim ticker whitespace and convert to uppercase. Accept an initial ASCII letter followed only by letters, digits, or periods, with a total length of 1–10. |
| WL-004 | Each item is `{symbol, category}`. `category` is an ID present in `groups`, or `null` for unassigned. |
| WL-005 | `groups` accepts at most 30 entries, each `{id, name}`. IDs accept `semi`, `etf`, `other`, or `custom_` followed by 1–64 letters, digits, underscores, or hyphens. |
| WL-006 | Group names contain 1–40 characters after trimming and no control characters. IDs must be unique; names must be unique after trimming and case-insensitive comparison. |
| WL-007 | The webpage supports creating custom groups and deleting all default or custom groups. The API can rename groups when saving the complete `groups` document; the current webpage has no rename control. “All” and “Unassigned” are derived views, not database groups. |
| WL-008 | Deleting a group sets its symbols' `category` to null in the same save, retaining the symbols. Reject saves containing orphaned categories. |
| WL-009 | `items=[]` and `groups=[]` are valid saved states. Reloading or adding symbols must not automatically restore deleted default items or groups. |
| WL-010 | When no record exists, GET returns an uninitialized state. Only the frontend performs a one-time initial migration of defaults, old browser watchlists, and default groups, submitting revision 0. |
| WL-011 | Removing a symbol changes personal configuration only; it does not delete the public market-data cache. The same ticker can be added again later. |
| WL-012 | Search suggestions use a small curated directory of company names and Chinese names. Direct entry of valid tickers is also supported; the service does not claim full-market company-name search. |
| WL-013 | The search input uses a generic “Enter a stock or ETF ticker” placeholder, not a fixed SNDK example. Pointer or arrow-key interaction changes the highlight. Enter directly adds the highlighted candidate, or uses the current typed ticker when no candidate is selected. A stale candidate from an earlier query must not be used. |
| WL-014 | Enter during IME composition confirms input only. Held or repeated Enter, already-watched tickers, and saves in progress must not create duplicate records. Do not add a symbol without valid activity records. |

## 4. Configuration data and API contracts

### User configuration

The `user_watchlists` database table contains `owner_id`, `items_json`, `groups_json`, `revision`, and `updated_at`. Database migrations define schema only; they do not write user lists or default groups. Request handling must not create or alter table structure.

Hosted operation determines the owner from the platform-supplied `oai-authenticated-user-id`. A request body, query parameter, or service-access credential cannot select the owner of personal data. Missing user identity returns 401. Local preview injects `local_user` on the server, representing one local user's configuration rather than a multi-user login system.

### Reads and writes

| Request | Behavior |
| --- | --- |
| `GET /api/watchlist-settings` | Returns `{items, groups, revision, updatedAt, storage, initialized}`. With no record, items/groups are null, revision is 0, and initialized is false. GET does not write to the database. |
| `PUT /api/watchlist-settings` | Accepts only `application/json` containing `{items, groups, revision}`. The complete request body is limited to 8192 bytes, and only same-origin requests are accepted. |
| First PUT | Revision must be 0. An atomic insert creates revision 1; if another window has already initialized the record, return 409. |
| Later PUT | Atomically replace items/groups and increment revision only when the database revision matches the request. |
| Conflict | Return 409 and the server's complete current configuration. The frontend adopts current values and must not automatically overwrite them with old edits. |
| Failure | Invalid input, missing identity, and database unavailability return explicit errors. An unconfirmed save is not treated as successful, and the application does not silently fall back to a browser-stored list. |

Example request:

```json
{
  "items": [
    {"symbol": "SPY", "category": null},
    {"symbol": "SNDK", "category": "custom_chips"}
  ],
  "groups": [{"id": "custom_chips", "name": "芯片观察"}],
  "revision": 3
}
```

`storage` is cloud or local and identifies the database environment actually in use; it does not mean local SQLite has synchronized to D1. The browser may retain device preferences such as language, but personal watchlists follow database responses.

### Independent market PCR configuration

Market PCR references use the separate `user_market_pcr` table. The original personal items and groups in `user_watchlists` are not migrated or linked as a result. Source caches can be shared, but removing a configuration entry does not delete public caches, and a remaining cache must not cause an entry to reappear in the list.

| Request or rule | Contract |
| --- | --- |
| `GET /api/market-pcr-settings` | Read the current identity's market list. An uninitialized list returns items=null, revision=0, initialized=false. GET does not write a record. |
| `PUT /api/market-pcr-settings` | Accept only same-origin JSON requests, with an entire-body limit of 8192 bytes. Save the complete `{items, revision}` document using an independent revision for atomic first insert or compare-and-update. Conflicts return the current server list without automatic overwrite. |
| Market entry | Cboe uses `{type:"cboe", key:"index"|"total"|"etp"|"equity"}`; OCC uses `{type:"symbol", symbol:"SNDK"}`. Each entry accepts only its corresponding two fields. |
| Limit and deduplication | At most 40 distinct entries, retaining order. Cboe categories and uppercase OCC tickers use separate source namespaces and are not deduplicated across sources. |
| Initial recommendations and empty lists | Only an uninitialized list may save the seven recommendations once. Saved `items=[]` is valid and must not restore recommendations after reopening, a source failure, or a read failure. |
| Identity and isolation | Retain trusted platform identity, same-origin requests, and database error rules. Market and personal lists handle their contents, revisions, and initialization states independently. |

For example, `{type:"cboe",key:"index"}` and `{type:"symbol",symbol:"INDEX"}` are different entries. The former reads the Cboe index category. The latter can display stock/ETF PCR only after OCC records for that ticker have been obtained. Matching names cannot justify substituting another source's data or labels.

## 5. PCR and time definitions

### Calculation methodology

Let P and C be the verified Put and Call quantities within a window:

- Daily volume PCR: that session's P / C.
- 20-session volume PCR: sum(P) / sum(C) over the corresponding window.
- 60-session volume PCR: sum(P) / sum(C) over the corresponding window.

The 20/60-session values must not be replaced by the arithmetic mean of daily PCRs. A zero Call denominator, insufficient history, or unavailable required data returns null. The interface shows missing data, not infinity or invented values.

| Source | Scope and current implementation |
| --- | --- |
| [OCC Volume Query](https://marketdata.theocc.com/volume-query) | Aggregate the source's contract-side quantities for one underlying; units are contract sides. Current 20/60 windows use the acquired activity-record rows, with scope explained in coverage. Missing dates are not filled with zero. This does not provide the same guarantee as a window validated against every expected trading session. |
| [Cboe Daily Market Statistics](https://www.cboe.com/markets/us/options/market-statistics/daily) | Preserve INDEX, TOTAL, EXCHANGE TRADED PRODUCTS, and EQUITY separately. Direct-source daily values use the officially published two-decimal PCR. Reconstructed historical EQUITY is identified as derived; see [CBOE_SOURCE_SCOPE.en.md](CBOE_SOURCE_SCOPE.en.md). Recompute 20/60 values from valid aggregated Put/Call volumes. Windows must contain 20/60 consecutive expected sessions and their volumes; any gap makes that window null. |

Cboe INDEX is not the ETF PCR of SPY/QQQ/DIA. Categories are not interchangeable, and personal grouping does not change source methodology. PCR does not represent the number of short sellers, bearish capital share, stock short-interest percentage, or the probability of future price direction.

History and refresh state for added tickers are saved independently. Missing data must not move other symbols back to an earlier date. Changing chart display length must not change the 20/60-window value for the same date.

### Historical levels and prior-year comparisons

The market-history area offers “No comparison,” “Historical percentile,” and “Prior-year period” modes. These are viewing preferences and do not modify the watchlist. Standard mode retains the daily, 20-session, and 60-session volume PCR curves. Annual comparison shows one measure at a time to avoid six overlapping curves.

| ID | Verifiable rule |
| --- | --- |
| HC-001 | First resolve an actual recorded date on or before the selected end date. Compare daily only with daily, 20-session only with 20-session, and 60-session only with 60-session. Do not pool samples across symbols, categories, or sources. |
| HC-002 | Each measure independently selects up to the latest 252 finite valid observations before the actual recorded date, excluding the current and future observations. Chart display length does not change percentile samples. To support this, Cboe loads all saved history before the frontend trims the visible range. |
| HC-003 | Use the midrank percentile `(count below current value + 0.5 × count equal to current value) / n`. Show the historical median and actual sample size `n / 252` alongside it. Explicitly identify fewer than 252 observations. With n=0 or a missing current value, leave the percentile blank. |
| HC-004 | Annual curves use the selected date's calendar year and match the same month and day in the preceding year exactly. Preserve original data dates for tooltips. Non-trading dates, missing observations, and February 29 without a counterpart remain blank; do not fill with zero or interpolate. |
| HC-005 | The annual-summary target is the actual recorded date minus one year, with February 29 clamped to February 28. The summary may use the latest observation within the preceding 7 calendar days, showing both target and actual comparison dates. With no record, leave values blank. This fallback must not fill annual curves. |
| HC-006 | The prior-year difference is current PCR minus prior-year PCR, expressed as a ratio-point difference, not a percentage return. Show comparable-date counts and available coverage; limited samples must not imply complete multi-year history. |

Historical percentiles describe relative activity. A 99.6% percentile does not mean that 99.6% of capital is bearish or that a prediction has a 99.6% success rate. Year comparisons describe historical differences and do not establish seasonal causality or a trading advantage.

### Activity dates and check times

| Field or concept | Meaning |
| --- | --- |
| requestedDate / requestedEnd | The date requested by the user; source publication is not guaranteed. |
| asof / actualEnd / activity date | The date described by verified data. Historical charts extend only to the last observation actually obtained. |
| checkedAt / retrieval time | When the system checked or acquired data. This is not the trading session and does not prove the underlying activity just occurred. |
| source / sourceUrl | The original publisher and a verifiable source URL. |
| completedSession | The latest completed session according to New York time and the trading calendar. |
| pending_source | The market has closed, but the source has not returned the corresponding full-day data. No fixed publication time is promised. |
| market_open | During the session, full-day PCR still ends on a published date and must not be described as today's intraday reading. |

After a refresh failure, retain the last verified data and identify the failure. Do not present a changed check time as an updated source activity date. Cboe history GET reads seed/cache/memory only. Each manual refresh batch checks at most 15 missing dates, explicitly reporting remaining gaps rather than looping through the entire history in one click.

### OI snapshots

OI PCR is open Put contracts / open Call contracts and is displayed separately from volume PCR. Existing OI is a one-time cache; quoteTimestamp, fetchedAt, and actual settlement date are different concepts. When the actual OI settlement date is undisclosed, retain it as unknown rather than inferring it from quote time.

The volume-refresh button does not update OI. New tickers without a trustworthy OI source return null. When a historical date is selected, the latest OI snapshot must not be presented as that day's historical OI. Stock short interest and futures positioning cannot be inferred from this snapshot.

Color meanings are labeled separately for each chart. In trend charts, light blue is daily volume PCR, dark blue is 20-session PCR, and orange is 60-session PCR. In comparison bars, blue is volume PCR for the selected window and gray is an independent OI snapshot. For added symbols such as SNDK, a missing gray bar means “not obtained,” not zero open interest. The two PCR measures cannot be subtracted to calculate newly added short positions.

## 6. Local moomoo backend and confidentiality boundaries

The official moomoo documentation separates “get watchlist groups” and “get securities in a group” into two endpoints. This specification draws on that group/member distinction. This product currently maintains its own database watchlists and has not implemented moomoo watchlist synchronization. See [Get Groups From Watchlist](https://openapi.moomoo.com/moomoo-api-doc/en/quote/get-user-security-group.html) and [Get The Watchlist](https://openapi.moomoo.com/moomoo-api-doc/en/quote/get-user-security.html).

The local chain is: browser → loopback-bound Node preview backend → fixed CLI executable → loopback moomoo market-data service. The cloud Worker does not include this local process-execution chain.

| ID | Requirement and current limit |
| --- | --- |
| MM-001 | The browser may invoke only fixed GET market-data endpoints: status, quotes, kline, expirations, and option-chain. |
| MM-002 | The CLI allowlist contains only subscribe, get-basic-qot, get-kline, get-option-expiration-date, and get-option-chain. Market-data subscriptions are used only to obtain data, not to expose arbitrary CLI execution. |
| MM-003 | Child processes use argument arrays and shell:false. Users cannot supply commands, arbitrary flags, external hosts, or credentials. The market-data host accepts loopback only. |
| MM-004 | At most 20 U.S. symbols per request, 1000 daily K-line bars, and one calendar month of expirations per option-chain request. Such a chain is not an all-expiry PCR or full-market OI dataset. |
| MM-005 | Retain provider market timestamps separately from checkedAt. Connectivity, successful subscription, or returned data does not automatically verify real-time market-data entitlement. |
| MM-006 | The local backend reads AppKey from an environment variable or Windows DPAPI-encrypted storage; the environment variable can override local storage. Configuration-script input is not echoed. The DPAPI file is outside the project and Dropbox and is bound to the current Windows user. A different computer or user requires separate configuration. Credentials must not enter browsers, URLs, source code, database-configuration documents, Git commits, or release archives; errors must be redacted. |
| MM-007 | Local databases, account information, position screenshots, private market-data responses, and credential files are not public source or public seed data. Tests use fictional identities and temporary databases. |
| MM-008 | Do not expose account, position, order, trading-unlock, placement, modification, or cancellation commands. |

Localhost in the cloud points to the cloud runtime and cannot be used to access the user's computer. If the computer is off, local preview is stopped, or moomoo is stopped, this local market-data chain is unavailable. Cloud public PCR and cloud D1 watchlists depend on their cloud services and are assessed independently of whether the personal computer is powered on.

A controlled cloud bridge, user-initiated upload of redacted snapshots, and other remote-synchronization approaches are possible later options. No approach has been selected or implemented, and they are not included in this iteration's completed capabilities.

## 7. Acceptance scenarios and success criteria

The page order in this iteration is “market reference strip → market PCR → personal-symbol PCR → source explanations.” PCR is the primary task. Quotes and commentary supply supporting facts and do not automatically generate entries, stop-loss decisions, or price-direction probabilities.

- The market selector initially recommends four Cboe aggregates and three OCC ETF references, SPY, QQQ, and DIA. Every recommendation is removable; supported Cboe categories and valid OCC stocks/ETFs can be added. The shared history chart retains each entry's source, dates, and missing values. ETF PCR must not be labeled as direct index-option PCR.
- The market list and original personal list are stored independently. Removing SPY, QQQ, or DIA from the personal list does not automatically remove a matching market entry. Users can remove market entries separately. Editing either list does not automatically add entries to the other.
- The quote strip shows the S&P 500, Nasdaq Composite, Dow, WTI crude futures, and COMEX gold futures. Nasdaq Composite quotes and the Nasdaq-100 referenced by QQQ are different indices and must be labeled distinctly.
- The quote strip can float while the page scrolls or be unpinned. On phones it can scroll horizontally within the strip without causing horizontal overflow of the entire page.
- Quote changes use Yahoo Finance's previous close. Retain each quote's own market time, contract name, and check time. Quotes may be delayed; after failures, retained prices are not labeled as new quotes.
- Search results support pointer and arrow-key highlighting. Enter directly adds the highlighted candidate or current typed ticker; the Add symbol button remains available. Escape and Tab can leave suggestions. IME confirmation and repeated keys do not cause unintended additions.
- The chart library reads the current database watchlist and has a refresh button. It does not hard-code seven symbols or refresh fixed archives.
- The market brief shows two paragraphs of loaded facts and a watchlist table and supports refresh. When local moomoo quotes are available, regular-session, after-market, and overnight prices are labeled separately; unknown times are not inferred. No chat model or news feed is connected.
- The original 2026-11-23 market brief remains a fixed-date archive and is no longer used as the current market landing page.

| Scenario | Verifiable result |
| --- | --- |
| AC-01 First visit | GET has not created a user record. The frontend performs only one initial PUT to migrate default items and old watchlists, obtaining revision 1. |
| AC-02 Removal and restoration | Any default or added ticker can be removed. An emptied list stays empty after reopening, and adding the same ticker again works. |
| AC-03 Group management | The webpage creates Chinese-named custom groups, assigns categories, and deletes default/custom groups. Deleting a group retains its symbols with null category, leaving no orphaned category. API group-name updates are tested separately in the backend; a current webpage rename control is not required. |
| AC-04 Persistent empty groups | groups=[] remains [] after reopening. Added symbols are unassigned by default and do not revive semi/etf/other. |
| AC-05 Identity isolation | Users A/B save and read their own items/groups. Service access without user identity returns 401. Forged owner fields in body/query are rejected. |
| AC-06 Concurrent saves | Of two real concurrent database writes with the same revision, only one succeeds. The other returns 409 with the full current configuration, preserving the winning write. |
| AC-07 Validation boundaries | Reject 31 unique symbols, 31 groups, invalid tickers, duplicate group names/IDs, orphaned categories, requests over 8192 bytes, and non-JSON requests. Saved configuration remains unchanged. |
| AC-08 PCR aggregation | Independently recompute daily/20/60 from raw P/C. Confirm that the pooled ratio differs from the mean daily ratio. Zero denominators and insufficient warm-up remain blank. |
| AC-09 Cboe gaps | Remove one expected session: every 20/60 window containing it becomes blank. Calculation resumes once that day is outside the window. Do not fill with zero or interpolate. |
| AC-10 Dates and failures | Cards for unpublished dates are blank, and history ends at actual records. Check failures preserve the last good data and do not substitute checkedAt for the activity date. |
| AC-11 OI distinction | Historical dates do not display the latest snapshot as historical OI. A new ticker without an OI source is blank. Refreshing volume does not change OI. |
| AC-12 Local persistence | SQLite items/groups survive stopping and reopening local preview. Local configuration is not presented as having been written to the cloud. |
| AC-13 moomoo limits | Tests cover allowlisting, parameter validation, loopback, timeout, permission failures, and credential redaction. No trading-command path exists. |
| AC-14 Cloud statements | The page and documentation do not claim the cloud is already connected to the user's computer or describe an unimplemented cloud bridge as complete. |
| AC-15 Empty market list | Every initial recommendation is removable. After saving items=[], reopening, date changes, source failures, and settings reloads do not restore the default seven entries. |
| AC-16 Market source identity | With both Cboe INDEX and OCC ticker INDEX present, selection values, requests, labels, source links, and daily/20/60 curves remain distinct. Missing OCC records are not replaced with Cboe values. |
| AC-17 Independent lists | Market-list additions, removals, clearing, and conflicts do not modify original personal items/groups. Personal-list changes do not modify the market list or its revision. |
| AC-18 Added OCC history | Daily values for valid tickers use Put/Call. The 20/60 values use source-window totals, not reciprocals or mean daily ratios. Missing data, zero denominators, and insufficient history remain blank; failures preserve existing good data. |
| AC-19 Enter to add | Enter immediately after typing a code, after arrow-key selection, or after pointer highlighting adds the correct ticker. IME confirmation, repeated keys, and stale candidates do not add unintended symbols. Neither language's placeholder fixes one ticker. |
| AC-20 Historical percentiles | Independently recompute midrank percentiles and medians. Current/future outliers do not enter historical samples. Changing display range does not change the same date's percentile. Missing values are excluded, and n is reported truthfully. |
| AC-21 Annual comparison | Verify regular sessions, market closures, leap days, limited early history, and empty data. Curves match exact calendar dates only. Summary fallback is limited to 7 days and shows the actual comparison date and coverage count. |
| AC-22 Showcase language | Body copy, buttons, navigation, image captions and alt text, dialog captions and close button, html lang, page title, and meta description all follow the selected Chinese or English language. |
| AC-23 Language preference | A valid lang parameter takes precedence. Without one, use a valid saved preference, otherwise Chinese. A reload after switching restores the selection; unavailable storage still allows valid URL selection and switching. Keep #preview when switching. |
| AC-24 Document language | Default README.md is English, README.zh-CN.md is the full Chinese version, and README.en.md remains a full English compatibility copy. Chinese showcase links open README.zh-CN.md/PRODUCT_SPEC.md; English links open README.md/PRODUCT_SPEC.en.md. Targets exist, documents switch languages, both English bodies stay synchronized, and showcase/application language defaults are unchanged. |
| AC-25 Demo and mobile | GIF/screenshots remain English while surrounding and dialog copy follows the selected language. At 320px there is no page-wide horizontal overflow; the language control remains visible and usable when entering #preview directly. |

Database behavior is verified by `scripts/test-watchlists.mjs`, `scripts/test-market-settings.mjs`, and `scripts/test-local-db.mjs`. PCR uses the corresponding backend/Cboe tests and independent raw-quantity calculations. The local market-data adapter is verified by `scripts/test-moomoo.mjs`. Interface acceptance must additionally exercise watchlists, groups, date changes, and failures in an actual browser. Do not label this iteration's capabilities as completed online before a successful deployment.

## 8. Known differences and later choices

- The current specification is based on the database items/groups contract and actual implementation. For startup and local credential configuration, see the [English README](../README.md) and the [moomoo backend guide](MOOMOO_BACKEND.en.md).
- Group renaming is currently supported only through complete API updates. A webpage rename control is an optional later feature, not a completed interface capability.
- Matching Cboe's consecutive-session gap guarantee for OCC would require changing activity-record window rules and validating history separately. The current implementation must not claim these guarantees are already unified.
- moomoo watchlist synchronization, dedicated quote views, long-term OI history, intraday full-market PCR, a cloud bridge, and cross-environment personal-data migration each require separate requirements and authorization. Their completion cannot be inferred from existing endpoints.
- There is currently no dealer Gamma/GEX, Gamma flip, or reliable calculation of net dealer positions. These cannot be derived directly from PCR or total OI. No chat model or news feed is connected.

## 9. Source structure and local operation

| Location | Responsibility |
| --- | --- |
| `web/` | Bilingual pages, charts, search, watchlists, and historical comparisons. `web/archive/` contains fixed-date archives. |
| `worker/` | OCC/Cboe data endpoints, market references, personal/market settings APIs, and source validation. Static assets are embedded at build time. |
| `scripts/` | Build, validation, local Node preview, SQLite adapter, read-only moomoo adapter, and verification scripts. |
| `drizzle/` | Versioned schema migrations and metadata. Published migrations must not be arbitrarily modified or replayed. |
| `data/` | Market-data seeds used by builds. Personal databases are not stored here. |
| `docs/` | This specification, data methodology, and moomoo backend documentation. |
| `site/` | Static bilingual GitHub Pages showcase, `locale.js` translations and language-specific document links, and English demo media. It does not run the PCR backend. |
| `AGENTS.md` | Development maintenance rules and paired Chinese/English documentation requirements. |

Local operation requires Node.js and Python 3. Build with `node scripts/build.mjs` and start with `node scripts/preview.mjs`; the default address is `http://127.0.0.1:8765/`. `PCR_DB_PATH`, `PCR_PREVIEW_PORT`, and `PCR_PYTHON` can specify the database, port, and Python executable respectively. Startup applies controlled migrations. Closing a webpage and stopping the backend are separate operations. The release ZIP uses `start.cmd` at its root; an existing local installation may also use its outer Chinese-named CMD launcher. Both start a local service, not a cloud service.

## 10. GitHub publication and public scope

The project is published in the personal repository https://github.com/Rexmiao/pcr-market-watch with its showcase at https://rexmiao.github.io/pcr-market-watch/. Public scope is limited to reviewed source, public-market snapshots and demonstration material. Local databases, DPAPI credentials, account information, private account or portfolio screenshots, runtime logs and browser profiles are excluded.

For subsequent GitHub operations, use the existing GitHub App/native connection first, limited to the selected personal repository `Rexmiao/pcr-market-watch`. Continue reads, writes, checks, and publication supported by existing permissions without restarting login. Do not initiate a GitHub CLI/OAuth authorization flow that includes organization access, access organizations, or request organization permissions. If a capability is missing, identify the specific unavailable repository operation rather than expanding authorization to organizations. These operating rules are also recorded in [AGENTS.md](../AGENTS.md).

Development materials suitable for publication include the README, this specification, installation/build instructions, source code, migrations, and tests without personal information. Check both ignore rules and actually tracked files: `.gitignore` does not automatically remove tracked content or commit history. Source code uses the repository’s MIT License. Third-party market data remains subject to its source rights and terms; webpage accessibility must not be taken to imply unrestricted redistribution. GitHub Pages is static hosting and cannot directly run this project's Node/moomoo/SQLite backend or Cloudflare Worker.

### Bilingual showcase and documentation entry points

The showcase entry point is `site/index.html`; `site/locale.js` manages both languages and documentation links. Its language preference is independent of the full PCR application's device preferences.

| ID | Requirement and current behavior |
| --- | --- |
| HP-001 | Switching covers visible copy, navigation and buttons, image captions/alt text, dialog content and close button, accessibility labels, html lang, page title, and meta description. |
| HP-002 | Valid `?lang=zh` or `?lang=en` takes precedence over a saved preference. Without a valid parameter, use a valid saved preference, otherwise default to Chinese. |
| HP-003 | Clicking the control saves the preference under `pcr-market-watch:site-language:v1` and updates the lang query parameter using history.replaceState, preserving other parameters and anchors such as #preview. If storage is unavailable, URL language selection and the control still work without preventing page access. |
| HP-004 | The repository defaults to English `README.md`; the full Chinese version is `README.zh-CN.md`, and `README.en.md` is a full English compatibility copy. Chinese showcase README/Spec entry points open `README.zh-CN.md`/`docs/PRODUCT_SPEC.md`; English opens `README.md`/`docs/PRODUCT_SPEC.en.md`. README and all four specification pairs offer reciprocal language links; keep both English README bodies synchronized. The English repository default does not change the showcase's Chinese default or application language preferences. |
| HP-005 | Demo GIF and screenshots remain English as requested. Their surrounding captions, alt text, and enlarged-dialog copy follow the selected language. Media records a version snapshot, not live market data. |
| HP-006 | The header stays reachable and anchor offsets follow its changing height. The language control works at 320px and after direct #preview entry. The showcase presents the product and download, without providing the running PCR application, database, or local moomoo service. |

These rules describe the showcase and documentation on `main`. The published v0.1.0 ZIP, tag, and checksum retain that release's contents. Later showcase or Spec updates do not mean the installer has also been updated; see the [Release Spec](RELEASE_SPEC.en.md).

## 11. External references and design influences

| Official reference | Use in this specification |
| --- | --- |
| [GitHub Spec Kit: spec-template.md](https://github.com/github/spec-kit/blob/main/templates/spec-template.md) | Prioritized user stories, independent testing, acceptance scenarios, functional requirements, and success criteria. No CLI or workflow dependency was introduced. |
| [moomoo: Get Groups From Watchlist](https://openapi.moomoo.com/moomoo-api-doc/en/quote/get-user-security-group.html) | Treat groups as separate objects and distinguish group metadata from group members. This product defines its own rules for removable default groups. |
| [moomoo: Get The Watchlist](https://openapi.moomoo.com/moomoo-api-doc/en/quote/get-user-security.html) | The concept of reading securities by group. Official API examples are not treated as completed brokerage-watchlist synchronization. |

Reference links are carried forward from the previous specification. Actual product behavior follows this project's source code and acceptance evidence; external examples are not evidence of implemented capabilities.
