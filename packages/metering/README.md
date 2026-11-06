# Metering

How is effective FLOP counted and when does a miner's calibration expire? Metering converts declared reference work into exact `G_n`, models the pinned benchmark and lease rules and checks the fields exposed by the public devnet explorer. It keeps an indexed `Active` label separate from proof of a live lease.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/metering build
node packages/metering/dist/cli.js work --components 600000000,600000000 --json
```

The declared example produces `G_n = 1` with `200000000` reference FLOP left below the accounting unit. These are calculator inputs and outputs, not measured inference.

## Commands

```sh
node packages/metering/dist/cli.js observe
node packages/metering/dist/cli.js observe --live --json
node packages/metering/dist/cli.js phase --accepted 1000 --at 605800
node packages/metering/dist/cli.js burst --cap 213 --blocks 600 --jobs 64 --work 64000 --tier SOFT
node packages/metering/dist/cli.js renew --at 1200 --trigger 1100 --cap 200 --next-cap 180 --empirical 213 --next-empirical 213 --jobs 8 --work 10000
node packages/metering/dist/cli.js rules
```

The suite entry is `flop metering`. After a workspace build you can run `node packages/cli/dist/cli.js metering --help`. The package binary is `flop-metering`.

`observe` replays a dated recording. `--live` performs bounded read-only requests against the shared MCP client and the explorer miner endpoint. Each source retains its own receipt time. Responses are not an atomic chain snapshot. JSON is the output format. Invalid input or unavailable source data exits with code 2. Unknown evidence remains `UNOBSERVABLE`.

## Exact accounting, with a declared workload

The source pin is [yellowpaper 2a2cc821](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md). Full excerpts, raw parameter blocks and their capture times are in `fixtures/`. Quotations shown by the library normalize dash typography only.

Section 4 states: "Work **MUST** be accounted in versioned reference-work units `F_eff`, with `G_n = floor(F_eff / 10⁹)`." It also states that metering is "not derived from bare `2·P·N`."

Declare non-overlapping reference-work components from your chosen meter profile. The library sums them as integers and floors once. For example, supply separately accounted prompt, generation, attention and embedding terms if your profile separates them. Do not count a term twice. The calculator does not infer those terms from a model name, token count or GPU label. The public paper does not publish the complete executable primitive needed for that conversion. It says the primitive is `hp_poui::flop_meter` with a Python mirror.

R4.4 says: "Implementations **MUST** floor once at `F_eff / 10⁹`, reject a value outside the destination width, and use checked aggregation". `--bits 64` checks the direct rail. The default width is 128 for a session work value. This is a single-work calculator, not a session-leaf aggregator. Cache reuse does not reduce the billed prompt term in wire profile v1. Physical operations, energy and latency are separate measurements.

### Decay weights rewards, not settled work

The pinned `gn_decay_factor_ppb` definition says the absent-key default is "1.0, i.e. NO decay" and a smaller factor weights a proof by "gn x factor^min(blocks since period start, 100), floored once."

```text
weighted_G_n = floor(G_n * factor_ppb^e / 1000000000^e)
e = min(blocks_since_period_start, 100)
```

Use `work --factor-ppb 990000000 --blocks 100` for a declared alternative. Integer exponentiation preserves the single final floor. The default is a quoted catalog value. The tool has not read the deployed storage key.

## Calibration model

Section 7 says: "The fixed three-phase Dyno is removed." The model therefore uses benchmark entry and renewable leases. It does not resurrect the legacy three-phase timeline.

The pinned parameter definitions provide:

| Parameter | Quoted default | Role |
| --- | ---: | --- |
| `calibration_min_verified_jobs` | 64 jobs | Initial independently verified burst |
| `calibration_min_burst_blocks` | 600 blocks | Minimum burst duration |
| `calibration_min_utilization_ppm` | 500000 ppm | Work coverage factor |
| `calibration_provisional_discount_ppm` | 900000 ppm | HARD inventory ceiling multiplier |
| `calibration_lease_blocks` | 604800 blocks | Cap lifetime |
| `calibration_renewal_min_verified_jobs` | 8 jobs | Fresh renewal credentials |
| `calibration_renewal_max_age_blocks` | 600 blocks | Maximum renewal trigger age |
| `calibration_min_recalibration_interval_blocks` | 600 blocks | Initial acceptance cooldown |
| `calibration_max_gpu_inventory_entries` | 16 distinct SKUs | Attested host inventory bound |

Each value comes from the [pinned parameter file](https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/params/flop-protocol-params.yaml), not a runtime storage read. `rules` returns every captured definition with its description and provenance.

```text
initial_required_G_n = floor(C_emp * elapsed_blocks * utilization_ppm / 1000000)
SOFT effective_cap = C_emp
HARD effective_cap = min(C_emp, floor(inventory_ceiling * discount_ppm / 1000000))
pledge_baseline = effective_cap * 86400
```

R7.1c says: "Calibration is per miner host." The empirical cap includes attached GPUs and production batching once. It is not multiplied by device, session or channel count. The discount applies to the HARD inventory ceiling, not to settled work or a SOFT empirical cap. Every attested SKU must have a governed ceiling. This calculator accepts an already summed, declared ceiling. It does not authenticate inventory.

The benchmark calculator checks zero cap, minimum duration, job count and work coverage. Passing it means only that the declared arithmetic passes. R7.1a also requires bound fresh credentials, correctness, sufficient stake and the initial acceptance cooldown.

### Lease boundaries and renewal

R7.2 says: "At the exact expiry boundary every registration, PoUI, stake/vesting, and compute-channel consumer **MUST** fail closed." With `A` as the latest successful acceptance or renewal block and `L` as the lease length:

| Block window | Model state |
| --- | --- |
| `N < A` | Before acceptance |
| `A <= N < A + L - 86400` | Active by time only |
| `A + L - 86400 <= N < A + L` | Active with renewal due |
| `A + L <= N < A + 2L` | Expired with storage renewal grace |
| `N >= A + 2L` | Expired and prunable |

The one-day reminder follows R7.3: "when one day remains on the lease." Grace and pruning are storage-retention labels from [network #76](https://github.com/flop-labs/network/issues/76), which quotes: "Expired caps retain one lease of renewal grace, then become prunable." Prunable does not mean removed. Grace does not permit serving. The report is historical evidence, not a current storage observation.

Renewal requires fresh one-shot jobs issued at or after a declared trigger. R7.2 requires work covering `floor(C_effective × max(1, current_block - renewal_trigger) × u_min / 10⁶)` and says: "Each successful renewal **MUST NOT** increase either empirical or effective capacity relative to the values stored immediately before that renewal." The calculator conservatively uses the currently accepted effective cap for this work requirement. It does not reduce required work by proposing a lower next cap. The public text does not resolve operation ordering within a tightening renewal.

HARD renewal can tighten a stored cap against the current discounted ceiling. A later ceiling increase cannot restore lost capacity. During a lease the accepted cap stays frozen. R7.3 requires renewal on restart or reconnect. Changed inventory or device/driver/firmware fingerprint invalidates the old cap and requires a new burst. Statistical drift detection and latency-based reward adjustment remain open specification work, not implemented measurements here.

## Observations and issue #76

The raw explorer recording supplies `phase`, `gnMax`, `pledgeBaseline` and `efficiencyCoeff` when calibration is present. The tool checks only the observable equation `pledgeBaseline = gnMax * 86400`. It preserves a measured zero coefficient without interpreting it as proof of zero efficiency. Missing calibration stays missing.

The fresh GraphQL root introspection is retained in `fixtures/schema.json`. It exposes no calibration query. The MCP stats provide a separately timed indexer head. The explorer response lacks acceptance, expiry and calibration-version fields. `registeredBlock` and self-declared inventory time are not calibration acceptance blocks.

Issue #76 is shown as `UNOBSERVABLE`. This tool has neither reproduced its expired-Active result against current chain storage nor shown it fixed. It never combines an old issue's acceptance block with a new head as though no renewal occurred.

## Library

```ts
import { accountWork, leasePhase, parameters, recordedReport } from "@flop-lab/metering";

