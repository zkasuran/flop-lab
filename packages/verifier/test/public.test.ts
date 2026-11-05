// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { parseEvidence, sealEvidence, sealObservation, settlementRows, verifyEvidence } from "../src/index";
import type { Evidence } from "../src/index";
import { object } from "../src/schema";
import { HTLC_QUERY } from "../src/queries";
import { McpClient } from "../../mcp/src/index";
import { EvidenceFetcher } from "../src/fetcher";

const load = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8"));
const real = parseEvidence(load("v2-channel.json"));
const zero = `0x${"00".repeat(32)}`;
const raw = (bundle: Evidence, id: string) =>
  object(JSON.parse(bundle.observations.find((o) => o.id === id)!.raw!), id);
const digestBytes = (hex: string) =>
  `0x${createHash("sha256")
    .update(Buffer.from(hex.slice(2), "hex"))
    .digest("hex")}`;

async function set(bundle: Evidence, id: string, data: unknown, tool?: string, args?: Record<string, unknown>) {
  const previous = bundle.observations.find((o) => o.id === id);
  const observation = await sealObservation({
    id,
    source: "https://mcp.flop.network/mcp",
    tool: tool ?? previous!.tool,
    args: args ?? previous!.args,
    measuredAt: bundle.capturedAt,
    attempts: 1,
    durationMs: 0,
    raw: typeof data === "string" ? data : JSON.stringify(data),
    error: null,
  });
  bundle.observations = [...bundle.observations.filter((o) => o.id !== id), observation];
  const { sha256: _hash, ...rest } = bundle;
  return sealEvidence(rest);
}
async function change(bundle: Evidence, id: string, mutate: (r: Record<string, unknown>) => void) {
  const r = raw(bundle, id);
  mutate(r);
  return set(bundle, id, r);
}
const check = async (bundle: Evidence, id: string) => (await verifyEvidence(bundle)).checks.find((c) => c.id === id)!;

// SYNTHETIC fixtures: SDK envelope fields follow its README. No hardware signed these bytes.
async function synthetic(): Promise<Evidence> {
  let b = structuredClone(real);
  const preImage = "0x00010203";
  const hashLock = digestBytes(preImage);
  const quoteHex = "0x01020304";
  const channel = raw(b, "channel");
  const quote = {
    version: "1.0",
    miner_address: channel.miner,
    task_reference: { htlc_hash_lock: hashLock, model_hash: channel.modelHash, task_timestamp: 1 },
    compute_output: { gn_weight: 1, execution_time_ms: 1, encrypted_result: "0x01" },
    attestation: {
      tee_type: "intel-sgx",
      quote_hex: quoteHex,
      hardware_pubkey: "0x01",
      signature: "0x02",
      measurement_hash: zero,
      tcb_version: "11",
    },
  };
  b = await set(b, "channel", { ...channel, hashLock, hashAlgorithm: "sha256", teeQuote: quote });
  const head = Number(object(raw(b, "head").stats, "stats").latestBlockNumber);
  const htlc = {
    hashLock,
    amount: channel.escrow,
    timeout: head + 1,
    status: "CREATED",
    sender: channel.agent,
    recipient: channel.miner,
    preImage,
    blockNumber: head,
  };
  b = await set(b, "htlc", htlc, "flop_check_htlc", { hash_lock: hashLock });
  b = await set(b, "htlc-index", { htlc }, "flop_indexer_query", { query: HTLC_QUERY, variables: { hash: hashLock } });
  b = await set(
    b,
    "receipt",
    {
      hashLock,
      minerPaid: channel.minerPaid,
      teeQuoteDigest: digestBytes(quoteHex),
      teeQuoteDigestAlgorithm: "sha256",
    },
    "flop_get_inference_receipt",
    { hash_lock: hashLock },
  );
  const tcb = object(object(load("v2-tcb.json"), "fixture").value, "tcb");
  b = await set(b, "tcb", { ...tcb, queriedTCBVersion: "11", currentLevel: 1 }, "flop_get_tcb_status", {
    platform: "intel-sgx",
    tcb_version: "11",
  });
  return b;
}

it("replays recorded v2 views without claiming attestation or linkage", async () => {
  expect((await verifyEvidence(real)).checks.filter((c) => c.status === "FAIL")).toEqual([]);
  for (const id of ["indexer-channel", "indexer-settlement"]) expect((await check(real, id)).status).toBe("PASS");
  expect((await check(real, "attestation-trust")).detail).toContain("empty dstackVkeys");
  expect((await check(real, "htlc-link")).status).toBe("UNVERIFIABLE");
});

it("keeps v1 bundles on their original checks and rejects unknown versions", async () => {
  expect((await verifyEvidence(load("channel-1.json"))).checks).toHaveLength(12);
  expect((await verifyEvidence({ ...real, version: 3 })).exitCode).toBe(1);
});

