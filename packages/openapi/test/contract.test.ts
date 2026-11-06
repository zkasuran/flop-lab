// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { execFileSync } from "node:child_process";
import { GET } from "../../../apps/web/app/api/v1/[endpoint]/route";
import { createApi, endpoints, openapiDocument, parseResult, readResult } from "../src/index";

const request = (path = "models", method = "GET", ip = "192.0.2.1") =>
  new Request(`http://localhost/api/v1/${path}`, { method, headers: { "x-test-ip": ip } });
const address = (request: Request) => request.headers.get("x-test-ip")!;
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const document = openapiDocument();
function validate(name: string, value: unknown) {
  const check = ajv.compile({ $ref: `#/components/schemas/${name}`, components: document.components });
  expect(check(value), JSON.stringify(check.errors)).toBe(true);
}

describe("published response contracts", () => {
  it("recomputes every bundled summary through upstream fixture validators", () => {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/record.ts", "--check"], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
    });
  });
  it.each(endpoints)("validates the actual Next handler for %s", async (tool) => {
    const response = GET(request(tool));
    expect(response.status).toBe(200);
    validate(tool, await response.json());
  });
  it.each(endpoints)("serves %s against its exact document schema", async (tool) => {
    const response = createApi()(request(tool));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const ref = document.paths[`/api/v1/${tool}`]!.get.responses["200"].content["application/json"].schema.$ref;
    validate(ref.split("/").at(-1)!, body);
    expect(body).toEqual(readResult(tool));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("serves its document and bodyless HEAD", async () => {
    const api = createApi();
    validate("OpenAPIDocument", await api(request("openapi.json")).json());
    expect(await api(request("models", "HEAD")).text()).toBe("");
    expect(await api(request("missing", "HEAD")).text()).toBe("");
  });
  it.each([
    ["missing", "GET", 404],
    ["models?live=1", "GET", 400],
    ["models", "POST", 405],
  ] as const)("rejects %s %s", async (path, method, status) => {
    const response = createApi()(request(path, method));
    expect(response.status).toBe(status);
    validate("Error", await response.json());
  });
  it("rejects malformed, empty and hostile result bodies", () => {
    for (const input of [
      null,
      [],
      {},
      "text",
      { ...readResult("models"), extra: true },
      { ...readResult("models"), sources: [] },
      { ...readResult("models"), measuredAt: "2026-01-01T00:00:00Z" },
    ])
      expect(() => parseResult("models", input)).toThrow();
    const result = readResult("models");
    result.summary!.outcomes.PASS = -1;
    expect(() => parseResult("models", result)).toThrow();
  });
  it("rejects contradictory outcomes and preserves unknown results", () => {
    const result = readResult("models");
    expect(result.summary!.outcomes.UNKNOWN).toBeGreaterThan(0);
    result.summary!.metrics.checks!++;
    expect(() => parseResult("models", result)).toThrow("Outcome totals");
    const missing = {
      ...readResult("models"),
      mode: "unavailable",
      measuredAt: null,
      sources: [],
      recordings: [],
      summary: null,
    };
    expect(parseResult("models", missing).summary).toBeNull();
    expect(() => parseResult("models", { ...missing, summary: result.summary })).toThrow();
  });
  it("returns a documented 503 instead of invalid evidence", async () => {
    const response = createApi({ load: () => ({}) })(request());
    expect(response.status).toBe(503);
    validate("Error", await response.json());
  });
  it("shares the IP quota across endpoints and documents and resets exactly at the boundary", async () => {
    let time = 0;
    const api = createApi({ now: () => time, address });
    for (let i = 0; i < 60; i++) expect(api(request(i % 2 ? "models" : "openapi.json")).status).toBe(200);
    const denied = api(request("harness"));
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
    validate("Error", await denied.json());
    expect(api(request("models", "GET", "192.0.2.2")).status).toBe(200);
    time = 59_999;
    expect(api(request()).status).toBe(429);
    time = 60_000;
    expect(api(request()).status).toBe(200);
  });
  it("normalizes IPv6 and bounds attacker-controlled quota storage", () => {
    const api = createApi({ address, now: () => 0 });
    for (let i = 0; i < 60; i++) api(request("models", "GET", "2001:db8::1"));
    expect(api(request("models", "GET", "2001:0db8:0:0:0:0:0:1")).status).toBe(429);
    for (let i = 1; i < 4096; i++)
      expect(api(request("models", "GET", `10.0.${Math.floor(i / 256)}.${i % 256}`)).status).toBe(200);
    expect(api(request("models", "GET", "192.0.2.5")).status).toBe(429);
    expect(api(request("models", "GET", "2001:db8::1")).status).toBe(429);
  });
  it("expires cached bodies without advancing evidence timestamps", async () => {
    let time = 0;
    const load = vi.fn(readResult);
    const api = createApi({ load, now: () => time });
    const first: unknown = await api(request()).json();
    time = 299_999;
    expect(await api(request()).json()).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
    time = 300_000;
    expect(await api(request()).json()).toEqual(first);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
