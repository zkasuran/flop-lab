// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import { ScriptedService, endpoints } from "../src/mock.ts";
import { catalogue } from "../src/catalogue.ts";

it("replays recorded MCP SSE with the one shared client", async () => {
  const recording = JSON.parse(await readFile(new URL("../fixtures/mcp.json", import.meta.url), "utf8")) as {
    raw: string;
    source: string;
    measuredAt: string;
  };
  expect(recording.source).toBe("https://mcp.flop.network/mcp");
  expect(Number.isFinite(Date.parse(recording.measuredAt))).toBe(true);
  const service = new ScriptedService([{ body: recording.raw, headers: { "content-type": "text/event-stream" } }]);
  const mcp = new McpClient({ url: endpoints.mcp, fetch: service.fetch, retries: 0 });
  const response = await mcp.callTool("flop_get_stats");
  expect(response.value).toBeTypeOf("object");
  expect(service.trace).toHaveLength(1);
  expect(JSON.parse(service.trace[0]!.body!).params.name).toBe("flop_get_stats");
});
it("refuses an empty script, exhaustion and unexpected origins", async () => {
  expect(() => new ScriptedService([])).toThrow();
  const service = new ScriptedService([{ status: 429 }]);
  expect((await service.fetch(endpoints.gateway)).status).toBe(429);
  await expect(service.fetch(endpoints.gateway)).rejects.toThrow("exhausted");
  await expect(service.fetch("https://api.flop.network/v1/models")).rejects.toThrow("unexpected origin");
});
it("keeps malformed bodies and Retry-After unchanged", async () => {
  const service = new ScriptedService([{ status: 503, body: "{", headers: { "retry-after": "120" } }]);
  const response = await service.fetch(endpoints.faucet);
  expect(response.headers.get("retry-after")).toBe("120");
  await expect(response.json()).rejects.toThrow();
  expect(service.trace[0]?.status).toBe(503);
});
it("preserves method, body and headers from Request inputs", async () => {
  const service = new ScriptedService([{ body: "{}" }]);
  await service.fetch(
    new Request(endpoints.gateway, { method: "POST", body: "fixture", headers: { "idempotency-key": "unit" } }),
  );
  expect(service.trace[0]).toMatchObject({ method: "POST", body: "fixture", headers: { "idempotency-key": "unit" } });
});
it("pins citations to recorded published files", async () => {
  for (const sdk of ["sdk", "client", "cli"] as const) {
    const recording = JSON.parse(await readFile(new URL(`../fixtures/${sdk}-docs.json`, import.meta.url), "utf8")) as {
      documents: { path: string; base64: string }[];
    };
    for (const spec of catalogue.filter((s) => s.sdk === sdk && s.citation.source.startsWith("https://unpkg.com"))) {
      const path = spec.citation.source.split(`@${spec.version}/`)[1];
      const doc = recording.documents.find((d) => d.path === path);
      expect(doc, spec.id).toBeDefined();
      // Quotes may join adjacent comment/declaration fragments with a slash.
      const text = Buffer.from(doc!.base64, "base64").toString("utf8").replace(/\s+/g, " ");
      for (const part of spec.citation.quote.split(" / ")) {
        expect(text, spec.id).toContain(part.replace(/\s+/g, " "));
      }
    }
  }
});
