// SPDX-License-Identifier: Apache-2.0
import type { AuditReport, Evidence, Finding, Snapshot } from "./types";
import { amount, flag, integer, object, parseSnapshot, rows, text } from "./validate";

const SCHEMA = "https://mcp.flop.network/mcp#flop_indexer_query";
const EXPLORER = "https://explorer.devnet.flop.network";
const STAKING = `${EXPLORER}/api/staking/stats`;
const LIFECYCLE = "https://docs.flop.network/docs/inference-session-lifecycle";
const REF75 = "https://github.com/flop-labs/network/issues/75";
const REF76 = "https://github.com/flop-labs/network/issues/76";
type Pair = { left: string; right: string; pass: boolean; reason?: string };

/** Evaluate dated public observations without network access. Missing inputs never pass.
 * @example const report = auditSnapshot(JSON.parse(recordedSnapshot));
 */
export function auditSnapshot(input: unknown): AuditReport {
  const snapshot = parseSnapshot(input);
  const findings: Finding[] = [];
  const read = (id: string) => {
    const observation = snapshot.observations.find((o) => o.id === id);
    if (!observation || observation.error || observation.raw === null)
      throw new Error(observation?.error ?? `No observation: ${id}`);
    const value = object(JSON.parse(observation.raw));
    if (value.errors !== undefined) throw new Error(`GraphQL errors in ${id}`);
    return value;
  };
  const check = (
    id: string,
    title: string,
    formula: string,
    reference: string,
    left: Omit<Evidence, "value">,
    right: Omit<Evidence, "value">,
    run: () => Pair,
  ) => {
    const finding: Finding = {
      id,
      title,
      formula,
      reference,
      status: "UNVERIFIABLE",
      reason: "",
      left: { ...left, value: "Unavailable" },
      right: { ...right, value: "Unavailable" },
    };
    try {
      const pair = run();
      finding.left.value = pair.left;
      finding.right.value = pair.right;
      finding.status = pair.pass ? "PASS" : "FAIL";
      finding.reason = pair.reason ?? (pair.pass ? "The observed values agree." : "The observed values disagree.");
    } catch (error) {
      finding.reason = error instanceof Error ? error.message : String(error);
    }
    findings.push(finding);
  };
  const side = (label: string, ...observationIds: string[]) => ({ label, observationIds });
  const equal = (a: bigint | number | string, b: bigint | number | string): Pair => ({
    left: String(a),
    right: String(b),
    pass: a === b,
  });
  const unavailable = (why: string): never => {
    throw new Error(why);
  };

  check(
    "block-order",
    "Recent blocks form a linked sequence",
    "newer.number = older.number + 1; newer.parentHash = older.hash",
    SCHEMA,
    side("GraphQL recent blocks", "indexer"),
    side("Adjacent parent links", "indexer"),
    () => {
      const blocks = rows(read("indexer").blocks);
      if (blocks.length < 2) return unavailable("Need at least two blocks; the sample is empty or too small.");
      const links = blocks.slice(0, -1).map((b, i) => {
        const older = blocks[i + 1]!;
        return integer(b.number) === integer(older.number) + 1 && text(b.parentHash) === text(older.hash);
      });
      return {
        left: blocks.map((b) => `${integer(b.number)} ${text(b.hash)}`).join("\n"),
        right: blocks
          .slice(0, -1)
          .map((b) => text(b.parentHash))
          .join("\n"),
        pass: links.every(Boolean),
      };
    },
  );
  check(
    "block-lookup",
    "Block lookup agrees with GraphQL",
    "same block number implies the same hash",
    SCHEMA,
    side("GraphQL block", "indexer"),
    side("MCP block lookup", "block"),
    () => {
      const first = rows(read("indexer").blocks)[0];
      if (!first) return unavailable("No sampled block.");
      const b = object(read("block").block);
      if (integer(first.number) !== integer(b.number)) return unavailable("Lookup returned a different block number.");
      return equal(text(first.hash), text(b.hash));
    },
  );
  for (const field of ["latestBlockNumber", "totalBlocks", "totalTransactions", "totalAccounts"]) {
    check(
      `monotonic-${field}`,
      `${field} does not go backwards`,
      "later counter >= earlier counter",
      SCHEMA,
      side("First GraphQL sample", "indexer"),
      side("Second GraphQL sample", "counters-after"),
      () => {
        const a = integer(object(read("indexer").stats)[field]);
        const b = integer(object(read("counters-after").stats)[field]);
        const before = snapshot.observations.find((o) => o.id === "indexer")!;
        const after = snapshot.observations.find((o) => o.id === "counters-after")!;
        if (Date.parse(after.measuredAt) <= Date.parse(before.measuredAt))
          return unavailable("Samples are not ordered in time.");
        return {
          left: String(a),
          right: String(b),
          pass: b >= a,
          reason:
            b >= a
              ? "Nondecreasing in this short observation window."
              : "Counter decreased. A devnet reset or reorg can also cause this; no chain identity proof is available.",
        };
      },
    );
  }
  for (const [id, field] of [
    ["stats", "totalTransactions"],
    ["explorer-stats", "totalTransactions"],
  ] as const) {
    check(
      `stats-${id}`,
      `Transaction totals agree at the same height (${id})`,
      "GraphQL totalTransactions = peer totalTransactions, only at equal latestBlockNumber",
      SCHEMA,
      side("GraphQL stats", "indexer"),
      side("Peer stats", id),
      () => {
        const a = object(read("indexer").stats);
        const peer = read(id);
        const b = id === "stats" ? object(peer.stats) : peer;
        if (integer(a.latestBlockNumber) !== integer(b.latestBlockNumber))
          return unavailable("Different observation heights. A moving head is not an arithmetic failure.");
        return equal(integer(a[field]), integer(b[field]));
      },
    );
  }
  check(
    "finality-lag",
    "Finality lag matches its block window",
    "finalizedLag = bestBlock - finalizedBlock",
    `${EXPLORER}/api/stats`,
    side("Reported finalizedLag", "explorer-stats"),
    side("Best block minus finalized block", "explorer-stats"),
    () => {
      const f = object(read("explorer-stats").finality);
      return equal(integer(f.finalizedLag), integer(f.bestBlock) - integer(f.finalizedBlock));
    },
  );

  check(
    "leaderboard",
    "Leaderboard is ordered by observed weight",
    "weight[i] >= weight[i+1]; submitters are unique; ties allowed",
    SCHEMA,
    side("Ranked G_n weights", "indexer"),
    side("Nonincreasing order", "indexer"),
    () => {
      const board = rows(read("indexer").pouiLeaderboard);
      if (board.length < 2) return unavailable("Need at least two leaderboard rows to check ordering.");
      const weights = board.map((b) => {
        const w = b.totalWeight;
        if (typeof w !== "number" || !Number.isFinite(w) || w < 0)
          return unavailable("Missing or invalid leaderboard weight.");
        return w;
      });
      const unique = new Set(board.map((b) => text(b.submitter))).size === board.length;
      return {
        left: weights.join(" >= "),
        right: "Descending weights, unique submitters",
        pass: unique && weights.slice(1).every((w, i) => weights[i]! >= w),
      };
    },
  );

  for (const group of ["miners", "validators"]) {
    check(
      `stake-${group}`,
      `${group}: total stake includes its bonded parts`,
      "totalStake = selfStake + delegatedStake + sponsoredStake",
      STAKING,
      side("Reported totalStake", "staking"),
      side("Sum of stake components", "staking"),
      () => {
        const g = object(read("staking")[group]);
        return {
          ...equal(amount(g.totalStake), amount(g.selfStake) + amount(g.delegatedStake) + amount(g.sponsoredStake)),
          reason:
            "Declared audit definition: all three bonded components. Sponsored unbonding is excluded. This checks the API's total label, not runtime storage.",
        };
      },
    );
  }
  for (const field of ["selfStake", "sponsoredStake", "delegatedStake"]) {
    check(
      `miner-sum-${field}`,
      `Miner ${field} total matches the full list`,
      `staking.miners.${field} = sum(miners[].${field})`,
      STAKING,
      side("Staking aggregate", "staking"),
      side("Sum of miner rows", "miners"),
      () => {
        const m = read("miners");
        const data = rows(m.data);
        const p = object(m.pagination);
        if (flag(p.hasMore) || integer(p.offset) !== 0 || integer(p.total) !== data.length)
          return unavailable(
            "Miner list is partial. Raise --limit within the cap; partial sums are never compared to a network total.",
          );
        if (!data.length) return unavailable("No miner rows.");
        if (new Set(data.map((r) => text(r.address))).size !== data.length)
          return unavailable("Duplicate miner rows prevent a complete sum.");
        return equal(
          amount(object(read("staking").miners)[field]),
          data.reduce((sum, r) => sum + amount(r[field]), 0n),
        );
      },
    );
  }
  check(
    "runtime-stake",
    "Runtime TotalStake includes self-stake (#75)",
    "MinerStaking::TotalStake = sum(self_stake + delegated_stake) at one finalized hash",
    REF75,
    side("Runtime storage", "staking"),
    side("Explorer miner parts", "miners"),
    () =>
      unavailable(
        "Public APIs expose indexer projections, not a same-hash runtime TotalStake storage proof. #75 cannot be reverified here.",
      ),
  );
  check(
    "calibration-window",
    "Calibration phase agrees with its lease (#76)",
    "Active only while head < accepted_at + CalibrationLeaseBlocks",
    REF76,
    side("Miner calibration phase", "miners"),
    side("Acceptance and expiry blocks", "miners"),
    () => {
      const miners = rows(read("miners").data);
      if (!miners.some((m) => m.calibration !== null)) return unavailable("No calibration rows.");
      return unavailable(
        "The observed calibration projection has no accepted_at or lease expiry. Historical #76 values cannot establish current expiry.",
      );
    },
  );
  check(
    "supply",
    "Supply equals all balance components",
    "totalSupply = sum(free + reserved) over every account at one finalized hash",
    `${EXPLORER}/api/stats`,
    side("Reported totalSupply", "explorer-stats"),
    side("Complete same-hash balances"),
    () =>
      unavailable(
        "The bounded public sample cannot enumerate all account balances at one finalized hash. Top holders are not total supply.",
      ),
  );
  check(
    "inference-totals",
    "Inference paid agrees with receipts and burns",
    "sum(paid) = sum(received) + sum(burned), for the same terminal window and complete participant set",
    SCHEMA,
    side("All original payers", "indexer"),
    side("All miners and burns", "indexer"),
    () =>
      unavailable(
        "A bounded settlement page is not a complete participant set. The legacy unbounded spend summary has different lifecycle semantics; it is not compared to receipts.",
      ),
  );

  let settlements: Record<string, unknown>[] = [];
  try {
    settlements = rows(object(read("indexer").settlementPrices).data);
  } catch {
    /* The catalogue row below exposes missing data. */
  }
  if (!settlements.length) {
    check(
      "settlements",
      "Settlement accounting",
      "escrow = minerPaid + burned + unusedEscrow",
      LIFECYCLE,
      side("Settlement escrow", "indexer"),
      side("Settlement components", "indexer"),
      () => unavailable("No valid settlement rows in the sample."),
    );
  }
  settlements.forEach((s, i) => {
    const cid = typeof s.channelId === "string" ? s.channelId : `row-${i}`;
    const channelId = `channel-${i}`;
    check(
      `escrow-${i}`,
      `Escrow conservation: ${cid}`,
      "escrow = minerPaid + burned + unusedEscrow",
      LIFECYCLE,
      side("Escrow in raw planck", "indexer"),
      side("Paid + burned + residual in raw planck", "indexer"),
      () => equal(amount(s.escrow), amount(s.minerPaid) + amount(s.burned) + amount(s.unusedEscrow)),
    );
    check(
      `channel-${i}`,
      `Channel agrees with settlement: ${cid}`,
      "same channelId and settlement block: escrow, minerPaid, burned and aggregateGn agree",
      SCHEMA,
      side("GraphQL settlement", "indexer"),
      side("MCP compute channel", channelId),
      () => {
        const c = read(channelId);
        if (text(c.channelId) !== text(s.channelId)) return unavailable("Channel lookup returned a different id.");
        const ref = object(c.settlement);
        if (integer(ref.blockNumber) !== integer(s.settledBlock) || text(ref.blockHash) !== text(s.settledBlockHash))
          return unavailable("Settlement and channel do not share a settlement block hash.");
        const fields = ["escrow", "minerPaid", "burned", "aggregateGn"] as const;
        const left = fields.map((f) => `${f}: ${amount(s[f])}`).join("\n");
        const right = fields.map((f) => `${f}: ${amount(c[f])}`).join("\n");
        return { left, right, pass: left === right };
      },
    );
    check(
      `price-${i}`,
      `Realized price agrees with payment: ${cid}`,
      "abs(price * 10^d * aggregateGn - minerPaid * 10^d) <= aggregateGn; d = reported decimal places",
      SCHEMA,
      side("Reported price in raw planck per G_n", "indexer"),
      side("Channel minerPaid / aggregateGn", channelId),
      () => {
        const c = read(channelId);
        if (text(c.channelId) !== text(s.channelId)) return unavailable("Different channel ids.");
        const ref = object(c.settlement);
        if (integer(ref.blockNumber) !== integer(s.settledBlock) || text(ref.blockHash) !== text(s.settledBlockHash))
          return unavailable("Price and payment are not pinned to the same settlement block hash.");
        const gn = amount(c.aggregateGn),
          paid = amount(c.minerPaid);
        if (gn === 0n) return unavailable("Zero aggregateGn has no defined unit price.");
        const price = text(s.pricePerGflop);
        const match = /^(\d{1,78})(?:\.(\d{1,36}))?$/.exec(price);
        if (!match) return unavailable("Invalid decimal price.");
        const scale = 10n ** BigInt(match[2]?.length ?? 0);
        const scaled = BigInt(match[1]! + (match[2] ?? ""));
        const delta = scaled * gn - paid * scale;
        return {
          left: price,
          right: `${paid} / ${gn}`,
          pass: (delta < 0n ? -delta : delta) <= gn,
          reason:
            "Allows one unit of the last reported decimal place. No floating-point conversion. This is an observed unit-price definition, not a quote or a protocol payment proof.",
        };
      },
    );
  });
  const counts = { PASS: 0, FAIL: 0, UNVERIFIABLE: 0 };
  for (const f of findings) counts[f.status]++;
  return { snapshot, findings, counts, cached: false };
}

/** Return a compact text report with both values for failures.
 * @example console.log(formatReport(auditSnapshot(snapshot)));
 */
export function formatReport(report: AuditReport): string {
  const s: Snapshot = report.snapshot;
  return [
    `FLOP indexer audit | ${s.completedAt} | ${report.cached ? "cached snapshot" : "dated snapshot"}`,
    `Requests: ${s.requests}/${s.requestBudget}; duration: ${s.durationMs} ms; row limit: ${s.limit}`,
    `PASS ${report.counts.PASS} | FAIL ${report.counts.FAIL} | UNVERIFIABLE ${report.counts.UNVERIFIABLE}`,
    "Indexer consistency only. MCP and explorer can share a backend. No independent chain proof.",
    ...report.findings.map(
      (f) =>
        `${f.status} ${f.title}\n  ${f.reason}${f.status === "FAIL" ? `\n  ${f.left.label}: ${f.left.value}\n  ${f.right.label}: ${f.right.value}\n  ${f.formula}` : ""}`,
    ),
    ...s.observations.map((o) => `Source ${o.id}: ${o.source} at ${o.measuredAt}${o.error ? ` (${o.error})` : ""}`),
  ].join("\n");
}
