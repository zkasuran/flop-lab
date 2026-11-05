// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkArithmetic,
  parseEvidence,
  resultCode,
  sealEvidence,
  sealObservation,
  settlementRows,
  verifyEvidence,
} from "../src/index";
import type { Evidence } from "../src/index";
import { array, object } from "../src/schema";

const fixtures = new URL("../fixtures/", import.meta.url);
const load = (name: string): unknown => JSON.parse(readFileSync(new URL(name, fixtures), "utf8")) as unknown;
const original = parseEvidence(load("channel-1.json"));
const zeroHash = `0x${"00".repeat(32)}`;

async function edit(id: string, mutate: (data: Record<string, unknown>) => void): Promise<Evidence> {
  const bundle = structuredClone(original);
  const index = bundle.observations.findIndex((o) => o.id === id);
  const obs = bundle.observations[index]!;
  const data = object(JSON.parse(obs.raw!), "payload");
  mutate(data);
  const { sha256: _old, ...content } = obs;
  bundle.observations[index] = await sealObservation({ ...content, raw: JSON.stringify(data) });
  const { sha256: _bundleHash, ...rest } = bundle;
  return sealEvidence(rest);
}

async function status(bundle: Evidence, id: string) {
  return (await verifyEvidence(bundle)).checks.find((c) => c.id === id)?.status;
}

const settlementId = original.observations.find((o) => o.id.startsWith("settlements:"))!.id;
const first = (data: Record<string, unknown>) => object(array(data.data, "data")[0], "row");

