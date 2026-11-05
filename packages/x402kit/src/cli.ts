#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { serve } from "@hono/node-server";
import { createDemo } from "./demo.js";
import { parseQuote } from "./protocol.js";

const [command, value] = process.argv.slice(2);
try {
  if (!command || command === "--help") {
    console.log(
      "flop-x402 serve [3350..3359]\nflop-x402 inspect <response-headers.json>\nRead-only reference. Payment execution is UNVERIFIED.",
    );
  } else if (command === "serve") {
    const port = Number(value ?? 3350);
    if (!Number.isInteger(port) || port < 3350 || port > 3359) throw new Error("Use a port from 3350 to 3359");
    serve({ fetch: createDemo().fetch, port, hostname: "127.0.0.1" });
    console.log(`Read-only demo: http://127.0.0.1:${port}/preview\nPayment execution: UNVERIFIED`);
  } else if (command === "inspect" && value) {
    const { readFile } = await import("node:fs/promises");
    const raw: unknown = JSON.parse(await readFile(value, "utf8"));
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      !Object.values(raw).every((v) => typeof v === "string")
    )
      throw new Error("Expected a JSON object of header strings");
    console.log(JSON.stringify(parseQuote(new Response(null, { headers: raw as Record<string, string> })), null, 2));
  } else throw new Error("Unknown command. Use flop-x402 --help");
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
