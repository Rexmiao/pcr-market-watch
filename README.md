# PCR Market Watch

**English** | [简体中文](README.zh-CN.md)

Explore U.S. options activity through daily Put/Call Ratios, 20- and 60-session trends, historical percentiles, and prior-year comparisons.

[Project homepage](https://rexmiao.github.io/pcr-market-watch/) · [Download](https://github.com/Rexmiao/pcr-market-watch/releases/latest) · [Full product specification](docs/PRODUCT_SPEC.en.md)

![Animated walkthrough: historical percentile and prior-year comparison](site/assets/demo.gif)

![PCR Market Watch: market aggregates, source dates, and historical trends](site/assets/dashboard.png)

## Features

- **Market references:** Cboe INDEX, TOTAL, ETF/ETP, and EQUITY categories, plus stocks or ETFs you add. Every initial recommendation can be removed.
- **Personal watchlist:** Search tickers, press Enter to add, organize groups, and remove symbols. The list is stored in local SQLite, independently of market references.
- **Historical trends:** Daily, 20-session, and 60-session volume PCR, with a date selector and adjustable display range.
- **Historical context:** Percentiles, medians, and sample counts for each PCR measure. Prior-year comparison shows one selected measure at a time.
- **Supporting quotes:** Three major U.S. stock indices, crude oil, and gold, with source timestamps. The floating quote strip can be unpinned.
- **Optional moomoo integration:** A local, read-only market-data adapter. No trading or account operations are exposed.

![Historical comparison: percentiles, sample counts, and PCR trends](site/assets/history.png)

## Windows quick start

1. Install [Node.js 22 or newer](https://nodejs.org/en/download) and [Python 3](https://www.python.org/downloads/). You can select the option to add Python to PATH during installation.
2. Download the Windows ZIP from [Releases](https://github.com/Rexmiao/pcr-market-watch/releases/latest) and **extract it completely**.
3. Double-click `start.cmd`. Keep the CMD window open while using the application; minimizing it is fine.
4. Open **http://127.0.0.1:8765/**.

The Windows ZIP includes the built application. The first run creates the database and initial lists. It does not contain the author's personal database, credentials, or browser profile.

Closing the browser does not stop the backend. Closing the CMD window that owns the server stops that local server. Double-click `start.cmd` to start it again.

If Python is not on PATH, set `PCR_PYTHON` to its executable path. Set `PCR_DB_PATH` to choose a database location; the default is `local-data/pcr.sqlite3`, one directory above the project.

## Run from source

```sh
git clone https://github.com/Rexmiao/pcr-market-watch.git
cd pcr-market-watch
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8765/. Node.js and Python 3 are required. The development dependencies installed by `npm ci` support source builds and database migration development.

```sh
npm test
node scripts/validate-artifact.mjs
```

## Data and interpretation

**PCR = put quantity ÷ call quantity. It is not the proportion of investors who are short, a capital allocation ratio, or a probability of a price move.**

- The 20- and 60-session volume PCRs divide total put volume by total call volume over each window. They are not arithmetic averages of daily PCRs.
- Cboe and OCC have different coverage, publication schedules, and available history. Cboe TOTAL covers the products in its report; it is not an all-U.S.-exchange total.
- Older EQUITY observations are derived by subtracting INDEX and ETP put and call volumes separately from TOTAL, then calculating the ratio. The interface identifies these derived observations.
- OI is an independently dated open-interest snapshot and is not refreshed with volume. Symbols without a reliable OI source remain blank; missing data does not mean zero open interest.
- Historical percentiles use up to 252 valid observations before the selected data date, excluding the current and future observations. Actual sample counts are displayed when history is shorter.
- Prior-year curves match the same calendar month and day; missing observations remain blank. For the summary only, a closed-market date can use the latest record within the preceding seven calendar days. Both the target date and actual comparison date are shown.
- When a source has not published a new record, the application retains its last available observation and does not label it as today's data.

Public historical snapshots support display and calculation; their own data dates apply. Publishing the code does not change third-party data rights or terms. See [CBOE_SOURCE_SCOPE.en.md](docs/CBOE_SOURCE_SCOPE.en.md) and [PRODUCT_SPEC.en.md](docs/PRODUCT_SPEC.en.md) for source coverage and methodology.

## Project structure and specifications

| Path | Purpose |
| --- | --- |
| `web/` | Pages, charts, calendar, language switching, historical comparisons, and watchlist interactions |
| `worker/` | Web APIs and data-source adapters |
| `db/`, `drizzle/` | Configuration schemas and versioned migrations |
| `scripts/` | Build tools, local SQLite service, moomoo adapter, and checks |
| `data/` | Dated public-market snapshots |
| `docs/PRODUCT_SPEC.en.md` | User stories, requirements, APIs, algorithms, database constraints, and acceptance criteria |
| `docs/RELEASE_SPEC.en.md` | Release contents, installation behavior, and release verification |
| `site/` | GitHub Pages project showcase; it does not run the full backend |

The current release runs locally. Cloud D1 storage and identity configuration require a separate deployment. GitHub Pages cannot run the SQLite or desktop moomoo backend.

See [MOOMOO_BACKEND.en.md](docs/MOOMOO_BACKEND.en.md) for desktop setup, permissions, and read-only endpoints. Configure the AppKey locally; no key is distributed with the release. There is currently no persistent cloud-to-desktop bridge, AI chat, dealer GEX calculation, or order-entry feature.
