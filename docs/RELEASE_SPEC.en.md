# Release and Installation Specification (v0.2.0)

[简体中文](RELEASE_SPEC.md) | **English**

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
- A valid `?lang=zh` or `?lang=en` takes precedence over the browser's saved language. Otherwise, use `pcr-market-watch:site-language:v1`, defaulting to Chinese when neither choice is valid. Switching saves the preference and updates the query while preserving anchors such as `#preview`; switching still works when localStorage is unavailable.
- Chinese showcase README links open `README.zh-CN.md`; English opens default `README.md`. Product specifications still select `PRODUCT_SPEC.md`/`PRODUCT_SPEC.en.md`. Keep `README.en.md` as a full English compatibility copy with both English bodies synchronized. Documents offer reciprocal language links. The repository's English default does not change the showcase's Chinese default or application language preferences. The GIF and actual interface screenshots remain in English; their captions, alternative text, and dialog text follow the page language.

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
- Historical percentiles are calculated separately for daily, 20-session, and 60-session PCR. Each uses up to 252 valid observations before the current actual data date, handles ties using the midrank method, and displays the actual sample count, `n`.
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
- Verify `?lang=zh` / `?lang=en`, reload after saving, invalid parameters, and switching when localStorage is unavailable. Switching must preserve URL anchors; Chinese README opens README.zh-CN.md and English opens README.md, with product specifications still matching the selected language. The showcase's Chinese default and application language preferences remain independent of the repository default.
- Page titles, descriptions, body copy, buttons, accessibility text, and image dialogs must update in both languages. The layout must not overflow horizontally at 320px, and the language button must remain usable when visiting `#preview` directly.
- Documentation/Pages-only updates must not replace the `v0.1.0` tag, ZIP, or checksum file. When release behavior changes, verify a new version's tag and attachments.
- The maintainer's existing local website, personal database, and cloud-site audience remain separate.

Related methodology: [Cboe source coverage and EQUITY history](CBOE_SOURCE_SCOPE.en.md).


## v0.2.0 options-monitor deliverables

This iteration adds the options activity panel, auto/desktop/webapi selection, source-isolated caches/OI observations, browser screening, and visible-page refresh. Desktop scans one symbol/expiration, at most 20 nearby strikes/40 contracts. Contract fields use get-basic-qot in at most two batches of 20; full snapshots stay independent. Prints cover three contracts with 200 each. Optional WebAPI supplies provider underlying summaries and up to 300 unusual events, requiring an independent AccessToken. See the [Product Spec](PRODUCT_SPEC.en.md) and [moomoo backend guide](MOOMOO_BACKEND.en.md) for rules and acceptance criteria.

Verify source/build completion, tests, local installation, provider connectivity, and publication separately. Query desktop Host directly or verify independent WebAPI token/permissions; controlled tests are not live provider responses. WebAPI does not need Desktop but the local computer/Node backend must remain running. Always-on hosting needs separate deployment and a server secret. Existing Sites cloud version 12 is not automatically upgraded by a new local package or GitHub showcase. GitHub Pages remains the introduction/download site.

Changed installation behavior uses a new `v0.2.0` tag, Windows ZIP, and checksum, preserving existing `v0.1.0` tags and attachments. Preserve the personal database and DPAPI configuration outside the project during upgrades. Apply only new versioned migrations; do not replay or rewrite old migrations or restore personal lists to defaults.

Additional verification covers real prints versus interval increments, scoped PCR and missing values, unavailable/permission/partial failures, unknown OI settlement dates, first OI observations and cross-date persistence, refresh cooldown and hidden-page pause, unchanged watchlists/revisions, and safe fallback when unrelated services occupy the default port. Public archives must also exclude new monitor caches, per-contract OI observations, and private provider responses.


Additional WebAPI checks cover official OAuth 2.1 PKCE with quote:read only, local callback, a separate DPAPI authorization bundle, refresh from actual expiry information, and reconnection after revocation. Accept valid accid context selectors while rejecting write, trade, and unknown permission capabilities. Save normalized quote:read without outputting actual selectors. Omitted initial scope inherits the bound request only; explicit empty/null scope is rejected. No manual/environment-token mode is provided, and tokens are never persisted to .env. Verify rejection of desktop AppKey as Bearer, redacted failures, isolated provider caches without error failover, truncation notices, and expiry filters that do not alter summary PCR. Add a separate WebAPI per-contract OI table through a new migration without rewriting applied migrations; underlying-summary OI history is not implemented. Exclude authorization bundles, tokens, and private responses from archives.


On 2026-11-25, desktop monitoring returned quotes for 40 selected contracts and saved cache/OI observations. Missing fields and print timeouts verified partial availability only; PCR remains blank. Full snapshots still timed out. WebAPI completed its callback but failed authorization, saving no credentials. Complete prints, real-time entitlement, and cloud quotes remain unverified.
