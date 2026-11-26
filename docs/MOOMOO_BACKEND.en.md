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

The backend refreshes AccessToken using actual provider expiry information. Providers can revoke grants and refresh credentials expire, so this is not a permanent-connection guarantee. Reconnect through official consent after expiry/revocation. Another computer or Windows user needs separate setup. `scripts/configure-moomoo-webapi.mjs` is a compatibility entry for the same OAuth connection flow. There is no manual or environment-token mode; tokens are never written to `.env`, source, or startup scripts. Additional permission capabilities are rejected; valid account-context selectors are not extra capabilities.

Credentials are used only in backend memory and provider authorization environments/headers. They never enter webpages, URLs, command lines, database configuration, logs, Git, or release archives. WebAPI uses only fixed official HTTPS hosts and two read-only market-data paths, never a caller-selected external address. Configured does not establish a successful connection or real-time entitlement.

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

T−1 does not establish an exact verified OI settlement date; keep an undisclosed date unknown. Local SQLite isolates caches by actual source. Desktop per-contract observations use option_monitor_oi; deduplicated contracts returned in WebAPI events use separate option_monitor_webapi_oi. Compare only the same source and contract/scope using actual observation dates. WebAPI underlying-summary OI history is not implemented. Missing history stays blank. Changes do not establish opens/closes, exercises, or investor counts. The homepage explicitly selects latest OI summaries or the saved Cboe snapshot, both separate from these per-contract observations.

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

Show gray bars only for existing `view.isLatest` (actualDate === data.asof), which identifies the latest volume view rather than OI date. Historical gray bars remain blank. Label the selected source/time separately; missing Moomoo does not silently fall back to Cboe.

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
