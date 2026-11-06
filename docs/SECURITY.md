# Running flop-lab in public

What protects a public deployment? The web app has common request admission, bounded public reads and a nonce-based script policy. This document describes those controls and their limits. It is a source review with local tests, not a claim that every deployment is safe.

## Reproduce

From the repository root with Node 22 and the workspace pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm --filter web check
pnpm exec tsx apps/web/scripts/security-inventory.ts
```

Run `pnpm audit --json` to refresh the advisory result. Build with `pnpm --filter web build`. Start a local production server with `pnpm --filter web exec next start --port 3800`. Read response headers with `curl -I http://localhost:3800/verify`.

## Assets and trust boundaries

- Protect server memory, CPU, public upstream budgets and visitors' browser execution.
- Treat all request fields, recorded files and public API data as untrusted input. TLS authenticates the remote host, not the truth of its claims.
- The web app has no wallet or user account system. It accepts no signing keys and sends no transactions. The console allowlist is read-only.
- Browser code renders API fields as text. Raw downloads are JSON or NDJSON. `nosniff` prevents interpretation as executable HTML. The only authored inline script is the nonced theme initializer.
- The owner controls deployment variables and the immutable application build. A compromised build, dependency or hosting account is outside these request guards.

## Shared request admission

`apps/web/proxy.ts` calls `lib/security/admission.ts` before route work. The test suite enumerates application `route.ts` files and requires a reviewed policy for each. New routes need a policy and an entry in the matrix below.

Policy limits are configuration, not benchmark claims:

| Boundary                                            | Limit                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Full request URL                                    | 2048 UTF-8 bytes                                                           |
| Allowed query value                                 | 256 characters; each key appears once                                      |
| Console request body                                | 32768 bytes while streaming; 5 second body deadline                        |
| JSON media type                                     | Exact `application/json`, with optional parameters                         |
| API requests per visitor                            | 30 per 60 second process-local window                                      |
| Aggregate API requests                              | 120 per 60 second process-local window                                     |
| HTML and other non-API requests per visitor         | 240 per 60 second window                                                   |
| Budget store                                        | 2000 buckets; a full store refuses new keys                                |
| Live console, explorer, verifier and DID operations | 4 concurrent operations per process; no admission queue                    |
| Outbound requests                                   | 4 concurrent body reads and 120 attempts per origin per minute per process |
| Public response                                     | 200000 streamed bytes; recorder index alone allows 4000000                 |
| Outbound deadline                                   | 8 seconds including body consumption, shortened by caller cancellation     |
| Console, explorer, verifier and DID JSON reply      | 2000000 bytes after serialization                                          |

Vercel deployments use only `x-vercel-forwarded-for`, validated as a single IP and normalized before hashing. The platform must overwrite it and prevent direct origin access. `X-Forwarded-For`, cookies and client-selected IDs never choose a budget bucket. Other hosts use one shared bucket. Do not set `VERCEL=1` on an ordinary self-hosted server. Add an edge rate limit using the connection IP there. Instances, processes and regions do not share these in-memory counters. IPv6 addresses are canonicalized but not grouped by subnet.

Budget checks also count malformed API requests. Rate-limit errors use `429`, `Retry-After: 60` and `private, no-store`. Method, origin, duplicate-query and size errors are also uncacheable. The proxy rejects `x-middleware-subrequest` and overwrites supplied nonce and CSP headers.

POSTs and API reads reject cross-site browser fetches and mismatched `Origin`. The expected origin is `SITE_URL` when configured, otherwise the request URL origin. Set `SITE_URL` to the public HTTPS origin behind a reverse proxy. A client-supplied `Host` does not override it. Clients without `Origin` remain supported for these read-only routes. Origin checks are not authentication.

The application stops reading oversized or stalled console bodies. An edge server must also enforce connection, upload and header limits before Next receives a request. These process-local guards are not a distributed denial-of-service defense.

## Server route threat matrix

Every row receives the common method, URL, query and rate checks above. GET routes also permit HEAD. Query keys not listed are rejected. All listed hosts come from code, never from request URLs.

