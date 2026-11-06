// SPDX-License-Identifier: Apache-2.0
import { parseIndexerData } from "@flop-lab/mcp";
import { commission, decimal, formatFlop, minerStake, type Parameters } from "./model";
import { integer, list, object, observation, rawAmount, text, type Observation } from "./validate";

export interface Snapshot {
  miners: Observation;
  positions: Observation;
  stats: Observation;
}
export interface MinerCheck {
  address: string;
  selfFlop: string;
  sponsoredFlop: string;
  capacityGflop: string | null;
  requiredFlop: string | null;
  selfOnly: string;
  withSponsored: string;
  legacyCommission: string;
}

/** Compare recorded indexer fields with the documented model, without asserting runtime eligibility.
 * @example const report = auditStake(snapshot, parameters)
 */
export function auditStake(input: Snapshot, p: Parameters) {
  const errors: string[] = [];
  const sources: Observation[] = [];
  function read(key: keyof Snapshot): Record<string, unknown> | null {
    try {
      const o = observation(input[key]);
      sources.push(o);
      if (!o.raw) throw new Error(o.error ?? "No data");
      const root = object(JSON.parse(o.raw));
      if (root.errors !== undefined) throw new Error("GraphQL errors");
      return root;
    } catch (e) {
      errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
  const miners: MinerCheck[] = [];
  const m = read("miners");
  let minerPageComplete = false;
  if (m)
    try {
      const rows = list(m.data),
        pagination = object(m.pagination);
      const total = integer(pagination.total);
      if (
        rows.length > total ||
        integer(pagination.offset) !== 0 ||
        new Set(rows.map((v) => text(object(v).address))).size !== rows.length
      )
        throw new Error("Invalid miner pagination or duplicate addresses");
      minerPageComplete = total === rows.length;
      for (const value of rows) {
        const row = object(value),
          address = text(row.address);
        const self = rawAmount(row.selfStake),
          sponsored = rawAmount(row.sponsoredStake);
        rawAmount(row.delegatedStake); // Kept separate; never count a legacy alias twice.
        const cap = row.calibration == null ? null : integer(object(row.calibration).gnMax).toString();
        const required = cap === null ? null : decimal(minerStake(cap, p).requiredFlop);
        const status = (balance: bigint) =>
          required === null ? "UNVERIFIABLE" : balance >= required ? "MEETS MODEL" : "BELOW MODEL";
        miners.push({
          address,
          selfFlop: formatFlop(self),
          sponsoredFlop: formatFlop(sponsored),
          capacityGflop: cap,
          requiredFlop: required === null ? null : formatFlop(required),
          selfOnly: status(self),
          withSponsored: status(self + sponsored),
          legacyCommission: commission(integer(row.commission).toString(), p).withinLegacyCap
            ? "WITHIN LEGACY CAP"
            : "ABOVE LEGACY CAP",
        });
      }
    } catch (e) {
      miners.length = 0;
      minerPageComplete = false;
      errors.push(`miners: ${e instanceof Error ? e.message : String(e)}`);
    }
  const positions = [] as {
    id: string;
    operator: string;
    role: string;
    status: string;
    principalFlop: string;
    unlockBlock: number | null;
    principalCheck: string;
    unbondingCheck: string;
  }[];
  const s = read("positions");
  if (s)
    try {
      const rows = parseIndexerData("sponsorPositions", s);
      if (rows.length > 100 || new Set(rows.map((r) => r.id)).size !== rows.length)
        throw new Error("Invalid position page");
      for (const row of rows) {
        const principal = rawAmount(row.remainingPrincipal),
          initial = rawAmount(row.amount);
        if (row.unlockBlock !== null) integer(row.unlockBlock);
        if (row.updatedBlock !== null) integer(row.updatedBlock);
        const expected =
          row.role === "miner" ? p.minerUnbonding : row.role === "validator" ? p.validatorUnbonding : null;
        // updatedBlock is not an authenticated unbond-request block. Equality is only an indexed interval observation.
        const delta = row.unlockBlock !== null && row.updatedBlock !== null ? row.unlockBlock - row.updatedBlock : null;
        positions.push({
          id: row.id,
          operator: row.operator,
          role: row.role,
          status: row.status,
          principalFlop: formatFlop(principal),
          unlockBlock: row.unlockBlock,
          principalCheck: principal <= initial ? "WITHIN ORIGINAL" : "EXCEEDS ORIGINAL",
          unbondingCheck:
            row.status === "unbonding" && delta !== null && expected !== null
              ? BigInt(delta) === BigInt(expected)
                ? "MATCHES INDEXED INTERVAL"
                : "DIFFERS FROM INDEXED INTERVAL"
              : "UNVERIFIABLE",
        });
      }
    } catch (e) {
      positions.length = 0;
      errors.push(`positions: ${e instanceof Error ? e.message : String(e)}`);
    }
  let totals: {
    selfFlop: string;
    sponsoredFlop: string;
    delegatedFlop: string;
    reportedFlop: string;
    selfPlusSponsoredFlop: string;
    reportedEqualsSelf: boolean;
    validatorCurrentMinimumFlop: string;
    validatorFloorCheck: string;
  } | null = null;
  const t = read("stats");
  if (t)
    try {
      const row = object(t.miners),
        v = object(t.validators);
      const self = rawAmount(row.selfStake),
        sponsor = rawAmount(row.sponsoredStake),
        reported = rawAmount(row.totalStake),
        floor = rawAmount(v.currentMinStake);
      totals = {
        selfFlop: formatFlop(self),
        sponsoredFlop: formatFlop(sponsor),
        delegatedFlop: formatFlop(rawAmount(row.delegatedStake)),
        reportedFlop: formatFlop(reported),
        selfPlusSponsoredFlop: formatFlop(self + sponsor),
        reportedEqualsSelf: self === reported,
        validatorCurrentMinimumFlop: formatFlop(floor),
        validatorFloorCheck: floor >= decimal(p.validatorBaseline) ? "AT OR ABOVE BASELINE" : "BELOW BASELINE",
      };
    } catch (e) {
      errors.push(`stats: ${e instanceof Error ? e.message : String(e)}`);
    }
  return {
    sources,
    errors,
    miners,
    minerPageComplete,
    positions,
    positionLimit: 100,
    totals,
    issue75: {
      status: "UNVERIFIABLE",
      source: "https://github.com/flop-labs/network/issues/75",
      reason:
        "No same-hash runtime TotalStake storage proof. The indexer total is a different field. Neither fixed nor reproduced here.",
    },
    limitations: [
      "gnMax is indexed capacity, not a current calibration lease proof.",
      "Self plus sponsored is conditional on the devnet sponsored-self-stake feature and active principal semantics.",
      "Positions are one bounded page. Do not sum them as the network total.",
      "Sequential sources can cross blocks. Legacy delegation is not added to sponsored principal.",
      "Docs disallow new delegated staking; the catalog retains devnet sponsorship and legacy commission fields.",
    ],
  };
}
