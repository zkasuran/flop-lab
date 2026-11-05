// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { Transport } from "../src/transport";
import { Context } from "../src/context";
import { serialize } from "../src/validation";
const transport = new Transport({ maxRequests: 12 });
const context = new Context(transport);
const root = new URL("../fixtures/expanded/", import.meta.url);
await mkdir(root, { recursive: true });
const tools = await context.tools();
for (const name of ["flop_trust_root", "flop_list_session_offers", "flop_knowledge_get"])
  console.log(name, serialize(tools.find((tool) => tool.name === name)?.inputSchema, 0));
for (const [name, args] of [
  ["flop_trust_root", {}],
  ["flop_list_session_offers", { limit: 1 }],
  ["flop_knowledge_get", { id_or_path: "protocol-params" }],
] as const) {
  try {
    const value = await context.call(name, args);
    console.log(name, serialize(value, 0).slice(0, name === "flop_trust_root" ? 9000 : 6000));
  } finally {
    for (const item of transport.evidence) await writeFile(new URL(`probe-${item.id}.json`, root), serialize(item, 0));
  }
}
for (const item of transport.evidence) await writeFile(new URL(`probe-${item.id}.json`, root), serialize(item, 0));