| Route                        | Input and upstream work                                                                                                                                                    | Time, size and cache boundary                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /console/api`          | Bounded JSON. Explicit tool allowlist plus discovered input schema. Only fixed MCP and gateway model URLs. No chat or write tools. GraphQL rules below.                    | 25 second route deadline; service deadline 20 seconds. Catalog TTL 300 seconds; result TTL 60 seconds; 50 cached results. Private response.                                                                                              |
| `GET /explorer/query`        | `q` is a block, hash or address with optional known prefix. Or `recorded` selects a fixed entity kind. Both together are rejected. Typed indexer templates bind variables. | 60 second operation deadline. Existing visitor search budget is also enforced using the trusted visitor key. At most 16 pending keys and 100 cached keys. Complete results live 15 seconds; partial results 5 seconds. Private response. |
| `GET /verify/data`           | Optional `channel` is a strict channel hash. Absence reads six recent rows. Collection uses fixed MCP tools and typed queries. Quote URLs are never followed.              | 110 second route deadline. One active collection; 16 cache keys with 30 second TTL. Channel collection caps rows at 100. Private response.                                                                                               |
| `GET /did/data`              | `did` is a checked Ed25519 DID or 16 lowercase hex fingerprint. Fixed technocore room/profile paths, fixed GitHub search endpoint and fixed raw build path.                | 60 second operation deadline. Web-only memory cache holds at most 64 URL results for one hour and admits at most 30 misses per hour across all hosts. No files are created. No-store response.                                           |
| `GET /finality/live`         | No input. One fixed bounded indexer query with validated recording.                                                                                                        | 8 second attempt, no retry. Success and failure coalesce for 15 seconds. No-store response.                                                                                                                                              |
| `GET /x402/preview`          | No input. Five settlement rows through the shared MCP parser.                                                                                                              | 4 second caller timeout covers the bounded fetch. No retry. Success and failure coalesce for 60 seconds. No-store response.                                                                                                              |
| `GET /scoreboard/snapshot`   | No input. Fixed gateway and MCP collections. Validated snapshot or dated fallback.                                                                                         | Whole collection deadline 8 seconds. Fixed cache key and 60 second revalidation.                                                                                                                                                         |
| `GET /api/history.json`      | No input. Fixed recorder index and newest validated snapshot path. Hash and timestamp cross-check.                                                                         | 8 seconds per read. Index cap 4000000 bytes and snapshot cap 100000 bytes. Five-minute Next cache. Derived output is bounded by the validated index.                                                                                     |
| `GET /history/models.json`   | Same fixed history inputs. Selects the model observation or dated seed.                                                                                                    | Same history caps and five-minute cache.                                                                                                                                                                                                 |
| `GET /history/feed.xml`      | Same fixed history index. RSS escapes text and links.                                                                                                                      | Same index cap and five-minute cache. No request fields enter feed contents.                                                                                                                                                             |
| `GET /SIGNATURE.json`        | No input. Reads only the fixed root manifest locations.                                                                                                                    | Files over 200000 bytes refused. Five-minute public cache if present; absent is 204/no-store. Fixed error text.                                                                                                                          |
| `GET /harness/sources/[id]`  | Build-generated source ID allowlist. No supplied path is opened.                                                                                                           | Immutable local recorded source; unknown IDs are 404. Statically generated.                                                                                                                                                              |
| `GET /sessions/channel/[id]` | Strict 32-byte hex ID selects a local recorded row.                                                                                                                        | Five-minute public cache; missing row is 404. No network.                                                                                                                                                                                |
| `GET /knowledge/data`        | Optional `concept` resolves through the recorded manifest. No supplied URL is fetched.                                                                                     | Local fixed file set or matching raw record. Unknown concepts are 404.                                                                                                                                                                   |
| `GET /invariants/replay`     | No input. Exports native local replay inputs.                                                                                                                              | Fixed recorded inputs; five-minute public cache.                                                                                                                                                                                         |
| `POST /invariants/replay`    | Empty body only. Replays fixed local inputs, never posted code or data.                                                                                                    | Single active replay per process. Bounded local checks stream NDJSON. No network and no-store. Disconnect stops output; finite checks finish locally.                                                                                    |
| `GET /spec/report`           | Fixed validated recorded report.                                                                                                                                           | Static JSON attachment. No upstream work.                                                                                                                                                                                                |
| `GET /upgrades/report.json`  | Fixed validated recorded report.                                                                                                                                           | Static JSON attachment. No upstream work.                                                                                                                                                                                                |
| `GET /indexer/recording`     | Fixed recorded snapshot.                                                                                                                                                   | JSON attachment; five-minute public cache.                                                                                                                                                                                               |
| `GET /proofs/recording`      | Fixed proof recording.                                                                                                                                                     | Static JSON attachment.                                                                                                                                                                                                                  |
| `GET /metering/recording`    | Fixed metering recording.                                                                                                                                                  | Static JSON attachment.                                                                                                                                                                                                                  |
| `GET /economics/recording`   | Fixed validated observation.                                                                                                                                               | JSON attachment; fixed failure message.                                                                                                                                                                                                  |
| `GET /models/recording`      | Fixed model recording.                                                                                                                                                     | JSON attachment.                                                                                                                                                                                                                         |
| `GET /sessions/recording`    | Fixed lifecycle report.                                                                                                                                                    | JSON attachment; five-minute public cache.                                                                                                                                                                                               |
| `GET /x402/recording`        | Fixed recorded run.                                                                                                                                                        | JSON attachment; one-hour public cache.                                                                                                                                                                                                  |
| `GET /kestra/evidence`       | Fixed recorded evidence.                                                                                                                                                   | One-hour public cache. Reviewed as a local download; no plugin changes.                                                                                                                                                                  |

Local downloads have build-controlled finite sizes rather than an arbitrary upload or remote-fetch path. Changing a recording requires reviewing its size and source. The build manifest stat check is not protection against a local actor changing files during a read.

The framework also serves bundled assets, icons, generated social images, `robots.txt`, `sitemap.xml`, HTML and RSC navigation. No Server Actions are used. Page POSTs are rejected. Static asset/image paths bypass nonce generation. The image optimizer has no configured remote sources. Social images use local recorded values and code-defined slugs. `SITE_URL` is deployment configuration, not request input.

Server-rendered home, scoreboard, challenger and finality pages use the same bounded egress adapter. Home keeps a 30 second source cache and dated fallback. Scoreboard and challenger retain their bounded collectors. Harness and history pages fetch only the fixed recorder index with the larger documented index cap. Browser provenance reads the fixed public GitHub pulls endpoint directly. It has its own five-minute cache, page validation and backoff; it is not a server proxy.

## Query and egress controls

Console GraphQL is parsed into an AST. It permits one query operation, no mutation or subscription, at most 8192 query bytes, 2000 parser tokens, depth 8, 100 expanded fields and 6 root fields. Fragment cycles, duplicates and unused fragments are refused. Pagination values, including variable defaults, are validated: row limits are 1 to 100 and offsets 0 to 10000. Variable JSON has an 8192-character cap. These are syntax/resource bounds, not a cost model for the upstream resolver. A deeply nested row selection still needs upstream resolver limits.

`lib/security/transport.ts` is an injected fetch adapter, not another MCP client. All MCP framing and response parsing stays in `@flop-lab/mcp`. The adapter checks HTTPS origins and paths, rejects credentials, ports and fragments and sets `redirect: error`. It cannot follow a public-host redirect to a private host. The only variable remote paths are validated recorder snapshots and constrained DID profile/room paths. GitHub search terms are encoded by the DID collector. No caller-selected host, repo or room is accepted by a web route.

Response streams are capped before parsing and remain under the timeout after headers arrive. Failed HTTP bodies and cookies are discarded. Transport exceptions use fixed text. Console, explorer and DID route boundaries remove internal exception messages. Successful upstream evidence remains visible as data. Hostile remote strings are not executable scripts.

An origin backs off for at least 60 seconds after a network failure, 403, 429 or 5xx. `Retry-After` can extend this to one hour. There is no automatic retry in the adapter. Existing higher-level retry loops remain subject to this backoff and their operation deadline. Public hosts' DNS and TLS are trusted; this does not pin their resolved IP addresses.

Cache keys are fixed URLs, normalized entity identifiers or parsed console requests. Errors and per-visitor budgets never enter a public CDN cache. DID results use no-store because partial gaps can reflect local reader state. An attacker can cause fresh upstream requests only within the admission and egress limits. Unsigned upstream data can still be wrong or stale. Rate limits do not authenticate it.

## Browser policy

Each HTML response gets a cryptographically random nonce. The root layout reads it and Next attaches it to framework scripts. Client-supplied nonces are overwritten. `script-src` uses that nonce and `strict-dynamic`. Production permits neither `unsafe-inline` scripts nor `unsafe-eval`. Script attributes, objects, frames and base URL changes are denied. Styles permit `unsafe-inline` because Motion updates element styles. This exception does not permit inline scripts. Connect destinations are same-origin and the fixed GitHub API origin used by provenance. Fonts are local.

HTML renders dynamically and uses `private, no-store`. Do not enable static HTML export, force-static pages, partial prerendering or an HTML CDN cache without redesigning nonce delivery. Data route and static asset caches remain separate. Dynamic HTML costs server work; the local browser evidence measures that tradeoff.

Common headers also set HSTS `max-age=31536000`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, referrer policy `strict-origin-when-cross-origin` and denied camera, microphone, geolocation, payment, USB and browsing-topics permissions. HSTS is effective on HTTPS. It deliberately does not promise policy for other subdomains or request preload. Development alone permits eval and WebSocket connections for framework tooling.

## Dependency observation

`pnpm audit --json` at 2026-11-06T05:28:02Z reported 3 moderate advisories, 0 high and 0 critical. Source: npm advisory data via pnpm for the committed workspace lockfile. The result is time-bound and is not a clean bill of health.

| Package                          | Locked version | Advisory and reviewed exposure                                                                                                                                                                                                                                     |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ajv` in `tclk-inspect`          | 8.17.1         | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6). ReDoS with `$data`. The inspected codec constructs Ajv with strict validation and does not enable `$data`. Advisory lists a fix at 8.18.0. Package-owner update remains outstanding.     |
| `@hono/node-server` in `x402kit` | 1.19.18        | [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f). Double decoding in `serveStatic`. The local CLI imports `serve`; no `serveStatic` call was found in its source. Advisory lists a fix at 2.1.3. Major-version review remains outstanding. |
| `minimatch` through lint tooling | 10.2.6         | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Glob amplification denial of service. This path is development tooling. Advisory lists a fix at 11.0.1. Root tooling update remains outstanding.                                         |

