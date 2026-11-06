// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/devnet.json";
import timeout from "./fixtures/gateway-timeout.json";
import { catalogue, expiry } from "../src/catalogue";
import { parseGateway, parseRecording } from "../src/schema";

function alter(key: string, transform: (v: Record<string, unknown>) => unknown) {
  const copy = structuredClone(fixture);
  const observation = copy.observations.find((o) => o.key === key)!;
  observation.raw = JSON.stringify(transform(JSON.parse(observation.raw!) as Record<string, unknown>));
  return copy;
}
const report = catalogue(fixture);
const source = report.models.find((m) => m.gateway)!.gateway!.sources[0]!;

describe("recorded public model evidence", () => {
  it("joins the served model and keeps registry-only models separate", () => {
    expect(report.models).toHaveLength(3);
    expect(report.models.filter((m) => m.gateway)).toHaveLength(1);
    expect(report.models.find((m) => m.gateway)?.name).toBe("Qwen/Qwen2.5-0.5B-Instruct");
    expect(report.models.every((m) => m.checks.find((c) => c.id === "trust-hash")?.status === "PASS")).toBe(true);
    expect(report.checks.find((c) => c.id === "served-list-agreement")?.status).toBe("PASS");
    expect(report.errors).toEqual([]);
    expect(report.providers).toBe(0);
  });
  it("retains precise decimal strings and does not copy a model quote onto miners", () => {
    const served = report.models.find((m) => m.gateway)!;
    expect(served.gateway?.prompt).toBe("0.006");
    expect(served.pricing?.pricePerGflop).toBe(0.003);
    expect(served.gateway?.sources[0]).not.toHaveProperty("price");
  });
  it("cannot turn a missing registry entry into a pass", () => {
    const changed = alter("discover", (v) => ({ ...v, models: [], totalMatches: 0 }));
    expect(catalogue(changed).checks[0]?.status).toBe("FAIL");
  });
  it("detects served-set drift without counting dormant registrations", () => {
    const changed = alter("discover", (v) => ({
      ...v,
      models: (v.models as Record<string, unknown>[]).map((m) => ({ ...m, served: true })),
    }));
    expect(catalogue(changed).checks[2]?.status).toBe("FAIL");
  });
  it("does not trust a truncated discovery list or chain-only availability", () => {
    expect(catalogue(alter("discover", (v) => ({ ...v, totalMatches: 1001 }))).checks[2]?.status).toBe("UNKNOWN");
    expect(catalogue(alter("discover", (v) => ({ ...v, availabilitySource: "chain" }))).checks[2]?.status).toBe(
      "UNKNOWN",
    );
  });
  it("detects hash disagreement and mismatched detail responses", () => {
    const changed = catalogue(alter("trust", (v) => ({ ...v, models: [] })));
    expect(changed.models.every((m) => m.checks[2]?.status === "FAIL")).toBe(true);
    const model = report.models.find((m) => m.gateway)!;
    const bad = catalogue(alter(`info:${model.id}`, (v) => ({ ...v, modelHash: `0x${"a".repeat(64)}` }))).models.find(
      (m) => m.gateway,
    )!;
    expect(bad.checks[1]?.status).toBe("FAIL");
    expect(bad.info).toBeNull();
  });
  it("keeps outages and empty inputs unknown rather than vacuous passes", () => {
    expect(catalogue(timeout).checks.every((c) => c.status === "UNKNOWN")).toBe(true);
    expect(catalogue({ ...fixture, observations: [] }).checks.every((c) => c.status === "UNKNOWN")).toBe(true);
    const empty = catalogue(alter("gateway", () => ({ data: [] })));
    expect(empty.checks[0]?.status).toBe("UNKNOWN");
    expect(empty.checks[1]?.status).toBe("UNKNOWN");
  });
  it("rejects duplicates, invalid prices, malformed JSON and foreign evidence URLs", () => {
    const raw: unknown = JSON.parse(fixture.observations.find((o) => o.key === "gateway")!.raw!);
    const gateway = raw as { data: Record<string, unknown>[] };
    expect(() => parseGateway({ data: [...gateway.data, ...gateway.data] })).toThrow("Duplicate");
    const m = gateway.data[0]!;
    expect(() =>
      parseGateway({ data: [m, { ...m, "x-flop": { ...(m["x-flop"] as object), registry_model: "other" } }] }),
    ).toThrow("Duplicate");
    expect(() => parseGateway({ data: [{ ...m, pricing: { prompt: "-0.1" } }] })).toThrow("price");
    const copy = structuredClone(fixture);
    copy.observations[0]!.raw = "<html>error</html>";
    expect(catalogue(copy).checks[0]?.status).toBe("UNKNOWN");
    copy.observations[0]!.source = "https://example.com";
    expect(() => parseRecording(copy)).toThrow("source URL");
  });
});

describe("timestamp boundaries", () => {
  it("expires exactly at the advertised instant", () => {
    expect(expiry(source, source.effectiveAt).state).toBe("fresh");
    expect(expiry(source, new Date(Date.parse(source.expiresAt) - 1).toISOString()).state).toBe("fresh");
    expect(expiry(source, source.expiresAt)).toEqual({ state: "expired", remainingMs: 0, fraction: 0 });
  });
  it("rejects future, reversed and invalid intervals", () => {
    expect(expiry(source, new Date(Date.parse(source.effectiveAt) - 1).toISOString()).state).toBe("not-yet-effective");
    expect(expiry({ ...source, expiresAt: source.effectiveAt }, source.effectiveAt).state).toBe("invalid");
    expect(() => expiry({ ...source, expiresAt: "yesterday" }, source.effectiveAt)).toThrow();
  });
  it("computes remaining duration from source timestamps", () => {
    const middle = new Date((Date.parse(source.effectiveAt) + Date.parse(source.expiresAt)) / 2).toISOString();
    expect(expiry(source, middle).fraction).toBe(0.5);
  });
  it("fails stale sources at read time and leaves empty source arrays unknown", () => {
    function gatewayWith(sources: unknown[]) {
      return alter("gateway", (v) => ({
        ...v,
        data: (v.data as Record<string, unknown>[]).map((m) => ({
          ...m,
          "x-flop": { ...(m["x-flop"] as object), price_sources: sources },
        })),
      }));
    }
    expect(catalogue(gatewayWith([])).checks[1]?.status).toBe("UNKNOWN");
    const rawSource = {
      miner_address: source.address,
      source: source.label,
      version: source.version,
      effective_at: "2020-01-01T00:00:00.000Z",
      expires_at: "2020-01-01T00:02:00.000Z",
    };
    expect(catalogue(gatewayWith([rawSource])).checks[1]?.status).toBe("FAIL");
  });
});
