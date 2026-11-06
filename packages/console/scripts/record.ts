// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { McpClient } from "@flop-lab/mcp";
import { INTROSPECTION_QUERY } from "../src/query";

let next = "tools";
const capture: typeof fetch = async (url, init) => {
  const response = await fetch(url, init);
  const raw = await response.clone().text();
  const record = {
    source: String(url),
    measuredAt: new Date().toISOString(),
    status: response.status,
    request: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
    raw,
  };
  const text = JSON.stringify(record).replace(
    /[\u2013\u2014]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16)}`,
  );
  if (Buffer.byteLength(text) > 200_000) throw new Error("Fixture exceeds recording limit");
  await writeFile(new URL(`../fixtures/${next}.json`, import.meta.url), `${text}\n`);
  return response;
};
const client = new McpClient({ fetch: capture, retries: 0, timeoutMs: 15_000, minIntervalMs: 500 });
if (process.argv.includes("--introspection")) {
  next = "flop_indexer_query";
  const result = await client.callTool("flop_indexer_query", { query: INTROSPECTION_QUERY });
  console.log(`Recorded introspection at ${result.measuredAt}`);
} else {
  const tools = await client.listTools();
  console.log(`Recorded ${tools.value.length} tools from ${tools.measuredAt}`);
}
if (process.argv.includes("--all")) {
  const calls: [string, Record<string, unknown>][] = [
    ["flop_get_stats", {}],
    ["flop_indexer_query", { query: INTROSPECTION_QUERY }],
    ["flop_estimate_cost", { model_hash: "qwen/qwen2.5-0.5b-instruct", prompt_length: 1000, output_length: 500 }],
    [
      "flop_estimate_inference_cost",
      {
        model_hash: "qwen/qwen2.5-0.5b-instruct",
        input_tokens: 1000,
        output_tokens: 500,
        urgency: "normal",
        tee_required: true,
      },
    ],
    ["flop_get_model_pricing", { model_id: "qwen/qwen2.5-0.5b-instruct", tokens_estimate: 1500 }],
    ["flop_compare_pricing", { models: ["qwen/qwen2.5-0.5b-instruct"], tokens_estimate: 1500 }],
  ];
  for (const [name, args] of calls) {
    next = name;
    try {
      const answer = await client.callTool(name, args);
      console.log(name, JSON.stringify(answer.value).slice(0, 2000));
    } catch (error) {
      console.log(name, String(error));
    }
  }
  next = "models";
  const response = await capture("https://api.flop.network/v1/models");
  console.log("models", (await response.text()).slice(0, 2000));
}
