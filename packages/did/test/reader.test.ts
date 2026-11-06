// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { allowedUrl, cachedReader } from "../src/reader.js";

const directories: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "did-test-"));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true });
});
const source = "https://technocore.chat/r/technocore?format=json&limit=100";

it("shares cached responses and budget across fresh reader instances", async () => {
  const dir = await directory();
  let now = Date.parse("2026-11-06T00:00:00Z");
  const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
  const options = { fetch: fetcher, now: () => now, budget: 1 };
  const first = await cachedReader(dir, options)(source);
  expect(await cachedReader(dir, options)(source)).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(cachedReader(dir, options)("https://technocore.chat/kv/did/example")).rejects.toThrow(
    "budget exhausted",
  );
  now += 3_600_001;
  await cachedReader(dir, options)(source);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([429, 500, 503])("backs off after HTTP %i without a retry loop", async (status) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response("busy", { status, headers: { "Retry-After": "7200" } }));
  const read = cachedReader(await directory(), { fetch: fetcher });
  expect((await read(source)).status).toBe(status);
  await expect(read("https://technocore.chat/kv/did/example")).rejects.toThrow("backoff");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("serializes concurrent reads into one network request", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
  const read = cachedReader(await directory(), { fetch: fetcher });
  await Promise.all([read(source), read(source)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("refuses oversized responses and caches network failure backoff", async () => {
  const read = cachedReader(await directory(), { fetch: async () => new Response("x".repeat(200_001)) });
  await expect(read(source)).rejects.toThrow("200 KB");
  const fetcher = vi.fn<typeof fetch>(async () => {
    throw new Error("offline");
  });
  const fail = cachedReader(await directory(), { fetch: fetcher });
  await expect(fail(source)).rejects.toThrow("offline");
  await expect(fail(source)).rejects.toThrow("backoff");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  "http://technocore.chat/r/lobby",
  "https://evil.example/r/lobby",
  "https://technocore.chat/r/lobby/say/x/write",
  "https://technocore.chat/kv/did/example/set/write",
  "https://technocore.chat/r/lobby?wait=10",
  "https://technocore.chat@evil.example/r/lobby",
  "https://technocore.chat/r/../config",
])("refuses unsafe read %s", (url) => expect(() => allowedUrl(url)).toThrow());
