#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { serve } from "@hono/node-server";
import { createDemo } from "./demo.js";
import { parseQuote } from "./protocol.js";
import { checkExchange } from "./checker.js";
import { createMockService, probeLocal, runMockClient } from "./reference.js";

const [command, value] = process.argv.slice(2);
try {
  if (!command || command === "--help") {
    console.log(
      "flop-x402 serve [port]\nflop-x402 inspect <response-headers.json>\nflop-x402 serve-mock [port]\nflop-x402 client <http://127.0.0.1:port/paid>\nflop-x402 check <exchange.json | loopback-url>\ncheck accepts a transcript or {exchange, ...} client output. Exit 2: deviations. Exit 3: incomplete.\nRead-only reference. Mock tokens are not payments. Payment execution is UNVERIFIED.",
    );
  } else if (command === "serve" || command === "serve-mock") {
    const port = Number(value ?? 3590);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Use an unprivileged port from 1024 to 65535");
    serve({
      fetch: command === "serve-mock" ? createMockService().fetch : createDemo().fetch,
      port,
      hostname: "127.0.0.1",
    });
    console.log(
      `Local reference: http://127.0.0.1:${port}/${command === "serve-mock" ? "paid" : "preview"}\nPayment execution: UNVERIFIED`,
    );
  } else if (command === "client" && value) {
    const result = await runMockClient(value);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.error
      ? 1
      : result.report.outcome === "deviations"
        ? 2
        : result.report.outcome === "incomplete"
          ? 3
          : 0;
  } else if (command === "check" && value) {
    let result;
    if (/^https?:/.test(value)) result = (await probeLocal(value)).report;
    else {
      const { readFile, stat } = await import("node:fs/promises");
      if ((await stat(value)).size > 131072) throw new Error("Exchange exceeds 128 KiB");
      const raw: unknown = JSON.parse(await readFile(value, "utf8"));
      result = checkExchange(raw && typeof raw === "object" && "exchange" in raw ? raw.exchange : raw);
    }
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.outcome === "deviations" ? 2 : result.outcome === "incomplete" ? 3 : 0;
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
