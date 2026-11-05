// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  accessRequest,
  assessClock,
  evaluate,
  overall,
  type Evidence,
  type Inventory,
  type Report,
} from "../src/index.js";
import {
  clockInterval,
  isPinnedImage,
  parseCpu,
  parseDigests,
  parseDisk,
  parseGpu,
  parseMemory,
  parseModels,
} from "../src/parse.js";
import { sources } from "../src/requirements.js";
import cases from "./fixtures/probe-cases.json";

const evidence = <T>(value: T): Evidence<T> => ({
  source: "synthetic test fixture",
  measuredAt: "2026-11-05T00:00:00.000Z",
  durationMs: 0,
  value,
  reason: null,
});
const missing = <T>(): Evidence<T> => ({ ...evidence<T | null>(null), reason: "Missing tool" });
function inventory(): Inventory {
  return {
    os: evidence({ platform: "linux", arch: "x64" }),
    gpu: evidence(parseGpu(cases.gpu.a40)),
    cpu: evidence(16),
    memory: evidence(parseMemory(cases.memory.valid)),
    disk: evidence(parseDisk(cases.disk.valid)),
    docker: evidence("28.0.1"),
    compose: evidence("2.39.0"),
    images: {},
    ports: [],
    clocks: [],
    models: evidence(["qwen/qwen2.5-0.5b-instruct"]),
  };
}
const result = (role: "miner" | "validator", i: Inventory, id: string) => evaluate(role, i).find((r) => r.id === id)!;

describe("strict probe boundaries", () => {
  it("parses GPU bytes without pooling separate devices", () => {
    expect(parseGpu(cases.gpu.a40)[0]?.totalBytes).toBe(46068 * 1024 ** 2);
    expect(parseGpu(cases.gpu.none)).toEqual([]);
    const i = inventory();
    i.gpu = evidence(parseGpu(cases.gpu.twoSmall));
    expect(result("miner", i, "gpu").status).toBe("NOT_READY");
  });
  it.each([
    cases.gpu.oddLocale,
    cases.gpu.invalid,
    cases.gpu.injection,
    "NVIDIA A40, 100, 101",
    "NVIDIA A40, 99999999999999999999, 0",
  ])("rejects malformed GPU data %s", (raw) => expect(() => parseGpu(raw)).toThrow());
  it("keeps installed filesystem capacity separate from free space", () => {
    expect(parseDisk(cases.disk.valid)).toEqual({ totalBytes: 4_000_000_000_000, availableBytes: 1_000_000_000_000 });
    expect(parseDisk(cases.disk.oddHeader)).toEqual(parseDisk(cases.disk.valid));
    expect(() => parseDisk(cases.disk.badLocale)).toThrow();
    expect(() => parseDisk(cases.disk.impossible)).toThrow();
    expect(() => parseDisk("")).toThrow();
  });
  it("rejects missing capacity, invalid units and processor counts", () => {
    expect(parseMemory(cases.memory.valid).totalBytes).toBe(64000000 * 1024);
    expect(() => parseMemory(cases.memory.missing)).toThrow();
    expect(() => parseMemory(cases.memory.valid + cases.memory.valid)).toThrow();
    expect(parseCpu(cases.cpu.valid)).toBe(8);
    for (const raw of [cases.cpu.invalid, cases.cpu.zero, "-1", "Infinity", ""]) expect(() => parseCpu(raw)).toThrow();
  });
  it("requires versioned pin and matching installed digest", () => {
    const ref = "repo:v1.2.3@sha256:" + "a".repeat(64);
    expect(isPinnedImage(ref)).toBe(true);
    expect(isPinnedImage("repo:latest")).toBe(false);
    expect(isPinnedImage("repo@sha256:" + "a".repeat(64))).toBe(false);
    expect(parseDigests(cases.docker.digests, ref)).toBe(true);
    expect(parseDigests(cases.docker.digests, ref.replace(/a/g, "b"))).toBe(false);
    expect(parseDigests(cases.docker.noDigests, ref)).toBe(false);
    expect(() => parseDigests(cases.docker.badDigests, ref)).toThrow();
  });
  it("validates recorded live model response and hostile variants", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/models.json", import.meta.url), "utf8")) as {
      raw: string;
    };
    expect(parseModels(JSON.parse(fixture.raw)).length).toBeGreaterThan(0);
    expect(parseModels({ data: [] })).toEqual([]);
    for (const raw of [null, {}, { data: [null] }, { data: [{ id: "<script>" }] }])
      expect(() => parseModels(raw)).toThrow();
  });
});

