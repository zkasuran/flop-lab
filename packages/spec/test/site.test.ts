// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../apps/web/app/spec/report/route";
import type { Report } from "../src/model";

afterEach(() => vi.restoreAllMocks());

describe("site report download", () => {
  it("serves a dated attachment without contacting public services", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network must not be used"));
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="flop-spec-recorded.json"');
    const report = (await response.json()) as Report;
    expect(report.mode).toBe("recorded");
    expect(report.lastCompared).toBe("2026-11-05T20:44:57.681Z");
    expect(report.sha).toBe("2a2cc8218048a2933071bb2f45d75335560e39d8");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves both quoted sides, line anchors and uncertainty across JSON transport", async () => {
    const report = (await GET().json()) as Report;
    const supply = report.differences.find((d) => d.id === "A:genesis_supply")!;
    expect(supply.result).toBe("MATCH");
    expect(supply.spec?.evidence.source).toBe(
      `https://github.com/flop-labs/yellowpaper/blob/${report.sha}/yellowpaper.md#L2738`,
    );
    expect(supply.spec?.evidence.quote).toContain('id="param-genesis_supply"');
    expect(supply.runtime?.evidence.quote).toContain("4_400_000_000");
    expect(supply.runtime?.evidence.source).toBe("https://mcp.flop.network/mcp#flop_knowledge_get");
    expect(supply.runtime?.evidence.measuredAt).toBe("2026-11-05T20:44:54.666Z");
    expect(supply.reason).toContain("does not verify deployed storage");
    const call = report.differences.find((d) => d.id === "G:compute_channel.top_up_escrow")!;
    expect(call.result).toBe("UNOBSERVABLE");
    expect(call.needed).toContain("ordered argument names");
    expect(report.warnings).toContain("provenance unavailable: repo sources are not mounted next to the catalog");
  });
});
