#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { KnowledgeClient, type Observation } from "./client";
import { replay, recordedManifest } from "./recorded";
import { graph, searchCatalog, citedConcepts } from "./catalog";
import { parseManifest, parseRequirement } from "./schema";

const help = `flop-knowledge <command> [input] [--live] [--json]

catalog                 Browse manifest and directed relationships
get <id-or-path>         Read a concept's exact source text
search <query>          Search the catalog (local substring filter in replay)
explain <key>           Inspect requirement status and cited source paths
pack                    Read the pack manifest
skill <id-or-path>       Read skill text only
guidance                Read generic remote guidance only
card <0x-H256>           Read one agent card

Default: dated bundled recordings. --live makes bounded public MCP reads.
--json retains raw tool text, source and receipt time. No installation or writes.
Examples: flop-knowledge catalog; flop-knowledge explain R9.5 --json
`;

function terminal(value: string): string {
  return [...value]
    .filter((c) => c === "\n" || c === "\t" || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
    .join("")
    .replace(/[\u2013\u2014]/g, "-");
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { live: { type: "boolean" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) {
    console.log(help);
    return;
  }
  const [command, input] = positionals;
  if (positionals.length > 2 || !command) throw new Error("Expected one command and one quoted input");
  const noInput = ["catalog", "pack", "guidance"].includes(command);
  if (noInput && input !== undefined) throw new Error(`${command} does not take an input`);
  if (!noInput && input === undefined) throw new Error(`${command} requires an input`);
  if (!["catalog", "get", "search", "explain", "pack", "skill", "guidance", "card"].includes(command))
    throw new Error(`Unknown command: ${command}`);
  const client = new KnowledgeClient();
  let result: Observation<unknown>;
  if (values.live) {
    switch (command) {
      case "catalog":
        result = await client.manifest();
        break;
      case "get":
        result = await client.concept(input!);
        break;
      case "search":
        result = await client.search(input!);
        break;
      case "explain":
        result = await client.explain(input!);
        break;
      case "pack":
        result = await client.pack();
        break;
      case "guidance":
        result = await client.guidance();
        break;
      case "skill":
        result = await client.skill(input!);
        break;
      default:
        result = await client.card(input!);
    }
  } else if (command === "search") {
    const manifest = recordedManifest();
    result = { ...manifest, value: { query: input, results: searchCatalog(manifest.value!, input!) } };
  } else result = replay(command, input);
  const report: Record<string, unknown> = {
    mode: values.live ? "live read" : "recorded observation",
    observation: result,
    requests: client.mcp.stats.requests,
  };
  if (result.status === "reported" && command === "catalog") report.edges = graph(parseManifest(result.value));
  if (result.status === "reported" && command === "explain") {
    const manifest = values.live ? await client.manifest() : recordedManifest();
    report.catalogObservation = manifest;
    report.citedSourceConcepts = manifest.value ? citedConcepts(manifest.value, parseRequirement(result.value)) : [];
    report.requests = client.mcp.stats.requests;
  }
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.mode}\n${result.tool}\n${result.source}\n${result.measuredAt}\n${result.status}`);
    if (command === "catalog" && result.value) {
      const m = parseManifest(result.value);
      console.log(
        `${m.concepts.length} received concepts; ${m.conceptCount} declared\n${terminal(m.warnings.join("\n"))}`,
      );
      console.log(
        terminal(
          m.concepts
            .map((c) => `${c.id}\t${c.title}\t${c.confidence ?? "not supplied"}\t${c.lifecycle ?? "not supplied"}`)
            .join("\n"),
        ),
      );
    } else console.log(terminal(JSON.stringify(result.value ?? result.error, null, 2)));
    if (command === "explain")
      console.log(terminal(JSON.stringify({ citedSourceConcepts: report.citedSourceConcepts }, null, 2)));
  }
  if (result.status !== "reported") process.exitCode = 2;
}
main().catch((error: unknown) => {
  console.error(terminal(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
