# Miner evidence models

## Evidence v2

New collections attach a dated reliability query. Its fields were introspected from the hosted indexer. The query covers at most 32 miners, prioritizing settlement addresses before gateway listings. Events, ghost snapshots and proof leaders each have a limit of 100. The bounded lists do not establish the absence of other observations.

`evidence-v2 = 0.5 * settlement-v1 + 20*A + 15*G + 10*O + 5*P`.

These weights and smoothing counts are policy constants. They are not measured network parameters. All terms are in the range zero to one. Missing terms contribute no points. The score is null only when no settlement or reliability term has usable data. Existing snapshots without reliability fields retain settlement-v1.

### Acknowledgements: A

Use `minerReliabilitySeries` day buckets wholly inside the recorded `[from, to]` query window. Sum `forceOpenAcknowledged` as `ack` and `forceOpenExpired` as `expired`.

`A = ack / (ack + expired + 5)`. No outcomes means unknown. The router uses the unsmoothed observed ratio `ack / (ack + expired)` and can require a minimum outcome count. These are event outcomes, not matched request cohorts. The captured window stays dated as the snapshot ages. It is not relabelled as a live rolling window. A capture older than the scoring window earns no reliability points. Future captures earn no points.

### Ghost outcomes: G

From the same complete-day series, sum `ghostCompleted` as `completed`. Sum `ghostExpired + ghostIncorrect` as `failed`.

`windowGhost = completed / (completed + failed + 5)`.

The latest `minerGhostStatsSnapshots` row inside the query window supplies cumulative counters when they are all non-null. Define `cap = totalCompleted / (totalCompleted + totalExpired + totalIncorrect)` when that denominator is positive. Otherwise use cap one. `G = min(windowGhost, cap)`. No window outcomes means unknown even when cumulative counters exist.

Any observed expired or incorrect ghost outcome produces `failure-observed`. A complete-day completion without an observed failure produces `completion-observed`. Otherwise status is `unknown`. These labels do not claim registration or current serving capacity. A listed miner with no outcomes remains unknown. Ghost rows and reliability events stay visible as separate evidence; they are not added twice to the series score.

### Cumulative outcome guard: O

From `minerReliability`, let `settled = settledCount` and `adverse = timeoutCount + voidedCount + forceOpenExpiredCount + offerOpenFailedCount`.

`O = settled / (settled + adverse + 5) / (1 + fraudUpheld)`.

No settled or adverse outcomes means unknown. This is a cumulative evidence guard. It is not windowed uptime. Counters can overlap and do not form a session success rate. Upheld fraud reduces the term; pending disputes are not treated as proven fraud.

### Proof activity: P

The indexer query uses `pouiLeaderboard(since: from)`. For a returned miner with non-null `proofsCount`, `P = proofsCount / (proofsCount + 20)`. Missing leaders remain unknown, including an empty leaderboard. An explicit zero stays zero. The count covers activity since the cutoff through collection. It is not proof verification.

### History and routing

Recorder snapshots receive independent settlement-v1 rankings at their own observation times. Current rankings only pool channels when observed genesis hashes are non-null and equal. Channel IDs are deduplicated, with the current observation taking precedence. Partial samples retain the confidence cap. Missing genesis permits independent ranking but not pooling. Reliability continues to use indexer series because the recorder does not capture it.

Router v2 accepts `minReliability`, `minReliabilityOutcomes`, `minProofs`, `rejectGhostFailures` and `maxReliabilityAgeMs`. A requested threshold fails when the needed evidence is missing. Required reliability evidence defaults to a one-day freshness limit. All legacy settlement, listing, confidence and price checks still apply. Each candidate reports every refusal reason.

### Gaming and limits

Acknowledgements and completions can be manufactured. Repeated activity can saturate the smoothing terms. Cumulative guards can mix old behavior with newer behavior. A bounded page can hide failures. Counts do not prove distinct useful tasks. Missing registration data prevents a registered-but-not-serving verdict. The timeline reports observed failure signals instead. These scores are not FLOP FRCR and are never presented as protocol reputation.

## Settlement v1

