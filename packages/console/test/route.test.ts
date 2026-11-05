// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { POST } from "../../../apps/web/app/console/api/route";
import { parseConsoleResponse } from "../../../apps/web/app/console/response";
import { recordedConsole } from "../src/recorded";

describe("same-origin route boundary", () => {
  it("rejects cross-origin calls, non-JSON bodies and oversized streamed input", async () => {
    const request = (body: string, headers: Record<string, string> = {}) =>
      new Request("http://localhost:3500/console/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
      });
    expect((await POST(request("{}", { origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request("{}", { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("x".repeat(32769)))).status).toBe(413);
    expect((await POST(request("["))).status).toBe(400);
    expect((await POST(request("[", { origin: "http://127.0.0.1:3500", host: "127.0.0.1:3500" }))).status).toBe(400);
    expect((await POST(request("{}", { origin: "null" }))).status).toBe(403);
    expect((await POST(request('{"action":"write"}'))).status).toBe(400);
  });
  it("checks nested proxy responses before the browser uses them", () => {
    const response = {
      payload: { kind: "call", observation: recordedConsole().stats },
      cached: true,
      servedAt: "2026-11-05T23:31:00Z",
      requests: 0,
      budgetRemaining: 19,
    };
    expect(parseConsoleResponse(response).payload.kind).toBe("call");
    expect(() => parseConsoleResponse({ ...response, payload: { kind: "call", observation: {} } })).toThrow();
    expect(() => parseConsoleResponse({ ...response, requests: "zero" })).toThrow();
  });
});