The web manifest pins Next 16.4.5, React and React DOM 19.3.1, Motion 14.9.1, Geist and Geist Mono 5.3.0 and React type packages 19.3.0. Workspace dependencies use `workspace:*`. Root and other package ranges are resolved by `pnpm-lock.yaml`; deploy with `--frozen-lockfile`. The type pins were generated into the lockfile through pnpm install. No registry tarball or lockfile was edited by hand.

Installed-manifest inventory at 2026-11-06T05:35:39.184Z found `esbuild@0.28.2` declaring `postinstall: node install.js`. It also found these packages declaring `prepare`: `@humanfs/core@0.19.2`, `@humanfs/node@0.16.8`, `@humanfs/types@0.15.0`, `@humanwhocodes/module-importer@1.0.1`, `@humanwhocodes/retry@0.4.3`, `acorn@8.19.0`, `balanced-match@4.0.4`, `brace-expansion@5.0.12`, `eslint-visitor-keys@3.4.3`, `hashery@1.5.1`, `hookified@1.15.1`, `lightningcss@1.33.0`, `minimatch@10.2.6`, `rollup@4.67.4`, `tinyexec@1.3.1`, `ts-api-utils@2.5.0` and `web-streams-polyfill@3.3.3`. A declared prepare script does not mean pnpm ran it from a registry tarball.