This is an ordering of observed settlement history. It is not a probability of successful inference. It is not a reliability guarantee.

## Inputs and coverage

Use at most the newest page of settlements returned by the server. The configured page limit is 100. Report the observed page size and server total. A page is incomplete if it has more rows, has a nonzero offset or contains fewer rows than the reported total. These are sample scores, not lifetime scores.

The default window is seven days before the evaluation time. Include only timestamps inside that window and no later than the settlement observation time. Deduplicate by channel ID at validation time. Duplicate rows invalidate the snapshot. Exclude self-trades, equal agent and miner addresses and rows where `minerPaid + unusedEscrow + burned != escrow`. Integer arithmetic is exact. Excluded rows are counted in warnings.

The model slug and the settlement model hash are different identifiers. No slug-to-hash mapping has been established by these surfaces. Scores span models. Routing checks only the requested gateway model listing. It does not claim model-specific settlement experience.

## Formula

For each miner:

- `n`: included settlement count.
- `a`: distinct included agent count.
- `c = min(cap, n / (n + 20) * min(1, a / 5))`.
- `cap = 0.5` for an incomplete page, otherwise `1`.
- `q`: cooperative share among included settlements.
- `r = max(0, 1 - (now - latestSettlementAt) / windowMs)`.
- `score = 100 * c * (70*q + 30*r) / (70 + 30)`.

The constants are policy choices, not network measurements. Each term exposes its normalized weight, observed value and contribution. Weights must be nonnegative with a positive sum. The score is null when `n = 0`. A null score is shown as "no data", never as a measured zero.

Confidence is the evidence sufficiency heuristic `c`, not a statistical interval. Labels: none for no included observations, low below 0.5, medium from 0.5 to below 0.8 and high from 0.8. Sort by descending score, descending confidence then bytewise address. There is no random tie breaking.

## Fields deliberately outside the score

Unused escrow is a descriptive ratio of total unused escrow to total escrow. A large refund is not a failure. Noncooperative settlement share is shown but is not called fraud. Historical per-GFLOP prices use the lower median over rows with positive `aggregateGn`. They retain the source's raw-unit decimal strings. FLOP has 18 decimal places. Historical prices are not live quotes and are never used to pass a routing ceiling.

Gateway `devnet-nominal` listings affect discovery eligibility only. They do not affect score. Token prices cannot be converted to per-GFLOP prices from these records. Offers and the proof leaderboard are retained as raw observations. The recorded offer list and leaderboard are empty. Unknown nonempty row schemas are retained as objects but no fields from them are scored. Failed-ack, slash and timeout fields are not inferred. Offer timeouts are not a standalone ranking penalty.

## Router

`pickMiner(snapshot, { model, maxPricePerGflop, minConfidence, exclude, now })` rejects exclusions, absent model listings, expired listings (`now >= expires_at`), not-yet-effective listings, future observation timestamps, insufficient confidence and absent settlement evidence. The default confidence minimum is 0.2.

A supplied ceiling always fails with `live-price-unknown` for the recorded gateway schema. There is no live per-GFLOP price to compare. Without a ceiling a pick is a discovery recommendation. It is not authorization to spend. The response carries the nominal source warning and a null quote. Every candidate carries its rejection reasons.

## Sensitivity and gaming

`sensitivity` multiplies each settlement weight by 0.9 and 1.1 independently, renormalizes and reports every changed rank. The reliability weights stay fixed. A test uses conflicting recency and cooperation histories so the perturbation must change a rank. Tests also exercise the recorded snapshots.

- Count: miners can manufacture cheap sessions to inflate `n`. Self-trade exclusion does not detect collusion.
- Agent diversity: one person can create many agent addresses to inflate `a`.
- Cooperation: collaborators can settle cooperatively without useful work. Cooperative settlement is not proof of correct output.
- Recency: one recent small session can refresh the recency term.
- Price: a miner can post a nominal listing or subsidize past sessions. Neither earns score points or establishes a live quote.
- Missing observations: a bounded page can hide older failures. Coverage is explicit and confidence is capped.

Adding a lower-scoring miner does not change existing scores. No peer median or peer percentile enters the formula.
