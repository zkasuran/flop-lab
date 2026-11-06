// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { boundedFetch, withNetworkBudget } from "../src/network";

afterEach(() => vi.unstubAllGlobals());
it("rejects endpoints outside the fixed public allowlist before fetch", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(withNetworkBudget(() => boundedFetch("http://localhost:3520"))).rejects.toThrow("allowlist");
  expect(fetcher).not.toHaveBeenCalled();
});
it("caps physical requests even if a package retries", async () => {
  const fetcher = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", fetcher);
  await withNetworkBudget(async () => {
    for (let i = 0; i < 40; i++) await boundedFetch("https://mcp.flop.network/mcp");
    await expect(boundedFetch("https://mcp.flop.network/mcp")).rejects.toThrow("budget");
  });
  expect(fetcher).toHaveBeenCalledTimes(40);
});
it("rejects oversized bodies rather than passing truncated evidence", async () => {
  vi.stubGlobal("fetch", async () => new Response("x".repeat(196609)));
  await expect(withNetworkBudget(() => boundedFetch("https://mcp.flop.network/mcp"))).rejects.toThrow("192 KiB");
});
