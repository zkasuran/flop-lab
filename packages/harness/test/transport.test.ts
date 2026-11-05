// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { Transport, GATEWAY, MAX_BODY_BYTES } from "../src/transport";
import { Context } from "../src/context";

it("counts retries against the physical request budget and honours Retry-After", async () => {
  let calls = 0;
  const waits: number[] = [];
  const transport = new Transport({
    maxRequests: 2,
    intervalMs: 0,
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetch: async () =>
      ++calls === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "2" } }) : new Response("{}"),
  });
  await transport.models();
  expect(calls).toBe(2);
  expect(transport.requests).toBe(2);
  expect(waits).toContain(2000);
  expect(transport.evidence[0]?.status).toBe(429);
});

it("does not retry permanent HTTP errors", async () => {
  const transport = new Transport({ fetch: async () => new Response("no", { status: 403 }) });
  await expect(transport.models()).rejects.toThrow("403");
  expect(transport.requests).toBe(1);
});

it("rejects redirects and endpoints outside the public allowlist", async () => {
  const transport = new Transport({
    fetch: async (_url, init) => {
      expect(init?.redirect).toBe("error");
      return new Response("{}");
    },
  });
  await expect(transport.fetch("https://example.com")).rejects.toThrow("allowlist");
  expect(transport.requests).toBe(0);
  await transport.models();
});

it("bounds response memory before parsing JSON", async () => {
  const transport = new Transport({ fetch: async () => new Response("x".repeat(MAX_BODY_BYTES + 1)) });
  await expect(transport.models()).rejects.toThrow("byte limit");
  expect(transport.evidence[0]?.response).toBe("");
});

it("spaces requests and records cache-hit provenance without a new request", async () => {
  const waits: number[] = [];
  const transport = new Transport({
    intervalMs: 500,
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetch: async () => new Response("{}"),
  });
  const context = new Context(transport);
  await context.models();
  const original = [...context.used];
  context.used.clear();
  await context.models();
  expect(transport.requests).toBe(1);
  expect([...context.used]).toEqual(original);
  context.fresh();
  await context.models();
  expect(transport.requests).toBe(2);
  expect(waits.some((ms) => ms > 0)).toBe(true);
  expect(
    transport.evidence.every(
      (item) => item.request.url === GATEWAY && item.durationMs >= 0 && Date.parse(item.measuredAt) > 0,
    ),
  ).toBe(true);
});

it("serializes concurrent reads before enforcing the global ceiling", async () => {
  let active = 0;
  let peak = 0;
  const transport = new Transport({
    maxRequests: 1,
    intervalMs: 0,
    fetch: async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return new Response("{}");
    },
  });
  const results = await Promise.allSettled([transport.models(), transport.models()]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(peak).toBe(1);
  expect(transport.requests).toBe(1);
});