const work = accountWork(["600000000", "600000000"], 128);
const phase = leasePhase("1000", "605800", parameters);
const evidence = recordedReport();
```

`benchmark`, `renewal`, `decayWeight`, `auditSnapshot` and `createObserver` are also exported. All numeric inputs are decimal integer strings. Malformed values and destination overflow throw. Each public function documents an example.

## Checks and network budget

```sh
pnpm --filter @flop-lab/metering check
FLOP_LIVE=1 pnpm --filter @flop-lab/metering check
```

Tests cover the recorded response, the paper's worked benchmark, exact expiry boundaries, one-floor decay, width overflow, missing data, hostile values, duplicate rows, caching and bounded retries. Live reads are opt-in and report unavailable data cleanly offline. Successful observers cache for 30000 ms per instance. Each run has a four-request budget, at least 500 ms spacing, one retry per source on transient failures and a 200000-byte response cap. MCP retries use the shared client. Explorer 429 and server errors use bounded backoff. These are configured limits, not performance claims.

## What this does not verify

The tool does not execute the versioned token-to-reference-work primitive, authenticate a workload, count physical instructions or verify inference correctness. It does not verify credentials, attestation, inventory ceilings, stake, runtime constants, current acceptance blocks, calibration versions, finality or deployed storage proofs. Arithmetic eligibility is not authorization to serve. Recorded data is dated evidence. Declared calculator inputs are scenarios. Drift detection, reward allocation and actual cap renewal are not executed.
