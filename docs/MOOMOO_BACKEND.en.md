# moomoo Backend Integration

[简体中文](MOOMOO_BACKEND.md) | **English**

The local Node.js backend calls the official `moomooapp-cli.exe` bundled with the desktop application. The webpage does not need access to the AppKey or a separate connection button.

## Available read-only capabilities

| Local HTTP API | Example parameters | Purpose |
| --- | --- | --- |
| `/api/providers/moomoo/status` | None | Configuration, CLI availability, last successful query time, and connection status |
| `/api/providers/moomoo/quotes` | `?symbols=AMD,NVDA` | Basic quotes and any pre-market, post-market, or overnight fields actually returned by the interface |
| `/api/providers/moomoo/kline` | `?symbol=AMD&count=60` | Recent daily candles; subscribes as needed, with a maximum of 1,000 candles |
| `/api/providers/moomoo/expirations` | `?symbol=AMD` | Option expiration dates |
| `/api/providers/moomoo/option-chain` | `?symbol=AMD&begin=2026-11-27&end=2026-11-27` | Option chains for a selected expiration range, limited to one month per request |

Responses include `provider`, `kind`, `checkedAt`, and `data`. `checkedAt` is the time this backend queried the provider. The actual quote time comes from original fields such as `update_time` or `update_timestamp`.

The `configured` field in `status` only indicates that configuration exists. A connection is marked successful only after the first successful query. Quote timeliness and field coverage depend on moomoo permissions and the specific interface. A working connection does not imply real-time access to every market or option. Static option-chain contract information is also not equivalent to an all-expirations PCR.

## Local setup

1. Keep the moomoo desktop application signed in. Allow external program access and enable its CLI interface.
2. The default local address is `http://127.0.0.1:22222`. If the desktop application specifies another port, set `OPENAPI_HOST_URL`. Only local loopback addresses are accepted.
3. On an already configured machine, use the local website launcher (`start.cmd` in the release ZIP, or `启动本地网站.cmd` in the existing local installation). To replace the key, run `node scripts/configure-moomoo.mjs` from the project directory and enter the new AppKey. Input is not echoed.
4. The key is encrypted with Windows DPAPI and saved in the `PcrMarketWatch` directory under the current user's LocalAppData, outside the project and Dropbox. The same Windows user can read it after a restart. Another computer or Windows user must configure it again. The backend environment variable `OPENAPI_HOST_APPKEY` can override this stored configuration.
5. Open the local endpoint `/api/providers/moomoo/quotes?symbols=AMD,NVDA` to verify quotes.

The backend calls only five CLI command categories: subscriptions, basic quotes, daily candles, option expiration dates, and option chains. It does not provide an arbitrary-command proxy. The AppKey is passed only through the child process environment, never through command-line arguments, webpage content, source code, or logs.

There is no account query, position query, order placement, order cancellation, or trading-unlock integration.

## Cloud boundaries

The hosted website stores user lists in cloud D1. The local website uses SQLite. These stores remain separate and do not synchronize automatically. A cloud Worker cannot directly access `127.0.0.1:22222` on the user's computer, so the cloud moomoo API returns `LOCAL_BACKEND_REQUIRED` instead of presenting unavailable live data as real.

A future cloud-to-desktop bridge could use a local collector that uploads only selected market-data snapshots, or a private tunnel restricted to read-only routes. This bridge has not been implemented. Do not expose the entire brokerage Host interface to the public internet. Once the desktop application is closed or the local computer is shut down, new quotes cannot continue to be retrieved from that desktop application.

## PCR methodology

Daily, 20-session, and 60-session volume PCR still comes from OCC / Cboe. `PCR = put contract volume / call contract volume`; multi-session windows divide the aggregated put volume by the aggregated call volume.

Open-interest PCR is a separate snapshot calculated from outstanding contracts. Neither measure represents the number of short sellers or the percentage of market capital held short.

The moomoo quote integration remains separate from historical PCR, so a partial-expiration option chain is not substituted for broader market statistics. See the [product specification](PRODUCT_SPEC.en.md) and [Cboe source scope](CBOE_SOURCE_SCOPE.en.md) for related definitions.
