// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { McpClient, listSettlements } from "@flop-lab/mcp";
import { createDemo } from "../src/demo.js";

const directory = new URL("../fixtures/", import.meta.url);
const sources = ["dist/x402.js", "dist/x402.d.ts", "dist/x402-types/index.d.ts", "README.md"];
const manifest = [];
for (const path of sources) {
  const source = `https://unpkg.com/@flop-labs/sdk@0.4.0/${path}`;
  const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${source}: ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());
  const file = `sdk-${path.replaceAll("/", "-")}.base64`;
  await writeFile(new URL(file, directory), raw.toString("base64") + "\n");
  manifest.push({
    source,
    measuredAt: new Date().toISOString(),
    file,
    bytes: raw.length,
    sha256: createHash("sha256").update(raw).digest("hex"),
  });
}
await writeFile(new URL("sdk-manifest.json", directory), JSON.stringify(manifest, null, 2) + "\n");
const records: unknown[] = [];
const client = new McpClient({
  retries: 1,
  fetch: async (url, init) => {
    const response = await fetch(url, init);
    records.push({
      source: String(url),
      measuredAt: new Date().toISOString(),
      request: JSON.parse(String(init?.body)),
      status: response.status,
      raw: await response.clone().text(),
    });
    return response;
  },
});
await listSettlements(client, { limit: 5 });
await writeFile(new URL("mcp.json", directory), JSON.stringify(records, null, 2) + "\n");
const demo = createDemo(client);
const request = new Request("http://127.0.0.1:3350/settlements", {
  headers: { "X-Flop-Request-Id": "recorded-request-0001" },
});
const quote = await demo.fetch(request);
const preview = await demo.fetch(new Request("http://127.0.0.1:3350/preview"));
const run = {
  measuredAt: new Date().toISOString(),
  mode: "local-http-reference",
  paymentExecution: "UNVERIFIED",
  request: { url: request.url, method: request.method, headers: Object.fromEntries(request.headers) },
  response: { status: quote.status, headers: Object.fromEntries(quote.headers), body: await quote.json() },
  preview: await preview.json(),
  requests: client.stats.requests,
};
await writeFile(new URL("run.json", directory), JSON.stringify(run, null, 2) + "\n");
await writeFile(new URL("headers.json", directory), JSON.stringify(run.response.headers, null, 2) + "\n");
console.log(
  JSON.stringify({
    measuredAt: run.measuredAt,
    sdkSources: manifest.length,
    mcpRequests: client.stats.requests,
    mode: run.mode,
  }),
);
