# Project maintenance rules / 项目维护规则

Keep implementation and specifications current in the same change. 用户要求：功能有改动时，同步更新相关 Spec，中英文版本一起维护。

## Documentation to update

| Change | Chinese documentation | English documentation |
| --- | --- | --- |
| Features, interactions, API/database contracts, historical comparisons, or homepage behavior | [Product Spec](docs/PRODUCT_SPEC.md) | [Product Spec](docs/PRODUCT_SPEC.en.md) |
| Source coverage, PCR calculations, dates, or missing-data rules | [Cboe source scope](docs/CBOE_SOURCE_SCOPE.md), plus Product Spec | [Cboe source scope](docs/CBOE_SOURCE_SCOPE.en.md), plus Product Spec |
| moomoo connection, allowed queries, provider permissions, or credential handling | [moomoo backend](docs/MOOMOO_BACKEND.md), plus Product Spec | [moomoo backend](docs/MOOMOO_BACKEND.en.md), plus Product Spec |
| Installation, packaging, deployment, release contents, or prerequisites | [Release Spec](docs/RELEASE_SPEC.md) | [Release Spec](docs/RELEASE_SPEC.en.md) |
| User-visible capabilities, setup, or public links | [README](README.zh-CN.md) and homepage translations | [Default README](README.md), [English compatibility copy](README.en.md), and homepage translations |

- Update affected documents before declaring a change complete. Unaffected technical rules do not need cosmetic rewrites.
- Keep matching Chinese/English requirement IDs, calculations, limitations, and acceptance criteria in sync. Preserve existing IDs and append new ones.
- Describe implemented, verified, locally running, and published states separately. Planned capabilities must stay labeled as planned.
- Maintain language-specific README/Spec links and reciprocal document-language links. The homepage's English recordings and screenshots may stay English; surrounding copy follows the selected language.
- Keep the repository's canonical `README.md` in English, the complete Chinese version in `README.zh-CN.md`, and the complete English compatibility copy in `README.en.md`. Update both English bodies together. Chinese links select `README.zh-CN.md`; English links select canonical `README.md`. This repository default does not change the showcase's Chinese default or application language preferences.
- Check relevant documentation links and acceptance criteria. For changed executable behavior, run checks that exercise that behavior; documentation-only changes do not require unrelated application tests.
- Record what was checked and any remaining limitation in the change description.

## Publication and privacy

- `main` documentation and the static GitHub Pages showcase may evolve after a release. Do not overwrite an existing release ZIP, tag, or checksum to make it appear current. Publish changed installable application behavior under a new version.
- Keep the static showcase distinct from the locally running PCR backend and database. The showcase does not connect directly to the maintainer's computer.
- Never publish personal databases, account/position information, credentials, private screenshots, runtime logs, or browser profiles.
- Use the existing GitHub App/native connection first for repository reads, writes, checks, and publication. Its selected-repository authorization is scoped to the personal `Rexmiao/pcr-market-watch` repository. Continue within existing authorization without restarting login.
- Do not start a GitHub CLI/OAuth login flow that includes organization access. Do not access organizations or request organization permissions for this project. If a needed operation is unavailable, identify that specific missing repository capability instead of expanding authorization to organizations.
