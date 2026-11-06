// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { McpClient, readIndexer } from "../../mcp/src/index";

const directory = new URL("../fixtures/windows/", import.meta.url);
await mkdir(directory, { recursive: true });
const save = async (name: string, value: unknown) => {
  const bytes =
    JSON.stringify(value, null, 2)
      .replaceAll(String.fromCharCode(0x2013), "\\u2013")
      .replaceAll(String.fromCharCode(0x2014), "\\u2014") + "\n";
  if (Buffer.byteLength(bytes) > 200_000) throw new Error("Fixture too large");
  await writeFile(new URL(name, directory), bytes);
};
const client = new McpClient({ retries: 1, minIntervalMs: 300 });
const schema = await client.callTool("flop_indexer_query", {
  query: '{ __type(name: "ComputeChannel") { fields { name description type { name kind } } } }',
});
await save("schema.json", { source: "https://mcp.flop.network/mcp", ...schema });
const channels = await readIndexer(client, "computeChannels", { status: "settling", limit: 50, offset: 0 });
await save("channels.json", channels);
console.log(JSON.stringify({ forcedClaims: channels.value.data.length, measuredAt: channels.measuredAt }));
const pin = (await fetch("https://api.github.com/repos/flop-labs/yellowpaper/commits/main").then((r) => r.json())) as {
  sha: string;
};
for (const path of ["params/flop-protocol-params.yaml"]) {
  const source = `https://raw.githubusercontent.com/flop-labs/yellowpaper/${pin.sha}/${path}`;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  await save("parameters.json", {
    source,
    measuredAt: new Date().toISOString(),
    raw,
  });
  const lines = raw.split("\n");
  console.log(source);
  console.log(
    lines
      .flatMap((line, i) =>
        /challenge|dispute|window/i.test(line)
          ? [`${i + 1}: ${lines.slice(Math.max(0, i - 2), i + 4).join("\n")}`]
          : [],
      )
      .join("\n")
      .slice(0, 12000),
  );
}
