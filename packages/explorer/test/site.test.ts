// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { createSearchService } from "../../../apps/web/app/explorer/service";
import { recordedExploration } from "../src/recorded";
import { SearchBudget } from "../src/budget";

describe("public explorer admission", () => {
  it("serves recorded real data without invoking public MCP", async () => {
    const search = vi.fn();
    const handle = createSearchService({ search });
    const response = await handle(new Request("https://example.test/explorer/query?recorded=channel"));
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("recorded");
    expect(search).not.toHaveBeenCalled();
  });
  it("rejects invalid input before using the budget or client", async () => {
    const search = vi.fn(),
      budget = new SearchBudget();
    const take = vi.spyOn(budget, "take");
    const handle = createSearchService({ search }, budget);
    const response = await handle(new Request("https://example.test/explorer/query?q=bad-input"));
    expect(response.status).toBe(400);
    expect(take).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
  it("sets a private cookie and refuses the fourth visitor search before IO", async () => {
    const search = vi.fn(async () => ({ ...recordedExploration("block"), mode: "live" as const }));
    const handle = createSearchService({ search });
    const url = "https://example.test/explorer/query?q=2990806";
    const response = await handle(new Request(url));
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const request = () => new Request(url, { headers: { cookie: cookie.split(";")[0]! } });
    expect((await handle(request())).status).toBe(200);
    expect((await handle(request())).status).toBe(200);
    const denied = await handle(request());
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(search).toHaveBeenCalledTimes(3);
  });
});
