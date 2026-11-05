# Settlement evidence model v1

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

`sensitivity` multiplies each weight by 0.9 and 1.1 independently, renormalizes and reports every changed rank. A test uses conflicting recency and cooperation histories so the perturbation must change a rank. Tests also exercise the recorded snapshots.

- Count: miners can manufacture cheap sessions to inflate `n`. Self-trade exclusion does not detect collusion.
- Agent diversity: one person can create many agent addresses to inflate `a`.
- Cooperation: collaborators can settle cooperatively without useful work. Cooperative settlement is not proof of correct output.
- Recency: one recent small session can refresh the recency term.
- Price: a miner can post a nominal listing or subsidize past sessions. Neither earns score points or establishes a live quote.
- Missing observations: a bounded page can hide older failures. Coverage is explicit and confidence is capped.

Adding a lower-scoring miner does not change existing scores. No peer median or peer percentile enters the formula.
