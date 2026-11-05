// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";
const directory = new URL("../fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
const client = new McpClient({
  retries: 1,
  minIntervalMs: 500,
  fetch: async (url, init) => {
    const start = performance.now();
    const response = await fetch(url, init);
    const raw = await response.clone().text();
    await writeFile(
      new URL("discovery.json", directory),
      JSON.stringify({
        source: String(url),
        measuredAt: new Date().toISOString(),
        durationMs: performance.now() - start,
        status: response.status,
        request: JSON.parse(String(init?.body)),
        raw,
      })
        .replace(/\u2013/g, "\\u2013")
        .replace(/\u2014/g, "\\u2014"),
    );
    return response;
  },
});
const result = await client.listTools();
for (const tool of result.value)
  console.log(JSON.stringify({ name: tool.name, readOnly: tool.annotations?.readOnlyHint, input: tool.inputSchema }));
