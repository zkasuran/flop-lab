#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { ConsoleService, type ConsoleRequest } from "./service";
import { fieldValue, object } from "./schema";

const help = `flop-console call <tool> --arg k=v [--json]
flop-console estimate --model <id> --tokens <n> [--output-tokens 500] [--json]
flop-console list [--json]
flop call <tool> --arg k=v [--json]

Read-only devnet calls. Input tokens exclude output tokens. Quotes are nominal estimates.
Use JSON for arrays, objects, booleans and numbers. Strings stay strings.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      arg: { type: "string", multiple: true },
      json: { type: "boolean" },
      model: { type: "string" },
      tokens: { type: "string" },
      "output-tokens": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const service = new ConsoleService();
  let [command, name] = positionals;
  const expectedPositionals = command === "call" ? 2 : 1;
  if (positionals.length !== expectedPositionals) throw new Error("Unexpected or missing positional arguments");
  let discoveryRequests = 0;
  // The suite dispatcher forwards directly after `flop call`.
  if (command?.startsWith("flop_")) {
    name = command;
    command = "call";
  }
  let request: ConsoleRequest;
  if (command === "list") request = { action: "tools" };
  else if (command === "estimate")
    request = {
      action: "estimate",
      input: {
        model: values.model ?? "",
        tokens: Number(values.tokens),
        outputTokens: Number(values["output-tokens"] ?? 500),
      },
    };
  else if (command === "call" && name) {
    const response = await service.handle({ action: "tools" }, "cli");
    discoveryRequests = response.requests;
    if (response.payload.kind !== "tools") throw new Error("Discovery failed");
    const tool = response.payload.catalog.tools.find((tool) => tool.name === name);
    if (!tool) throw new Error("Tool is absent from discovery");
    const properties = object(tool.inputSchema.properties ?? {});
    const args: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const argument of values.arg ?? []) {
      const equals = argument.indexOf("=");
      if (equals < 1) throw new Error("Arguments must have the form k=v");
      const key = argument.slice(0, equals);
      if (!Object.hasOwn(properties, key) || Object.hasOwn(args, key))
        throw new Error(`Unknown or duplicate argument: ${key}`);
      args[key] = fieldValue(object(properties[key]), argument.slice(equals + 1));
    }
    request = { action: "call", tool: name, args };
  } else throw new Error(help);
  const response = await service.handle(request, "cli");
  response.requests += discoveryRequests;
  if (!values.json)
    console.log(
      `FLOP devnet / ${response.cached ? "cached" : "live"} / served ${response.servedAt}\n${response.requests} upstream requests in this operation. No market-price or execution guarantee.`,
    );
  console.log(JSON.stringify(response, null, 2));
  if (response.payload.kind === "call" && response.payload.observation.check.status === "fail") process.exitCode = 2;
  if (
    response.payload.kind === "estimate" &&
    (response.payload.estimate.errors.length ||
      response.payload.estimate.gatewayError ||
      response.payload.estimate.observations.some((result) => result.check.status === "fail"))
  )
    process.exitCode = 2;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
