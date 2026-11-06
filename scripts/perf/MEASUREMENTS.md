# Recorded mobile performance

These are local lab observations, not deployment claims. Full per-run values and capture times are in [measurements.json](./measurements.json).

- Source: http://127.0.0.1:3810.
- Before: 2026-11-06T06:15:35.122Z to 2026-11-06T06:28:14.833Z, checkout b421a4a0db776b7f7f0409d3c0afe25a4c611c96.
- After: 2026-11-06T07:54:45.155Z to 2026-11-06T08:07:53.071Z, checkout b70cf63429733f89fa3a1d481ea74611e818f121.
- Lighthouse: 13.6.0. Mobile simulated throttling, cold browser cache and a warm production server. Three runs per route in each set. Both sets used the same Chrome executable on a shared host.
- Chrome launcher: 1.2.3 in the preinstalled baseline helper and 1.2.2 in the pinned project runner.
- Coverage: before 34 routes and 102 audits; after 37 routes and 111 audits. New routes have no baseline observation.
- Budget: median performance at least 90 and median CLS at most 0.05. 33 routes pass both budgets in the after set.

JS columns sum uncompressed initial script files in the Next build output, including shared chunks and legacy polyfills. Request columns are browser request-count medians. CLS is unitless.

| Route        | Performance before | Performance after |            CLS before |             CLS after | JS bytes before | JS bytes after | Requests before | Requests after |
| ------------ | -----------------: | ----------------: | --------------------: | --------------------: | --------------: | -------------: | --------------: | -------------: |
| /            |                 71 |                94 |                     0 |  0.000212194293921812 |          807741 |         809007 |              33 |             18 |
| /about       |                 98 |                99 |                     0 |                     0 |          776399 |         777024 |              36 |             17 |
| /provenance  |                 88 |                83 |                     0 |                     0 |          780172 |         780797 |              38 |             19 |
| /scoreboard  |                100 |                97 |                     0 |                     0 |          828246 |         828871 |              38 |             19 |
| /harness     |                 96 |                95 |                     0 |                     0 |          797291 |         797916 |              36 |             17 |
| /verify      |                100 |                99 |                     0 |                     0 |          832495 |         833121 |              36 |             17 |
| /spendguard  |                100 |                99 |                     0 |                     0 |          824885 |         825511 |              37 |             18 |
| /x402        |                 97 |                98 |                     0 |                     0 |          809229 |         809854 |              39 |             18 |
| /kestra      |                 94 |                99 |                     0 |                     0 |          787581 |         788206 |              35 |             16 |
| /challenger  |                 80 |                94 |                     0 |                     0 |          842357 |         842981 |              36 |             17 |
| /history     |                 93 |                96 |                     0 |                     0 |          778858 |         779483 |              38 |             17 |
| /explorer    |                 93 |                99 |                     0 |                     0 |          788640 |         789265 |              36 |             17 |
| /spec        |                 90 |                87 |                     0 |                     0 |          781307 |         781932 |              36 |             17 |
| /contracts   |                 89 |                97 |                     0 |                     0 |          782893 |         783518 |              38 |             17 |
| /indexer     |                 97 |                99 |                     0 |                     0 |          779254 |         779879 |              36 |             16 |
| /sdk         |                 82 |                97 |                     0 |                     0 |          779471 |         780096 |              36 |             17 |
| /console     |                 90 |                96 |                     0 |                     0 |          983641 |         984266 |              36 |             17 |
| /start       |                 96 |                95 |                     0 |                     0 |          776821 |         777446 |              36 |             17 |
| /doctor      |                 98 |                99 |                     0 |                     0 |          775464 |         776089 |              36 |             17 |
| /tclk        |                 93 |                93 |                     0 |                     0 |          847131 |         847756 |              37 |             18 |
| /did         |                 99 |                98 |                     0 |                     0 |          854426 |         855051 |              36 |             17 |
| /models      |                 94 |                92 |                     0 |                     0 |          781129 |         781754 |              36 |             17 |
| /sessions    |                 98 |                94 |                     0 |                     0 |          795598 |         796223 |              36 |             17 |
| /finality    |                 96 |                96 | 0.0009932915823399815 | 0.0009932915823399815 |          796450 |         797075 |              35 |             16 |
| /upgrades    |                 96 |                92 |                     0 |                     0 |          776783 |         777408 |              37 |             17 |
| /status      |       not measured |                90 |          not measured |                     0 |    not measured |         785422 |    not measured |             17 |
| /community   |       not measured |                92 |          not measured |                     0 |    not measured |         786364 |    not measured |             16 |
| /economics   |                 95 |                98 |                     0 |                     0 |          785997 |         786622 |              36 |             16 |
| /metering    |                 96 |                96 |                     0 |                     0 |          789287 |         789912 |              35 |             17 |
| /proofs      |                 95 |                96 |                     0 |                     0 |          786798 |         787423 |              36 |             17 |
| /invariants  |                 92 |                97 |                     0 |                     0 |          783120 |         783745 |              35 |             16 |
| /yellowpaper |                 89 |                89 |                     0 |                     0 |          780586 |         781211 |              36 |             17 |
| /knowledge   |                 99 |                96 |                     0 |                     0 |          787967 |         788592 |              36 |             16 |
| /export      |       not measured |                95 |          not measured |                     0 |    not measured |         780612 |    not measured |             16 |
| /staking     |                 98 |                89 |                     0 |                     0 |          786277 |         786902 |              36 |             17 |
| /watch       |                 99 |                93 |                     0 |                     0 |          889589 |         890214 |              37 |             18 |
| /swaps       |                 99 |                93 |                     0 |                     0 |          798241 |         798866 |              36 |             17 |

## Changes measured

Shared links no longer prefetch every visible destination. The closed search palette does not mount its ranked motion links. Initial reading reveals preserve server-rendered headings. Home entrance text stays visible from the first paint. The expanded recorded claim matrix uses labelled pages of at most 64 cells and measures layout when its order or page changes. Every recorded claim remains accessible.

## Remaining budget breaches

- /provenance: performance 83, CLS 0, LCP 1054.6119 ms and total blocking time 702 ms.
- /spec: performance 87, CLS 0, LCP 1357.9308 ms and total blocking time 506.03459999999995 ms.
- /yellowpaper: performance 89, CLS 0, LCP 2705.0993 ms and total blocking time 188 ms.
- /staking: performance 89, CLS 0, LCP 1057.2263 ms and total blocking time 439.5 ms.

## What this does not verify

This does not verify deployed performance or every individual run. The shared host had other work running. These measurements do not isolate each change from host load or changing public data. The sitemap does not include every page in the application. Build bytes exclude inline hydration data and chunks loaded only after interaction. Raw Lighthouse reports and browser evidence are retained with the c26-perf build handoff.
