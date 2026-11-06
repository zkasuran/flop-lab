#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { Transform } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, createSuite, listTools } from "./index";

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      recorded: { type: "boolean" },
      list: { type: "boolean" },
      call: { type: "string" },
      args: { type: "string" },
    },
  });
  if (values.help) {
    console.log(
      "flop-lab-mcp [--recorded]\nStdio MCP server. Stdout contains protocol messages only.\n--list prints tools/list JSON.\n--call <name> --args '<JSON>' runs a single tool.\nRecorded mode uses bundled observations. No wallets or transactions.",
    );
    return;
  }
  if (values.list) {
    console.log(JSON.stringify(listTools(), null, 2));
    return;
  }
  if (values.call) {
    console.log(
      JSON.stringify(
        await createSuite({ recorded: values.recorded }).call(values.call, JSON.parse(values.args ?? "{}")),
        null,
        2,
      ),
    );
    return;
  }
  if (values.args) throw new Error("--args requires --call");
  // Bound one newline-delimited request before the SDK buffers it.
  let bytes = 0;
  const input = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      for (const byte of chunk) {
        if (byte === 10) bytes = 0;
        else if (++bytes > 131072) {
          done(new Error("MCP request exceeds 128 KiB"));
          return;
        }
      }
      done(null, chunk);
    },
  });
  const server = createServer({ recorded: values.recorded });
  const transport = new StdioServerTransport(process.stdin.pipe(input), process.stdout);
  const close = async () => {
    await server.close();
    process.stdin.unpipe(input);
    process.stdin.destroy();
  };
  input.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    void close();
  });
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  await server.connect(transport);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