The workspace build allowlist permits `esbuild`, `sharp`, `unrs-resolver` and `@swc/core`. The inventory command scans installed package manifests, not every platform's optional packages or tarball contents. It prints the exact scripts and measurement time without running them. Keep registry installs frozen and review any allowlist change.

## What this does not verify

Local Lighthouse comparison on 2026-11-06 measured home performance 64 on baseline `afc2d7a` and 62 with these guards. Both had CLS 0. The corresponding verifier scores were 100 and 92; Verify section scores were 95 and 100. Source: local production Chromium, Lighthouse default mobile simulation and the same audit script, captured from 05:55:59Z through 05:56:58Z. The home page misses the suite's performance target on both builds. This security change does not resolve that existing page-performance work.

These controls do not prove consensus, inference correctness, upstream schema honesty or build authorship. They do not establish an absence of dependency defects. The open advisories above remain present in the lockfile.

Local checks do not verify deployed TLS, Vercel's header stripping, CDN configuration, distributed rate limits, filesystem permissions or runtime DNS behavior. A self-hosted reverse proxy needs its own connection limits and verified client-IP boundary. A malicious local administrator can replace code or cache files.

Report problems using [SECURITY.md](../SECURITY.md). Private GitHub vulnerability reporting was disabled when checked. The reporting policy describes the current contact fallback.
