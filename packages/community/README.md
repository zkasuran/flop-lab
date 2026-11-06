# Community pulse

What are operators and builders asking for and how long do public replies take? Community pulse groups a dated sample of FLOP issues and PRs by area and type. It measures observed reply and closure times, checks access-form fields locally and reports the chat room total when the public endpoint provides it.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/community build
node packages/community/dist/cli.js --json
```

The default reads the bundled recording. After the suite build, use `flop community --json`. The page is `/community`.

## Read public data

```sh
node packages/community/dist/cli.js --live --json
node packages/community/dist/cli.js lint-access < issue.md
pnpm --filter @flop-lab/community check
```

`--live` reads the public GitHub issues endpoint for `flop-labs/network`, `flop-labs/yellowpaper`, `flop-labs/tclk` and `flop-labs/technocore-chat`. It uses the latest 25 items per repository by creation date. That endpoint includes PRs. Older items are outside the sample even when they are still open.

The reader inspects the first comment page for up to ten threads per repository with up to one hundred comments per thread. Truncated, failed or uncollected comment histories stay explicit. Each repository and comment fetch has its own UTC observation time. Source issue links are reconstructed only from allowlisted repositories and validated issue numbers.

CLI JSON includes mode, requests made this run, the source snapshot and derived item clocks. `--help` describes options. Exit codes are zero for a completed report or valid form, one for incomplete form fields and two for command failure. A completed report can contain source failures. Inspect each source's error field.

## What the metrics mean

- Area comes from recognized labels first, then a recognized title prefix. Supported areas are access, gateway, sdk, cli, docs, protocol and erratum. Unrecognized items stay other. If multiple area labels exist, this listed order breaks the tie.
- Type comes from a recognized type label first. Enhancement maps to feature and documentation maps to docs. Access defaults to request and erratum defaults to erratum. Other recognized type prefixes are retained. Remaining items stay other.
- Age is repository observation time minus created_at. Reopened items retain their original creation date.
- First response is the earliest observed issue-thread comment by a non-author human with GitHub association OWNER, MEMBER or COLLABORATOR. Time is comment created_at minus issue created_at. Author replies, bots, PR reviews and review-thread comments do not count.
- Time to close is current closed_at minus created_at for currently closed items. It is not reconstructed first closure time.
- Medians use observed values only. Missing responses never become zero. The page shows each denominator and keeps issues and PRs separately filterable.
- Most requested means open issues classified as request, feature or question, grouped by area. It counts issues, not votes or unique people.

## Local access-form linter

The linter uses the public access form pinned at network commit `9a59aca2ef3e013ea4862522074f8d0752bb43b9`. Required headings are `### Request`, `### Network` and `### Public identifiers`. Details is optional. Request and Network must match the pinned dropdown choices. Empty values, duplicate headings and common placeholders are reported.

Input is limited to 64 KiB. The CLI reads stdin in memory. The page checks pasted Markdown in the browser. Neither path sends or saves the values. Results contain field names and fixed diagnostic text only. Presence of a public identifier does not validate its format or ownership.

## Cache and request policy

The default cache is `$XDG_CACHE_HOME/flop-community` or `~/.cache/flop-community`. `--cache-dir PATH` sets another persistent location. A directory lock prevents concurrent collectors from spending the same budget. After a crashed process, inspect the lock before removing it. Corrupt cache or budget state fails closed.

Snapshots, including source failures, expire six hours after collection starts. A cache hit makes no upstream requests. GitHub calls are spaced at least 250 ms apart and have a twelve-second timeout. One retry is allowed for 429 or 5xx. Numeric Retry-After up to five seconds is honored. Longer or date-form delays defer the retry. A run has a hard budget of 56 GitHub attempts.

Chat reads only `https://technocore.chat/stats` and `https://technocore.chat/rooms`. It does not read room messages. Chat requests are never retried in the same collection. A locked on-disk ledger reserves each attempt before sending and limits attempts to twenty in any rolling 24 hours per cache directory. Keep that directory between runs. Separate directories or machines have separate budgets, so operators must share one directory for a shared allowance.

`/rooms` currently returns a plain-text room-count header. Only that header is retained. Sequence counters are not message totals. The recording saw `/stats` return HTTP 404, so message totals are unavailable rather than zero.

## Recorded evidence and API

`fixtures/snapshot.json` retains exact observed dates, states, counts and maintainer associations. It is a privacy projection, not an unredacted HTTP archive. Full titles, bodies, logins, user IDs, room names and topics are discarded. Labels are allowlisted and normalized. Title text is reduced to a recognized prefix. Author equality and bot status become booleans. GitHub source URLs and observation times remain alongside the projections. The raw pinned access form is stored separately in `fixtures/access-form.json`.

The initial recording exhausted its GitHub budget before the fourth repository. A read-only GitHub supplement completed that sample with its own timestamp. The reader now limits comment reads per repository. The bundled recording retains all observations already made. Capture request counts describe that recording, not a forecast of future runs.

```ts
import { recordedSnapshot, rows, lintAccess, collectCommunity } from "@flop-lab/community";

const items = rows(recordedSnapshot());
const check = lintAccess(markdown);
const live = await collectCommunity({ cacheDir: ".cache/community" });
```

Tests cover real projections, empty data, hostile dates, privacy filtering, maintainer eligibility, true-zero response times, form fields, cache reuse, concurrent collectors and budget exhaustion. The recording script runs with `pnpm --filter @flop-lab/community record PATH_TO_PERSISTENT_CACHE` and makes an additional request for the pinned form.

## What this does not verify

This is a bounded public sample, not a census of demand or an SLA. It does not reconstruct deleted comments, private conversations, PR reviews, maintainer membership history or first closure after reopenings. GitHub association does not prove support responsibility. Closing an issue does not prove fulfillment.

The linter does not grant access or verify identifiers, eligibility or ownership. The chat recording does not establish total messages, unique users or activity quality. Recordings do not establish current service health, chain finality or inference correctness. No wallets, signed posts or write transactions are used.
