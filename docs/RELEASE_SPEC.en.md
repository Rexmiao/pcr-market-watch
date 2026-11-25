# v0.1.0 Release and Installation Specification

[简体中文](RELEASE_SPEC.md) | **English**

## Deliverables

| Deliverable | Contents | Where it runs or appears |
| --- | --- | --- |
| GitHub source | `web/`, `worker/`, `db/`, `drizzle/`, `scripts/`, `data/`, `docs/`, and build configuration | Users install development dependencies and build it themselves |
| Windows ZIP | The source above, `dist/server/index.js`, `start.cmd`, and `start-local.mjs` | A local Windows computer with Node.js 22+ and Python 3 |
| README | English screenshots of the actual interface, an automatically playing GIF, features, installation instructions, and specification links | Repository homepage |
| GitHub Pages | `site/index.html` and local images | A project showcase linking to the release and source; it does not host the full backend |
| SHA256SUMS.txt | Checksum for the Windows ZIP | Release attachment |

The first public release tag is `v0.1.0`; it is separate from historical Sites release numbers. The source is a clean export of the current working version and does not include its previous Git history.

## Installation behavior

1. The user extracts the ZIP completely and double-clicks `start.cmd` in its root directory.
2. The launcher checks for Node.js and starts `start-local.mjs`. It reuses an existing compatible backend when one is available; otherwise, it starts `scripts/preview.mjs` from the current project directory.
3. Versioned migrations are applied through the SQLite adapter built on Python's standard library. The default database location is `../local-data/pcr.sqlite3`; `PCR_DB_PATH` can override it.
4. The backend listens only on `127.0.0.1:8765`. The console displays the address, which can be opened manually if automatic browser launch fails.
5. CMD does not close automatically. Closing the browser does not stop the backend; ending the backend process stops that instance of the service.
6. When no user database exists, the web interface initializes the recommended lists once according to the product specification. Subsequent visits read the database, and intentionally empty lists do not restore defaults.

Environment variables: `PCR_PYTHON` selects Python, `PCR_DB_PATH` selects the database, and `PCR_PREVIEW_PORT` selects an independent test port. The desktop moomoo interface is optional and is not required to start the core PCR functionality.

## Functional and calculation acceptance criteria

See [PRODUCT_SPEC.en.md](PRODUCT_SPEC.en.md) for detailed fields, interfaces, migrations, and acceptance scenarios. The main additions in this version are:

- The search field uses a generic bilingual hint. Enter adds a valid typed ticker immediately, or adds the highlighted candidate when suggestions are open. Chinese IME confirmation and held-key repeats do not cause duplicate additions.
- Historical percentiles are calculated separately for daily, 20-session, and 60-session PCR. Each uses up to 252 valid observations before the current actual data date, handles ties using the midrank method, and displays the actual sample count, `n`.
- Prior-year comparison shows only one selected measure at a time. Curves match exact calendar month and day, leaving missing observations blank. The summary can look back at most seven days and displays both the target date and actual comparison date.
- Changing the visible range does not change the percentile reference samples. Future observations and the current observation must not enter the reference distribution.
- Volume and OI retain separate source and date labels. Missing OI is not filled with zero or substituted with another symbol's value.

## Public export scope

The application source, schema migrations, public-market snapshots, and demonstration screenshots produced by the application may be exported. The release package excludes the actual personal-watchlist database, brokerage accounts or personal positions, AppKey, environment-variable files, DPAPI files, browser profiles, logs, and older deployment packages.

Demonstration screenshots come from an isolated, newly created database using the initial recommended symbols. Static screenshots use English; their own displayed data timestamps apply.

## Build and validation

```sh
npm ci
npm run build
npm test
node scripts/validate-artifact.mjs
```

Before packaging, check the file list and sensitive-content patterns, then inspect the final ZIP again. The ZIP contains built output. The source repository excludes build output and runtime state through `.gitignore`.

GitHub Actions `checks.yml` builds and tests under Node.js 22. `pages.yml` publishes only `site/`, using repository-read and Pages-deployment permissions. It does not read the local application database or moomoo credentials.

## Release verification

- The newly created repository should have `main`, README images, the GIF, and both detailed specifications.
- The release should include a version tag, the Windows ZIP, and a SHA-256 checksum file.
- GitHub Pages should return a successful status, image paths under `/pcr-market-watch/` should resolve, and the layout should not overflow horizontally at a mobile width of 320px.
- The maintainer's existing local website, personal database, and cloud-site audience remain separate.

Related methodology: [Cboe source coverage and EQUITY history](CBOE_SOURCE_SCOPE.en.md).