describe("recorded public evidence", () => {
  it.each([1, 2, 3, 4, 5])("replays channel %i without promoting witness evidence to proof", async (index) => {
    const report = await verifyEvidence(load(`channel-${index}.json`));
    expect(report.exitCode).toBe(3);
    expect(report.checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(report.checks.find((c) => c.id === "escrow-conservation")?.status).toBe("PASS");
    expect(report.checks.find((c) => c.id === "settlement-event")?.status).toBe("PASS");
    for (const id of ["assurance-tier", "merkle-inclusion", "challenge-window", "price-consistency"])
      expect(report.checks.find((c) => c.id === id)?.status).toBe("UNVERIFIABLE");
  });

  it("audits the entire recorded tape including every unused-escrow case", () => {
    const observations = readdirSync(fixtures).filter((f) => /^settlements-\d+\.json$/.test(f));
    const rows = observations.flatMap((file) => {
      const observation = object(load(file), "observation");
      return array(object(JSON.parse(String(observation.raw)), "response").data, "data");
    });
    expect(rows).toHaveLength(336);
    expect(rows.every((row) => object(row, "row").cooperative === true)).toBe(true);
    expect(rows.some((row) => BigInt(String(object(row, "row").unusedEscrow)) > 0n)).toBe(true);
    for (const row of rows) expect(checkArithmetic(row).map((c) => c.status)).toEqual(["PASS", "PASS"]);
  });
});

describe("rehashed corruptions fail the relevant claim, not only integrity", () => {
  it.each(["escrow", "minerPaid", "unusedEscrow", "burned"])("detects one raw unit in %s", async (field) => {
    const bundle = await edit(settlementId, (data) => {
      const row = first(data);
      row[field] = (BigInt(String(row[field])) + 1n).toString();
    });
    expect(await status(bundle, "bundle-integrity")).toBe("PASS");
    expect(await status(bundle, "escrow-conservation")).toBe("FAIL");
  });
  it.each(["aggregateGn", "pricePerGflop"])("detects a changed %s ratio", async (field) => {
    const bundle = await edit(settlementId, (data) => {
      first(data)[field] = "1";
    });
    expect(await status(bundle, "display-price-ratio")).toBe("FAIL");
  });
  it.each(["modelHash", "measuredRoot"])("detects %s mismatch", async (field) => {
    expect(
      await status(
        await edit("channel", (data) => {
          data[field] = zeroHash;
        }),
        "model-registry",
      ),
    ).toBe("FAIL");
  });
  it.each(["models", "trust-root"])("detects missing captured membership in %s", async (id) => {
    expect(
      await status(
        await edit(id, (data) => {
          data.models = [];
        }),
        "model-registry",
      ),
    ).toBe("FAIL");
  });
  it.each(["minerPaid", "aggregateGn", "escrow", "burned", "agent", "miner", "marketKind"])(
    "detects channel %s disagreement",
    async (field) => {
      expect(
        await status(
          await edit("channel", (data) => {
            data[field] = "1";
          }),
          "channel-consistency",
        ),
      ).toBe("FAIL");
    },
  );
  it.each([
    "settlementKind",
    "settlementEvent",
    "cooperative",
    "settledBlock",
    "settledBlockHash",
    "extrinsicHash",
    "extrinsicIndex",
    "callSection",
    "callMethod",
    "settledAt",
  ])("detects %s provenance corruption", async (field) => {
    const bundle = await edit(settlementId, (data) => {
      const row = first(data);
      row[field] =
        typeof row[field] === "boolean"
          ? !row[field]
          : typeof row[field] === "number"
            ? Number(row[field]) + 1
            : "wrong";
    });
    expect(await status(bundle, "settlement-event")).toBe("FAIL");
  });
  it("rejects an extrinsic for another channel", async () => {
    const bundle = await edit("transaction", (data) => {
      object(data.transaction, "tx").args = JSON.stringify([zeroHash]);
    });
    expect(await status(bundle, "settlement-event")).toBe("FAIL");
  });
  it("rejects a failed transaction", async () => {
    const bundle = await edit("transaction", (data) => {
      object(data.transaction, "tx").success = 0;
    });
    expect(await status(bundle, "settlement-event")).toBe("FAIL");
  });
  it.each(["extrinsicIndex", "eventIndex", "timestamp", "callSection", "callMethod"])(
    "rejects inconsistent event reference %s",
    async (field) => {
      const bundle = await edit("channel", (data) => {
        const ref = object(data.settlement, "settlement");
        ref[field] = typeof ref[field] === "number" ? Number(ref[field]) + 1 : "wrong";
      });
      expect(await status(bundle, "settlement-event")).toBe("FAIL");
    },
  );
  it("rejects bad event amount grouping", async () => {
    const bundle = await edit("channel", (data) => {
      object(object(data.latestTransition, "transition").data, "data").minerPaid = "51,678,00,0000000021";
    });
    expect(await status(bundle, "settlement-event")).toBe("FAIL");
  });
  it("detects a forged assurance tier", async () => {
    expect(
      await status(
        await edit("channel", (data) => {
          data.assuranceTier = "Hard";
        }),
        "assurance-tier",
      ),
    ).toBe("FAIL");
  });
  it("detects impossible head and challenge dates", async () => {
    const head = await edit("head", (data) => {
      object(data.stats, "stats").latestBlockNumber = 0;
    });
    expect(await status(head, "challenge-window")).toBe("FAIL");
    const end = await edit("channel-index", (data) => {
      object(data.computeChannel, "channel").challengeEnd = 1;
    });
    expect(await status(end, "challenge-window")).toBe("FAIL");
  });
});

describe("hostile and empty inputs", () => {
  it.each([null, {}, [], "wrong", { ...original, version: 2 }])("rejects invalid envelope %j", async (value) => {
    expect((await verifyEvidence(value)).exitCode).toBe(1);
  });
  it("detects raw and metadata tampering before checking facts", async () => {
    const raw = structuredClone(original);
    raw.observations[0]!.raw += " ";
    expect((await verifyEvidence(raw)).checks).toHaveLength(1);
    expect((await verifyEvidence(raw)).exitCode).toBe(1);
    expect((await verifyEvidence({ ...original, capturedAt: "2026-11-06T10:00:00.000Z" })).exitCode).toBe(1);
  });
  it("makes absent evidence unverifiable rather than passing", async () => {
    const { sha256: _hash, ...rest } = original;
    const empty = await sealEvidence({ ...rest, observations: [] });
    const report = await verifyEvidence(empty);
    expect(report.exitCode).toBe(3);
    expect(report.checks.filter((c) => c.status === "PASS").map((c) => c.id)).toEqual(["bundle-integrity"]);
  });
  it("rejects duplicate matching settlements", async () => {
    const bundle = await edit(settlementId, (data) => {
      array(data.data, "data").push(first(data));
    });
    expect(await status(bundle, "settlement-record")).toBe("FAIL");
  });
  it("retains transport failures as missing evidence", async () => {
    const { sha256: _hash, ...rest } = original;
    const obs = await sealObservation({ ...rest.observations[0]!, raw: null, error: "HTTP 503" });
    // Drop the previous hash before sealing: hashes never include themselves.
    const { sha256: _old, ...unsigned } = obs;
    const bundle = await sealEvidence({
      ...rest,
      observations: [await sealObservation(unsigned), ...rest.observations.slice(1)],
    });
    expect(await status(bundle, "channel-consistency")).toBe("UNVERIFIABLE");
  });
  it("does not use receipt placeholders as proof", async () => {
    const { sha256: _hash, ...rest } = original;
    const receipt = await sealObservation({
      id: "receipt",
      tool: "flop_get_inference_receipt",
      source: "https://mcp.flop.network/mcp",
      args: { hash_lock: zeroHash },
      measuredAt: original.capturedAt,
      durationMs: 0,
      attempts: 1,
      raw: JSON.stringify({
        verified: true,
        teeVerified: true,
        modelHash: zeroHash,
        quoteDigest: zeroHash,
        simulated: true,
      }),
      error: null,
    });
    const bundle = await sealEvidence({ ...rest, observations: [...rest.observations, receipt] });
    expect(await status(bundle, "tee-quote-digest")).toBe("UNVERIFIABLE");
  });
  it.each(["-1", "1e18", "1.5", "0x10", "1,000", "9".repeat(121), 1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid raw amount %s",
    (value) => {
      const row = { ...settlementRows(original)[0], escrow: value };
      expect(checkArithmetic(row)[0]?.status).toBe("FAIL");
    },
  );
  it("keeps missing amounts distinct from malformed amounts", () => {
    expect(checkArithmetic({})[0]?.status).toBe("UNVERIFIABLE");
  });
  it("handles zero work and decimal precision without floats", () => {
    expect(checkArithmetic({ minerPaid: "0", aggregateGn: "0" })[1]?.status).toBe("NOT_APPLICABLE");
    expect(checkArithmetic({ minerPaid: "1", aggregateGn: "0" })[1]?.status).toBe("FAIL");
    expect(
      checkArithmetic({ minerPaid: "10", aggregateGn: "3", pricePerGflop: "3.333333333333333333" })[1]?.status,
    ).toBe("PASS");
    expect(
      checkArithmetic({ minerPaid: "10", aggregateGn: "3", pricePerGflop: "3.333333333333333334" })[1]?.status,
    ).toBe("FAIL");
  });
  it("has fail-first exit semantics", () => {
    expect(resultCode([])).toBe(3);
    expect(resultCode([{ status: "PASS" }, { status: "NOT_APPLICABLE" }])).toBe(0);
    expect(resultCode([{ status: "PASS" }, { status: "UNVERIFIABLE" }])).toBe(3);
    expect(resultCode([{ status: "UNVERIFIABLE" }, { status: "FAIL" }])).toBe(1);
  });
});