it.each(["escrow", "minerPaid", "burned", "aggregateGn", "status", "miner", "modelHash"])(
  "detects indexer channel %s contradictions after rehashing",
  async (field) => {
    const b = await change(structuredClone(real), "channel-index", (data) => {
      object(data.computeChannel, "channel")[field] = "1";
    });
    expect((await check(b, "bundle-integrity")).status).toBe("PASS");
    const result = await check(b, "indexer-channel");
    expect(result.status).toBe("FAIL");
    expect(result.inputs[field]).toHaveProperty("indexer", "1");
  },
);

it.each(["unusedEscrow", "pricePerGflop", "settledBlock", "settlementKind"])(
  "detects settlement %s disagreement even with another missing field",
  async (field) => {
    const b = await change(structuredClone(real), "settlement-index", (data) => {
      const s = object(data.settlementPrice, "row");
      s[field] = "1";
      delete s.agent;
    });
    expect((await check(b, "indexer-settlement")).status).toBe("FAIL");
  },
);

it("keeps empty and GraphQL partial-error responses unverifiable", async () => {
  for (const data of [{ computeChannel: null }, { computeChannel: {}, errors: [{ message: "offline" }] }]) {
    expect((await check(await set(structuredClone(real), "channel-index", data), "indexer-channel")).status).toBe(
      "UNVERIFIABLE",
    );
  }
});

it("checks synthetic envelope, raw byte digest and preimage without authenticating hardware or receipt amounts", async () => {
  const b = await synthetic();
  for (const id of ["quote-structure", "quote-digest", "htlc-preimage", "htlc-amount", "htlc-timelock", "indexer-htlc"])
    expect((await check(b, id)).status, id).toBe("PASS");
  for (const id of ["attestation-trust", "attestation-tcb", "receipt-amount", "tee-service-simulation"])
    expect((await check(b, id)).status, id).toBe("UNVERIFIABLE");
});

it.each(["0x1", "0xzz", "", 12, "0x" + "00".repeat(65537)])("rejects malformed quote bytes", async (value) => {
  const b = await change(await synthetic(), "channel", (c) => {
    object(object(c.teeQuote, "quote").attestation, "att").quote_hex = value;
  });
  expect((await check(b, "quote-structure")).status).toBe("FAIL");
});

it("rejects a digest of UTF-8 hex text rather than decoded bytes", async () => {
  const b = await change(await synthetic(), "receipt", (r) => {
    r.teeQuoteDigest = `0x${createHash("sha256").update("0x01020304").digest("hex")}`;
  });
  expect((await check(b, "quote-digest")).status).toBe("FAIL");
});

it("does not infer missing hashing algorithms", async () => {
  let b = await change(await synthetic(), "channel", (c) => {
    delete c.hashAlgorithm;
  });
  b = await change(b, "receipt", (r) => {
    delete r.teeQuoteDigestAlgorithm;
  });
  expect((await check(b, "htlc-preimage")).status).toBe("UNVERIFIABLE");
  expect((await check(b, "quote-digest")).status).toBe("UNVERIFIABLE");
});

it("uses a public tool preimage even when the indexer row is unavailable", async () => {
  const b = await set(await synthetic(), "htlc-index", { htlc: null });
  expect((await check(b, "htlc-preimage")).status).toBe("PASS");
});

it("checks a public quote carried in the bound receipt", async () => {
  let b = await synthetic();
  const quote = raw(b, "channel").teeQuote;
  b = await change(b, "channel", (c) => {
    delete c.teeQuote;
  });
  b = await change(b, "receipt", (r) => {
    r.teeQuote = quote;
  });
  expect((await check(b, "quote-structure")).status).toBe("PASS");
  expect((await check(b, "quote-digest")).status).toBe("PASS");
});

it("detects every public preimage disagreement", async () => {
  const b = await change(await synthetic(), "htlc", (h) => {
    h.preImage = "0xff";
  });
  expect((await check(b, "htlc-preimage")).status).toBe("FAIL");
});

it("checks the timeout boundary without treating expiry as automatic refund", async () => {
  let b = await synthetic();
  const head = object(raw(b, "head").stats, "stats").latestBlockNumber;
  b = await change(b, "htlc-index", (r) => {
    object(r.htlc, "htlc").timeout = head;
  });
  expect((await check(b, "htlc-timelock")).inputs.timeoutReached).toBe(true);
  expect((await check(b, "htlc-timelock")).status).toBe("PASS");
  b = await change(b, "htlc-index", (r) => {
    const h = object(r.htlc, "htlc");
    h.status = "REFUNDED";
    h.timeout = Number(head) + 1;
  });
  expect((await check(b, "htlc-timelock")).status).toBe("FAIL");
});

