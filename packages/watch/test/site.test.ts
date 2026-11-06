// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { recordedReplay, initialConfig } from "../../../apps/web/app/watch/data";
import { parseReplay } from "../../../apps/web/app/watch/schema";
import { POST } from "../../../apps/web/app/watch/replay/route";
import { rulesYaml } from "../src/config";
describe("recorded page boundary", () => {
  it("keeps timestamps, request counts, raw links and no-alert replay tied to saved polls", () => {
    const r = parseReplay(recordedReplay(initialConfig));
    expect(r.requests).toBe(8);
    expect(r.polls.map((p) => p.alerts.length)).toEqual([0, 0]);
    expect(r.startedAt).toBe("2026-11-06T04:45:55.439Z");
    expect(r.polls.every((p) => p.recording.endsWith(`${p.startedAt.replaceAll(":", "-")}.json`))).toBe(true);
    expect(() => parseReplay({ ...r, requests: 0 })).toThrow("total");
    const hostile = structuredClone(r);
    hostile.polls[0]!.observations[0]!.source = "javascript:alert(1)";
    expect(() => parseReplay(hostile)).toThrow("source");
  });
  it("replays valid rules without delivering configured webhooks and rejects malformed or oversized YAML", async () => {
    const config = {
      ...initialConfig,
      outputs: [{ kind: "webhook" as const, url: "https://example.invalid/never-called" }],
    };
    const request = (body: string) => new Request("http://localhost:3740/watch/replay", { method: "POST", body });
    const response = await POST(request(rulesYaml(config)));
    expect(response.status).toBe(200);
    expect(parseReplay(await response.json()).requests).toBe(8);
    expect((await POST(request("version: 9"))).status).toBe(400);
    expect((await POST(request("a".repeat(64_001)))).status).toBe(413);
    const missing = {
      ...initialConfig,
      rules: [{ id: "claim", kind: "claim-change" as const, claim: "gateway-contract", report: "harness.json" }],
    };
    const report = parseReplay(await (await POST(request(rulesYaml(missing)))).json());
    expect(report.polls.every((p) => p.notes.includes("claim: no observation"))).toBe(true);
  });
});
