# Shared recorded responses

Which exact response did a test use and when was it observed? This Node-only package stores response text once by SHA-256 and keeps a separate source, time, HTTP status and content type for each observation.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/fixtures check
pnpm --filter @flop-lab/status check
```

## Read and refresh

```ts
import { readFixture } from "@flop-lab/fixtures";
const response = readFixture("status-2026-11-06T05-23-46.400Z-mcp");
console.log(response.source, response.measuredAt, response.body);
```

`records/` holds provenance and content references. `bodies/` holds JSON-encoded text. Decode the JSON string to recover the response text. Hashes cover that decoded UTF-8 text. They do not cover transport compression or HTTP headers. Unicode escapes preserve source typography.

`pnpm --filter @flop-lab/fixtures refresh` runs the status package's bounded capture script. It uses the existing probes and shared MCP client. It creates new observations and updates the status history. It does not overwrite earlier captures. Run it explicitly when online. Inspect source times, failed probes and the diff before committing. Normal tests never refresh.

The status capture script records errors as observations. It does not loop on a failure. Repeated bodies share storage but retain separate observation times. A file may contain at most 200,000 encoded bytes. Consumers still validate response schemas for their own use.

## What this does not verify

A matching hash checks local content consistency. It does not authenticate a server or prove that a recorded claim is true. A capture does not establish current availability, chain finality or inference correctness. Historical records remain historical after refresh.
