// SPDX-License-Identifier: Apache-2.0
import { rewardAt, rewardSplit, subsidyAt, supplyAt, paymentSplit, SPEC } from "./model";
import type { Observation } from "./observe";
export type Status = "MATCH" | "DRIFT" | "UNOBSERVABLE";
export type Comparison = {
  id: string;
  quantity: string;
  status: Status;
  expected: string | null;
  observed: string | null;
  reason: string;
  clause: string;
  channelId?: string;
  block?: number;
};

/** Compare an indexer recording with the pinned target, not a deployed-runtime attestation. @example compare(recordedObservation()).rows */
export function compare(observation: Observation) {
  const { data } = observation;
  const head = data.stats?.latestBlockNumber ?? null;
  const block = head === null ? null : BigInt(head);
  const rows: Comparison[] = [];
  const missing = (id: string, quantity: string, expected: string | null, reason: string, clause: string) =>
    rows.push({ id, quantity, expected, observed: null, status: "UNOBSERVABLE", reason, clause });
  missing(
    "supply",
    "Gross scheduled supply",
    block === null ? null : supplyAt(block).gross.toString(),
    "stats has no total issuance. net supply, genesis allocations and other mint or burn history are unavailable.",
    "R9.2, R9.3, R9.7",
  );
  missing(
    "reward",
    "Block reward",
    block === null ? null : rewardAt(block).toString(),
    "No reward distribution events or runtime reward parameters in this projection.",
    "R9.2",
  );
  missing(
    "subsidy",
    "Subsidy per recipient",
    block === null ? null : subsidyAt(block).toString(),
    "No Labs or Foundation mint events in this projection.",
    "R9.3",
  );
  for (const [name, value] of Object.entries(
    block === null ? { miners: null, validators: null, agents: null, stakers: null } : rewardSplit(block),
  )) {
    missing(
      `reward-${name}`,
      `Reward pool: ${name}`,
      value?.toString() ?? null,
      "No per-pool reward distributions. A model output is not a receipt.",
      "R9.5, R9.12",
    );
  }
  missing(
    "network-value",
    "Supply from networkValue",
    null,
    "networkValue reports contributor concentration, not token issuance. Its zero counts do not imply zero supply.",
    "R9.7",
  );
  missing(
    "term-curve",
    "Emission from termCurve",
    null,
    "termCurve reports forward-market prices, not a reward curve. Missing prices are not zero fees.",
    "R9.2, Appendix D",
  );
  missing(
    "inclusion",
    "Inclusion fee and tip routing",
    null,
    "No author receipt or fee components in the selected fields.",
    "R9.6, Appendix D",
  );
  for (const row of data.settlements ?? []) {
    const prefix = `${row.channelId}:`;
    const add = (
      id: string,
      quantity: string,
      status: Status,
      expected: string | null,
      observed: string | null,
      reason: string,
    ) =>
      rows.push({
        id: prefix + id,
        quantity,
        status,
        expected,
        observed,
        reason,
        clause: "R12.1a, R9.6, Appendix D",
        channelId: row.channelId,
        block: row.settledBlock,
      });
    add(
      "burn",
      "Settlement burn",
      BigInt(row.burned) === 0n ? "MATCH" : "DRIFT",
      "0",
      row.burned,
      "Exact indexed burn compared with the zero-burn target. No runtime inclusion proof.",
    );
    const eligible =
      row.cooperative === true &&
      row.marketKind === "spot" &&
      row.settlementKind === "settled" &&
      row.settlementEvent === "computeChannel.Settled";
    if (!eligible) {
      add(
        "miner",
        "Miner fee",
        "UNOBSERVABLE",
        null,
        row.minerPaid,
        "Only cooperative spot settlements identify full escrow as payable here. Other paths require tariff or contract state.",
      );
    } else {
      const payable = BigInt(row.escrow);
      const floor = paymentSplit(payable).miner;
      const exact = (payable * SPEC.feeMinerPpt) % 1000n === 0n;
      const ceiling = floor + (exact ? 0n : 1n);
      const observed = BigInt(row.minerPaid);
      const status = observed < floor || observed > ceiling ? "DRIFT" : exact ? "MATCH" : "UNOBSERVABLE";
      add(
        "miner",
        "Miner fee",
        status,
        exact ? floor.toString() : `${floor}..${ceiling}`,
        row.minerPaid,
        "Target miner share is escrow * 850 / 1000. Nonintegral targets use floor..ceil bounds; in-range dust is unobservable. Drift is against the pinned target, not proof of a runtime defect.",
      );
    }
    add(
      "validator",
      "Validator and audit receipts",
      "UNOBSERVABLE",
      null,
      null,
      "No validatorPaid or auditPaid fields. unusedEscrow is a residual label and is not evidence of a refund or a validator receipt.",
    );
  }
  if (!data.settlements?.length)
    missing(
      "settlements",
      "Settlement fees",
      null,
      "No settlement rows observed. An empty sample does not match a fee rule.",
      "R12.1a",
    );
  const counts: Record<Status, number> = { MATCH: 0, DRIFT: 0, UNOBSERVABLE: 0 };
  for (const row of rows) counts[row.status]++;
  return {
    source: observation.source,
    measuredAt: observation.measuredAt,
    spec: { sha: SPEC.sha, source: SPEC.source },
    head,
    sampleSize: data.settlements?.length ?? 0,
    totalSettlements: data.pagination?.total ?? null,
    counts,
    rows,
  };
}
export type Report = ReturnType<typeof compare>;
