# Recorded mobile performance

These are local lab observations, not deployment claims. Full per-run values and capture times are in [measurements.json](./measurements.json).

- Source: http://127.0.0.1:3810.
- Before: 2026-11-06T06:15:35.122Z to 2026-11-06T06:28:14.833Z, checkout b421a4a0db776b7f7f0409d3c0afe25a4c611c96.
- After: 2026-11-06T06:58:39.476Z to 2026-11-06T07:11:22.328Z, checkout 55adb538b9bd4886679a95b95b97617b2621c2cb.
- Lighthouse: 13.6.0. Mobile simulated throttling, cold browser cache and a warm production server. Three runs per route in each set. Both sets used the same Chrome executable on a shared host.
- Chrome launcher: 1.2.3 in the preinstalled baseline helper and 1.2.2 in the pinned project runner.
- Coverage: 34 sitemap routes and 102 audits in each set.
- Budget: median performance at least 90 and median CLS at most 0.05. 24 routes pass both budgets in the after set.

JS columns sum uncompressed initial script files in the Next build output, including shared chunks and legacy polyfills. Request columns are browser request-count medians. CLS is unitless.

| Route        | Performance before | Performance after |            CLS before |             CLS after | JS bytes before | JS bytes after | Requests before | Requests after |
| ------------ | -----------------: | ----------------: | --------------------: | --------------------: | --------------: | -------------: | --------------: | -------------: |
| /            |                 71 |                87 |                     0 |  0.000212194293921812 |          807741 |         808538 |              33 |             18 |
| /about       |                 98 |                97 |                     0 |                     0 |          776399 |         776555 |              36 |             17 |
| /provenance  |                 88 |                78 |                     0 |                     0 |          780172 |         780328 |              38 |             19 |
| /scoreboard  |                100 |                83 |                     0 |                     0 |          828246 |         828402 |              38 |             19 |
| /harness     |                 96 |                94 |                     0 |                     0 |          797291 |         797447 |              36 |             17 |
| /verify      |                100 |                98 |                     0 |                     0 |          832495 |         832652 |              36 |             17 |
| /spendguard  |                100 |                99 |                     0 |                     0 |          824885 |         825042 |              37 |             18 |
| /x402        |                 97 |                91 |                     0 |                     0 |          809229 |         809385 |              39 |             18 |
| /kestra      |                 94 |                90 |                     0 |                     0 |          787581 |         787737 |              35 |             16 |
| /challenger  |                 80 |                89 |                     0 |                     0 |          842357 |         842512 |              36 |             17 |
| /history     |                 93 |                93 |                     0 |                     0 |          778858 |         779014 |              38 |             17 |
| /explorer    |                 93 |                92 |                     0 |                     0 |          788640 |         788796 |              36 |             17 |
| /spec        |                 90 |                88 |                     0 |                     0 |          781307 |         781463 |              36 |             17 |
| /contracts   |                 89 |                91 |                     0 |                     0 |          782893 |         783049 |              38 |             17 |
| /indexer     |                 97 |                96 |                     0 |                     0 |          779254 |         779410 |              36 |             16 |
| /sdk         |                 82 |                93 |                     0 |                     0 |          779471 |         779627 |              36 |             17 |
| /console     |                 90 |                94 |                     0 |                     0 |          983641 |         983797 |              36 |             17 |
| /start       |                 96 |                99 |                     0 |                     0 |          776821 |         776977 |              36 |             17 |
| /doctor      |                 98 |                93 |                     0 |                     0 |          775464 |         775620 |              36 |             17 |
| /tclk        |                 93 |                94 |                     0 |                     0 |          847131 |         847287 |              37 |             18 |
| /did         |                 99 |                93 |                     0 |                     0 |          854426 |         854582 |              36 |             17 |
| /models      |                 94 |                84 |                     0 |                     0 |          781129 |         781285 |              36 |             16 |
| /sessions    |                 98 |                89 |                     0 |                     0 |          795598 |         795754 |              36 |             17 |
| /finality    |                 96 |                81 | 0.0009932915823399815 | 0.0009932915823399815 |          796450 |         796606 |              35 |             16 |
| /upgrades    |                 96 |                87 |                     0 |                     0 |          776783 |         776939 |              37 |             17 |
| /economics   |                 95 |                91 |                     0 |                     0 |          785997 |         786153 |              36 |             16 |
| /metering    |                 96 |                94 |                     0 |                     0 |          789287 |         789443 |              35 |             16 |
| /proofs      |                 95 |                95 |                     0 |                     0 |          786798 |         786954 |              36 |             17 |
| /invariants  |                 92 |                97 |                     0 |                     0 |          783120 |         783276 |              35 |             16 |
| /yellowpaper |                 89 |                91 |                     0 |                     0 |          780586 |         780742 |              36 |             17 |
| /knowledge   |                 99 |                93 |                     0 |                     0 |          787967 |         788123 |              36 |             16 |
| /staking     |                 98 |                99 |                     0 |                     0 |          786277 |         786433 |              36 |             17 |
| /watch       |                 99 |                89 |                     0 |                     0 |          889589 |         889745 |              37 |             18 |
| /swaps       |                 99 |                98 |                     0 |                     0 |          798241 |         798397 |              36 |             17 |

## Changes measured

Shared links no longer prefetch every visible destination. The closed search palette does not mount its ranked motion links. Initial reading reveals preserve server-rendered headings. Home entrance text stays visible from the first paint. The expanded recorded claim matrix uses labelled pages of at most 64 cells and measures layout when its order or page changes. Every recorded claim remains accessible.

## Remaining budget breaches

- /: performance 87, CLS 0.000212194293921812, LCP 1206.7492000000002 ms and total blocking time 509.5 ms.
- /provenance: performance 78, CLS 0, LCP 1057.2441 ms and total blocking time 1021.0000000000005 ms.
- /scoreboard: performance 83, CLS 0, LCP 1207.5028000000002 ms and total blocking time 661 ms.
- /challenger: performance 89, CLS 0, LCP 1261.7402 ms and total blocking time 163 ms.
- /spec: performance 88, CLS 0, LCP 1360.171 ms and total blocking time 470.9145000000001 ms.
- /models: performance 84, CLS 0, LCP 1056.087 ms and total blocking time 619 ms.
- /sessions: performance 89, CLS 0, LCP 1211.6112 ms and total blocking time 452 ms.
- /finality: performance 81, CLS 0.0009932915823399815, LCP 1060.0484 ms and total blocking time 792 ms.
- /upgrades: performance 87, CLS 0, LCP 1808.808 ms and total blocking time 445.09599999999955 ms.
- /watch: performance 89, CLS 0, LCP 1056.0589 ms and total blocking time 445.5 ms.

## What this does not verify

This does not verify deployed performance or every individual run. The shared host had other work running. These measurements do not isolate each change from host load or changing public data. The sitemap does not include every page in the application. Build bytes exclude inline hydration data and chunks loaded only after interaction. Raw Lighthouse reports and browser evidence are retained with the c26-perf build handoff.
