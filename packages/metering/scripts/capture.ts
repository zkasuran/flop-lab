// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient, DEFAULT_URL } from "../../mcp/src/index";
const dir = new URL("../fixtures/", import.meta.url);
const save = async (name: string, value: unknown) => {
  const text = JSON.stringify(value, null, 2).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  if (Buffer.byteLength(text) > 200_000) throw Error("Fixture too large");
  await writeFile(new URL(name + ".json", dir), text + "\n");
};
const pin = "2a2cc8218048a2933071bb2f45d75335560e39d8";
for (const file of ["yellowpaper.md", "params/flop-protocol-params.yaml"]) {
  const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${pin}/${file}`;
  const r = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  const text = await r.text(),
    measuredAt = new Date().toISOString();
  if (file.endsWith(".md")) {
    for (const section of [4, 7]) {
      const start = text.indexOf(`## ${section}.`),
        end = text.indexOf("\n## ", start + 1);
      if (start < 0 || end < 0) throw Error("Missing section");
      await save(`section-${section}`, { source, measuredAt, pin, raw: text.slice(start, end) });
    }
  } else {
    const blocks = text
      .split(/(?=^ {2}- name: )/m)
      .filter((b) => /^ {2}- name: (calibration_|gn_decay_factor_ppb)/.test(b));
    await save("parameters", { source, measuredAt, pin, raw: blocks.join("") });
    console.log("parameter definitions", blocks.length);
  }
}
const c = new McpClient({ retries: 1, minIntervalMs: 500 });
const query = "{ __schema { queryType { fields { name type { kind name ofType { kind name } } } } } }";
const schema = await c.callTool("flop_indexer_query", { query });
await save("schema", { source: DEFAULT_URL, query, ...schema });
console.log("schema", schema.raw);
const stats = await c.callTool("flop_get_stats");
await save("stats", { source: DEFAULT_URL, ...stats });
const source = "https://explorer.devnet.flop.network/api/miners?limit=100";
const r = await fetch(source, {
  headers: { "User-Agent": "flop-lab/metering (+https://github.com/zkasuran/flop-lab)" },
  signal: AbortSignal.timeout(20_000),
});
if (!r.ok) throw Error(`HTTP ${r.status}`);
const raw = await r.text();
await save("miners", { source, measuredAt: new Date().toISOString(), raw });
const parsed = JSON.parse(raw);
console.log("miners", parsed.pagination, "first", parsed.data[0]);
