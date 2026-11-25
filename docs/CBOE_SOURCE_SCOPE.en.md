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

The 20- and 60-session EQUITY PCRs divide total Equity Put volume by total Equity Call volume within each window. They do not average the already rounded daily PCRs. A window requires complete, consecutive trading sessions and valid quantities. A gap, insufficient history, or a zero total Call quantity leaves that window's PCR missing. The historical row fields `derived20` and `derived60` indicate whether the corresponding window used any derived data. Later windows may combine directly published quantities with reconstructed quantities whose sources are explicitly identified.

## API compatibility

- Snapshots add `snapshot.metrics.equity`, with the same fields as the other categories plus `derived`, `source`, `derivation`, and `method`.
- History adds `rows[].equity`, containing `daily`/`dailyText`, `p`/`c`, `p20`/`c20`/`r20`, `p60`/`c60`/`r60`, `derived`, `derived20`, `derived60`, `source`, and `method`.
- Older caches containing only the original three categories remain readable, and EQUITY can be reconstructed according to the rules above. A missing EQUITY category does not invalidate the original three categories.
- Source metadata and check times continue to distinguish the activity date from `checkedAt`. Reconstructing historical quantities does not replace the seed's original check time with a new retrieval time.

SPY, QQQ, and DIA PCRs are separate statistics for each ETF's options. They can serve as ETF references for the corresponding indices, but they do not replace the Cboe INDEX aggregate category and are not labeled as PCRs for SPX, NDX, or DJX index options themselves.

Related documentation: [Product specification](PRODUCT_SPEC.en.md) · [Release specification](RELEASE_SPEC.en.md).