it("detects future blocks and unsafe heights", async () => {
  for (const blockNumber of [Number.MAX_SAFE_INTEGER + 1, -1, 1.5]) {
    const b = await change(await synthetic(), "htlc-index", (r) => {
      object(r.htlc, "htlc").blockNumber = blockNumber;
    });
    expect((await check(b, "htlc-timelock")).status).toBe("FAIL");
  }
});

it("does not hide an HTLC amount mismatch behind an unavailable receipt", async () => {
  let b = await change(await synthetic(), "htlc-index", (r) => {
    object(r.htlc, "htlc").amount = "1";
  });
  b = await set(b, "receipt", "Receipt query failed or RPC unavailable.");
  expect((await check(b, "htlc-amount")).status).toBe("FAIL");
});

it.each(["htlc", "receipt", "htlc-index"])("rejects %s request substitution", async (id) => {
  let b = await synthetic();
  b = await set(
    b,
    id,
    raw(b, id),
    undefined,
    id === "htlc-index" ? { query: HTLC_QUERY, variables: { hash: zero } } : { hash_lock: zero },
  );
  expect((await check(b, id === "receipt" ? "quote-digest" : "indexer-htlc")).status).toBe("FAIL");
});

it("rejects contradictory link aliases", async () => {
  const b = await change(await synthetic(), "channel", (c) => {
    c.hash_lock = zero;
  });
  expect((await check(b, "htlc-link")).status).toBe("FAIL");
});

it("compares explicit synthetic measurement bindings without claiming authentication", async () => {
  let b = await change(await synthetic(), "trust-root", (r) => {
    r.dstackVkeys = [{ platform: "intel-sgx", measurementHash: zero }];
  });
  expect((await check(b, "attestation-trust")).status).toBe("UNVERIFIABLE");
  b = await change(b, "trust-root", (r) => {
    r.dstackVkeys = [{ platform: "amd-sev", measurementHash: zero }];
  });
  expect((await check(b, "attestation-trust")).status).toBe("FAIL");
  b = await change(b, "trust-root", (r) => {
    r.dstackVkeys = [zero];
  });
  expect((await check(b, "attestation-trust")).status).toBe("UNVERIFIABLE");
});

it.each([{ platform: "AMD SEV" }, { queriedTCBVersion: "9" }, { currentLevel: "Vulnerable" }])(
  "rejects contradictory or vulnerable TCB data",
  async (values) => {
    const b = await change(await synthetic(), "tcb", (r) => {
      Object.assign(r, values);
    });
    expect((await check(b, "attestation-tcb")).status).toBe("FAIL");
  },
);

it("never turns a simulated verified:true into a pass", async () => {
  const b = await set(
    await synthetic(),
    "tee-simulation",
    { verified: true, simulated: false },
    "flop_verify_tee_quote",
    { quote_hex: "0x01" },
  );
  expect(await check(b, "tee-service-simulation")).toMatchObject({ status: "UNVERIFIABLE", simulated: true });
});

it("replays real unavailable HTLC and receipt text without inventing a JSON response", async () => {
  let b = await synthetic();
  const index = object(load("v2-htlc-index.json"), "fixture");
  const h = object(object(index.value, "response").htlc, "htlc");
  b = await change(b, "channel", (c) => {
    c.hashLock = h.hashLock;
    delete c.teeQuote;
  });
  for (const [id, file] of [
    ["htlc", "v2-htlc-check.json"],
    ["receipt", "v2-receipt.json"],
    ["htlc-index", "v2-htlc-index.json"],
  ]) {
    const fixture = object(load(file!), "fixture");
    b = await set(b, id!, fixture.raw, String(fixture.tool), object(fixture.args, "args"));
  }
  expect((await check(b, "indexer-htlc")).status).toBe("UNVERIFIABLE");
  expect((await check(b, "receipt-amount")).detail).toContain("RPC unavailable");
});

it("collects linked evidence and platform advisories through the shared client without calling simulations", async () => {
  const fixture = await synthetic();
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const req = object(JSON.parse(String(init?.body)), "request");
    const params = object(req.params, "params");
    const obs = fixture.observations.find(
      (o) => o.tool === params.name && JSON.stringify(o.args) === JSON.stringify(params.arguments),
    );
    if (!obs) throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    return Response.json({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: obs.raw }] } });
  });
  const fetcher = new EvidenceFetcher({ client: new McpClient({ fetch, retries: 0, minIntervalMs: 0 }) });
  const b = await fetcher.channel(fixture.channelId);
  expect(b.version).toBe(2);
  expect(b.observations.filter((o) => o.error !== null)).toEqual([]);
  expect(b.observations.map((o) => o.id)).toEqual(expect.arrayContaining(["htlc", "receipt", "htlc-index", "tcb"]));
  expect(b.observations.some((o) => o.tool === "flop_verify_tee_quote")).toBe(false);
  expect(settlementRows(b).length).toBeGreaterThan(0);
});
