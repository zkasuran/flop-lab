// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("coalesces reads and reuses a validated page within its TTL", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response("[]", { headers: { Link: '<https://api.github.com/ignored>; rel="next"' } }));
  vi.stubGlobal("fetch", fetch);
  const { getPullPage, GITHUB_TTL } = await import("../lib/github");
  const now = Date.now();
  const [one, two] = await Promise.all([getPullPage(1, now), getPullPage(1, now)]);
  expect(one).toEqual(two);
  expect(one.next).toBe(true);
  await getPullPage(1, now + GITHUB_TTL - 1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("retains dated values and pauses all pages after a rate limit", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("[]"))
    .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "120" } }));
  vi.stubGlobal("fetch", fetch);
  const { getPullPage, GITHUB_TTL } = await import("../lib/github");
  const now = Date.now();
  const first = await getPullPage(1, now);
  const stale = await getPullPage(1, now + GITHUB_TTL);
  expect(stale.stale).toBe(true);
  expect(stale.measuredAt).toBe(first.measuredAt);
  await expect(getPullPage(2, now + GITHUB_TTL + 1)).rejects.toThrow("paused");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("rejects malformed fresh data and hostile cached links", async () => {
  sessionStorage.setItem(
    "flop-prs-v1-1",
    JSON.stringify({ prs: [{ html_url: "javascript:alert(1)" }], measuredAt: new Date().toISOString(), next: false }),
  );
  const fetch = vi.fn().mockResolvedValue(new Response('{"message":"not a list"}'));
  vi.stubGlobal("fetch", fetch);
  const { getPullPage } = await import("../lib/github");
  await expect(getPullPage(1)).rejects.toThrow("Invalid GitHub");
  expect(fetch).toHaveBeenCalledTimes(1);
});