describe("honest readiness", () => {
  it("does not mistake hardware capacity for admission", () => {
    const rows = evaluate("miner", inventory());
    expect(rows.find((r) => r.id === "gpu")?.status).toBe("READY");
    expect(overall(rows.map((r) => r.status))).toBe("UNKNOWN");
    expect(result("miner", inventory(), "model-fit").status).toBe("UNKNOWN");
    expect(result("miner", inventory(), "disk").status).toBe("UNKNOWN");
  });
  it("fails below the GPU floor and treats missing tools as unknown", () => {
    const i = inventory();
    i.gpu = evidence([]);
    expect(result("miner", i, "gpu").status).toBe("NOT_READY");
    i.gpu = missing();
    expect(result("miner", i, "gpu").status).toBe("UNKNOWN");
    expect(result("validator", i, "gpu").status).toBe("READY");
    i.docker = missing();
    expect(result("miner", i, "docker").status).toBe("UNKNOWN");
  });
  it("checks below-profile CPU and RAM without inventing ECC or physical cores", () => {
    const i = inventory();
    expect(result("validator", i, "cpu").status).toBe("UNKNOWN");
    expect(result("validator", i, "ram").status).toBe("UNKNOWN");
    i.cpu = evidence(7);
    i.memory = evidence({ totalBytes: 31_999_999_999, availableBytes: 1 });
    expect(result("validator", i, "cpu").status).toBe("NOT_READY");
    expect(result("validator", i, "ram").status).toBe("NOT_READY");
    i.cpu = evidence(8);
    i.memory = evidence({ totalBytes: 32_000_000_000, availableBytes: 1 });
    expect(result("validator", i, "cpu").status).toBe("UNKNOWN");
    expect(result("validator", i, "ram").status).toBe("UNKNOWN");
  });
  it("fails unsupported host and missing digest but preserves uncertain port results", () => {
    const i = inventory();
    i.os = evidence({ platform: "darwin", arch: "arm64" });
    i.images.worker = evidence({ pinned: true, digestPresent: false });
    i.ports = [evidence({ port: 443, bound: true })];
    expect(result("miner", i, "os").status).toBe("NOT_READY");
    expect(result("miner", i, "image-worker").status).toBe("NOT_READY");
    expect(result("miner", i, "ports").status).toBe("UNKNOWN");
    expect(result("miner", i, "reachability").status).toBe("UNKNOWN");
  });
  it("aggregates fail closed, including no evidence", () => {
    expect(overall([])).toBe("UNKNOWN");
    expect(overall(["READY", "UNKNOWN"])).toBe("UNKNOWN");
    expect(overall(["UNKNOWN", "NOT_READY"])).toBe("NOT_READY");
    expect(overall(["READY"])).toBe("READY");
  });
});

describe("coarse clock observations", () => {
  const base = Date.parse("Thu, 05 Nov 2026 00:00:00 GMT");
  const sample = (offset: number) => ({
    date: "Thu, 05 Nov 2026 00:00:00 GMT",
    age: null,
    startMs: base + offset,
    endMs: base + offset + 40,
    elapsedMs: 40,
  });
  const clocks = (a: number, b: number) => [
    { ...evidence(sample(a)), source: "https://api.flop.network/v1/models" },
    { ...evidence(sample(b)), source: "https://explorer.devnet.flop.network" },
  ];
  it("includes rounding uncertainty rather than passing a near-zero estimate", () => {
    expect(clockInterval(sample(0))).toEqual([-40, 1000]);
    expect(assessClock(clocks(0, 0)).status).toBe("UNKNOWN");
  });
  it("requires consistent independent observations for gross skew", () => {
    expect(assessClock(clocks(5000, 5010)).status).toBe("NOT_READY");
    expect(assessClock(clocks(-5000, -5010)).status).toBe("NOT_READY");
    expect(assessClock(clocks(5000, -5000)).status).toBe("UNKNOWN");
    const same = clocks(5000, 5000);
    same[1]!.source = same[0]!.source;
    expect(assessClock(same).status).toBe("UNKNOWN");
  });
  it("rejects stale headers, wall-clock jumps and malformed timestamps", () => {
    expect(clockInterval({ ...sample(0), age: "60" })).toBeNull();
    expect(clockInterval({ ...sample(0), endMs: base + 2000 })).toBeNull();
    expect(clockInterval({ ...sample(0), date: "yesterday" })).toBeNull();
    expect(assessClock([]).status).toBe("UNKNOWN");
  });
});

describe("recorded provenance and public draft", () => {
  it("parses this host's recorded raw capacity outputs", async () => {
    const raw = JSON.parse(await readFile(new URL("./fixtures/host-probes.json", import.meta.url), "utf8")) as {
      disk: { raw: string };
      cpu: { raw: string };
      memory: { raw: string };
    };
    const report = JSON.parse(
      await readFile(new URL("./fixtures/example-miner.json", import.meta.url), "utf8"),
    ) as Report;
    expect(parseDisk(raw.disk.raw).totalBytes).toBe(report.inventory.disk.value?.totalBytes);
    expect(parseCpu(raw.cpu.raw)).toBe(report.inventory.cpu.value);
    expect(parseMemory(raw.memory.raw).totalBytes).toBe(report.inventory.memory.value?.totalBytes);
  });
  it("replays the recorded report through the current decision logic", async () => {
    const report = JSON.parse(
      await readFile(new URL("./fixtures/example-miner.json", import.meta.url), "utf8"),
    ) as Report;
    expect(evaluate("miner", report.inventory)).toEqual(report.requirements);
    const draft = accessRequest(report);
    expect(draft).toContain("### Public identifiers\nHost details omitted.");
    expect(draft).not.toMatch(/asuran|192\.168\.|\/home\//);
    expect(accessRequest({ ...report, host: "opt-in.example" })).toContain("Hostname: opt-in.example");
  });
  it("keeps each quote in the saved source response", async () => {
    const raw = (
      await Promise.all(
        ["miner", "validator", "economics", "yellowpaper"].map(async (name) => {
          const fixture = JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as {
            raw: string;
          };
          return fixture.raw
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<")
            .replace(/\s+/g, " ");
        }),
      )
    ).join(" ");
    for (const source of Object.values(sources))
      expect(raw, source.locator).toContain(source.quote.replace(/\s+/g, " "));
  });
});
