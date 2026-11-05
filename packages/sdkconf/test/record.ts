// SPDX-License-Identifier: Apache-2.0
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { McpClient } from "@flop-lab/mcp";

const root = new URL("../fixtures/", import.meta.url);
const capture = async (source: string, init?: RequestInit) => {
  const measuredAt = new Date().toISOString();
  const response = await fetch(source, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: {
      ...Object.fromEntries(new Headers(init?.headers)),
      "user-agent": "flop-lab-sdkconf/0.1 (public fixture recording)",
    },
  });
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 150000) throw new Error("Recording exceeds fixture limit");
  if (!response.ok) throw new Error(`Recording refused: HTTP ${response.status}. No retry.`);
  return { source, measuredAt, status: response.status, headers: Object.fromEntries(response.headers), raw };
};
const models = await capture("https://api.flop.network/v1/models");
const parsed: unknown = JSON.parse(models.raw);
if (typeof parsed !== "object" || parsed === null || !("data" in parsed) || !Array.isArray(parsed.data))
  throw new Error("Invalid model feed");
await writeFile(new URL("models.json", root), JSON.stringify(models, null, 2) + "\n");
const mcp = new McpClient({
  retries: 0,
  fetch: async (url, init) => {
    const fixture = await capture(String(url), init);
    await writeFile(new URL("mcp.json", root), JSON.stringify(fixture, null, 2) + "\n");
    return new Response(fixture.raw, { status: fixture.status, headers: fixture.headers });
  },
});
await mcp.callTool("flop_get_stats");
const files = {
  sdk: ["README.md", "dist/faucet.d.ts", "dist/x402.d.ts", "dist/coordination.d.ts"],
  client: ["README.md"],
  cli: ["README.md"],
};
for (const [sdk, paths] of Object.entries(files)) {
  const packageRoot = new URL(`../node_modules/@flop-labs/${sdk}/`, import.meta.url);
  const manifest: unknown = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
  const documents = [];
  for (const path of paths) {
    const raw = await readFile(new URL(path, packageRoot));
    documents.push({ path, sha256: createHash("sha256").update(raw).digest("hex"), base64: raw.toString("base64") });
  }
  await writeFile(
    new URL(`${sdk}-docs.json`, root),
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        source: `https://registry.npmjs.org/@flop-labs/${sdk}`,
        manifest,
        documents,
      },
      null,
      2,
    )
      .replace(/\u2013/g, "\\u2013")
      .replace(/\u2014/g, "\\u2014") + "\n",
  );
}
console.log(
  JSON.stringify({
    models: models.measuredAt,
    modelRows: parsed.data.length,
    mcpRequests: mcp.stats.requests,
    networkRequests: 2,
  }),
);
