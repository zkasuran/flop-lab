# Operator doctor

Is this machine ready to mine or validate on FLOP? Doctor reads local host capacity and compares it with quoted operator requirements. Each result is READY, NOT_READY or UNKNOWN. Missing evidence stays visible.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/doctor --filter @flop-lab/cli run build
node packages/cli/dist/cli.js doctor miner --offline --skip-ports --markdown
```

The final command exits 2 when evidence is incomplete. That is a report outcome. The standalone binary is `flop-doctor`; the suite subcommand is `flop doctor`. In this source workspace, invoke them through `node packages/doctor/dist/cli.js` and `node packages/cli/dist/cli.js` respectively.

## Run a preflight

```sh
node packages/doctor/dist/cli.js miner --json
node packages/doctor/dist/cli.js validator --markdown --disk-path /var/lib
node packages/doctor/dist/cli.js miner --access-request
```

`--access-request` prints a draft matching the public [access form](https://github.com/flop-labs/network/issues/new?template=access.yml). It submits nothing. The Request field is `other`; replace it with the operator action you need. Add your public SS58 address manually. Automatic devnet miner sponsorship needs no request while capacity remains.

Default output omits hostnames, IPs, filesystem paths and command stderr. `--include-host` includes the local hostname in JSON and the access draft. It does not discover a public IP. No account files or operator environment files are read.

Pass `--worker-image` and `--backend-image` for miners or `--node-image` and `--da-image` for validators. Each takes a version-and-sha256 image reference from your reviewed release. Doctor reads only `RepoDigests` through `docker image inspect`. It never pulls images. A local digest match does not establish release approval.

Use `--da-port` only after checking the approved validator release. The role manual names host DA port 7000 for the old devnet profile and 7001 for the prepared profile. Doctor assumes neither. `--skip-ports` disables all transient binds.

## What READY means

- READY: evidence meets the named check, such as Docker daemon access.
- NOT_READY: observed evidence falls below the quoted requirement or reference profile.
- UNKNOWN: a tool is missing, a probe is denied, the source is ambiguous or the check needs external evidence.

Overall status uses this order: NOT_READY, then UNKNOWN, then READY. An empty result is UNKNOWN. Exit codes: READY is 0, NOT_READY is 1 and UNKNOWN is 2. Invalid CLI arguments exit 64. Hardware results do not establish network admission.

The validator CPU, RAM and storage figures are a production reference, not measured devnet minimums. `nproc` reports available logical processors, not dedicated physical cores. `/proc/meminfo` reports total and available RAM but not ECC. `df` reports filesystem capacity and available bytes at the selected path, not installed drive capacity or NVMe quality. The storage source does not specify whether the reference means installed or free capacity, so disk readiness stays UNKNOWN.

The miner GPU floor is compared per device using the quoted 16 GB as decimal bytes. GPU memory is read in MiB and converted to bytes. Separate devices are never pooled to pass the floor. Model fit remains UNKNOWN without the exact checkpoint, runtime memory budget and TOPLOC evidence. The model catalogue is context, not proof that the GPU can serve it. Generic miner CPU and RAM minimums are unspecified; the quoted RTX 5090 guidance is labeled as such.

## Clock and network limits

Online mode makes a GET to `https://api.flop.network/v1/models` and a HEAD to `https://explorer.devnet.flop.network`. Both supply HTTPS Date observations. These use a 15-second timeout and a 64 KiB response ceiling. Local subprocesses use a 5-second timeout and a 64 KiB output ceiling. File and transient bind checks also time out after 5 seconds. Probes run sequentially.

Cache TTL is 0. Each run measures again. There are no retries. A 429 or 5xx stops that request and records a backoff instruction; a numeric Retry-After is preserved. Wait before running again. `--offline` makes no HTTP requests.

For each usable Date header, the server-minus-local interval is `[Date - local_end, Date + 1000 - local_start]` in milliseconds. It includes second-level rounding and request duration. Nonzero Age, malformed headers and detected local wall-clock jumps are rejected. Two distinct hosts must give overlapping intervals entirely beyond the same side of the specification's 250 ms bound to produce NOT_READY. Every other clock verdict is UNKNOWN. This cannot certify miner-agent skew, NTP accuracy or a deployed runtime constant. An unmarked upstream cache is not detectable here.

Local binds use loopback only and close immediately. A free or busy local port says nothing about inbound routes. After deployment, run this from a second host for a miner:

```sh
curl --connect-timeout 5 --max-time 10 -sS -o /dev/null -w '%{http_code}\n' 'https://REPLACE_WITH_PUBLIC_DNS/session/info'
```

The documented unauthenticated response is 401. Replace the DNS placeholder. For validators, run `nc -vz -w 5 REPLACE_WITH_PEER_HOST 30333` and the same command with the approved DA port from an authorized peer. TCP success does not establish DA custody or protocol health. Doctor calls no third-party scanner.

## Library

```ts
import { diagnose, accessRequest } from "@flop-lab/doctor";
const report = await diagnose({ role: "miner", offline: true, skipPorts: true });
console.log(report.status);
console.log(accessRequest(report));
```

`collect` returns dated probe evidence. `evaluate` is the pure requirements decision function. `diagnose` combines both. `markdown` and `accessRequest` render the same report. Public functions have examples in their doc comments.

## Evidence and checks

`test/fixtures` holds raw public source responses with retrieval times, the recorded model response, privacy-filtered local probe output and redacted example reports. Yellowpaper fixtures retain complete sections 7 and 15 plus the clock parameter row. Raw source text is data; Unicode dash characters are escaped in JSON. Synthetic GPU variants and hostile outputs are labeled separately in `probe-cases.json`.

Run `pnpm --filter @flop-lab/doctor check` and `pnpm --filter @flop-lab/doctor build`. Tests replay the recorded host, validate source quotations and cover empty data, malformed units, missing tools, digest mismatch, coarse clocks and network backoff. The publication evidence includes a deliberate decision-logic mutation followed by restoration.

The recorded miner run at `2026-11-05T20:53:16.833Z` took 4432 ms inside `diagnose` and made 2 HTTP requests. Its report contains 3 READY checks and 12 UNKNOWN checks. These are one host's observations, not performance or uptime claims. Service-port binding was skipped on this shared host. A transient bind on the assigned test port 3429 was recorded separately. The site displays this record and never probes its visitor.

## What this does not verify

Doctor does not install dependencies, start containers, change clock settings, configure networking or submit transactions. It does not verify exact model fit, GPU container access, throughput, ECC, installed NVMe capacity, persistence, precise clock synchronization, public reachability, approved release contents, stake, registration, calibration, DA retention, finalized chain progress or network admission. It does not establish earnings or mainnet readiness.
