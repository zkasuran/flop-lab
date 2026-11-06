// SPDX-License-Identifier: Apache-2.0
import type { Citation, Offence, Parameters } from "./model";
import { object, observation, text } from "./validate";

const names = {
  base: "min_miner_self_stake",
  coefficient: "miner_capacity_stake_per_gflop",
  window: "miner_stake_revocation_latency_blocks",
  surgePpm: "miner_stake_surge_multiplier_ppm",
  commissionCap: "miner_commission_cap_percent",
  minerUnbonding: "miner_unbonding_blocks",
  validatorUnbonding: "validator_unbonding_blocks",
  validatorBaseline: "validator_min_stake",
  validatorDowntimePercent: "validator_extended_downtime_slash_percent",
  fraudPercent: "slash_fraud_percent",
} as const;
function typography(s: string): string {
  return s.replace(/[\u2013\u2014]/g, "-");
}

/** Parse the recorded catalog table. Missing, duplicate or changed expression values fail closed.
 * @example const parameters = parseParameters(catalogRecording)
 */
export function parseParameters(input: unknown): Parameters {
  const o = observation(input);
  if (!o.raw) throw new Error("Catalog unavailable");
  const content = text(object(JSON.parse(o.raw)).content);
  const values: Record<string, string> = {},
    citations: Record<string, Citation> = {};
  for (const [key, id] of Object.entries(names)) {
    const matches = content.split("\n").filter((line) => line.startsWith(`| \`${id}\` |`));
    if (matches.length !== 1) throw new Error(`Missing or duplicate parameter ${id}`);
    const line = matches[0]!;
    const value = line.split("|")[2]!.trim();
    const unit = line.split("|")[3]!.trim();
    const expectedUnit =
      key === "coefficient"
        ? '"(= 0.01 FLOP per GFLOP/s)"'
        : key === "base" || key === "validatorBaseline"
          ? "FLOP"
          : key === "surgePpm"
            ? "ppm"
            : key === "window" || key.endsWith("Unbonding")
              ? "blocks"
              : "percent";
    if (unit !== expectedUnit) throw new Error(`Unexpected unit for ${id}`);
    if (key === "coefficient") {
      if (value !== '"VFY / 100"') throw new Error("Unknown capacity coefficient expression");
      values[key] = "0.01";
    } else {
      if (!/^\d[\d_]*$/.test(value)) throw new Error(`Invalid parameter ${id}`);
      values[key] = BigInt(value.replaceAll("_", "")).toString();
    }
    citations[key] = { source: o.source, measuredAt: o.measuredAt, quote: typography(line) };
  }
  return { ...values, citations } as unknown as Parameters;
}

/** Read offence quotations from the recorded docs. Unspecified rates are never filled in.
 * @example const offences = parseOffences(docsRecording, parameters)
 */
export function parseOffences(input: unknown, p: Parameters): Offence[] {
  const o = observation(input);
  if (!o.raw) throw new Error("Slashing docs unavailable");
  const rows = [...o.raw.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
  const definition = [
    ["liveness", "Liveness (being offline)", "1", "5", "1-5%"],
    ["fraud", "Provable fraud, collusion, evidence forgery", "100", "100", "100% slash, ejection, blacklist"],
    [
      "dishonest-block",
      "Publishing a dishonest block (validator)",
      null,
      null,
      "Draconian slashing and a permanent ban",
    ],
    ["hard-attestation", "Attestation failure on the optional HARD tier", "100", "100", "100% slash"],
    ["da-withholding", "Failing to serve retained audit data (DA provider)", null, null, "Slashed"],
  ] as const;
  const offences: Offence[] = definition.map(([id, label, minPercent, maxPercent, consequence]) => {
    const row = rows.find((r) => r[1] === label && r[2] === consequence);
    if (!row) throw new Error(`Missing or changed slashing rule ${id}`);
    return {
      id,
      label,
      minPercent,
      maxPercent,
      consequence,
      citation: { source: o.source, measuredAt: o.measuredAt, quote: `${label}: ${consequence}` },
    };
  });
  offences.push({
    id: "validator-downtime",
    label: "Extended validator downtime",
    minPercent: p.validatorDowntimePercent,
    maxPercent: p.validatorDowntimePercent,
    consequence: "Slash followed by removal",
    citation: p.citations.validatorDowntimePercent!,
  });
  return offences;
}
