// SPDX-License-Identifier: Apache-2.0
export interface PreviewRow {
  channelId: string;
  settledBlock: number;
  minerPaid: string;
  escrowConserved: boolean;
}
export interface Preview {
  source: string;
  measuredAt: string;
  rows: PreviewRow[];
  mode: "recorded" | "live";
}
const source = "https://mcp.flop.network/mcp";

/** Validate a compact settlement observation at the browser boundary. @example parsePreview(await response.json()) */
export function parsePreview(value: unknown): Preview {
  if (!value || typeof value !== "object") throw new Error("Invalid observation");
  const v = value as Record<string, unknown>;
  if (
    v.source !== source ||
    typeof v.measuredAt !== "string" ||
    !Number.isFinite(Date.parse(v.measuredAt)) ||
    (v.mode !== "recorded" && v.mode !== "live") ||
    !Array.isArray(v.rows) ||
    v.rows.length > 5
  )
    throw new Error("Invalid observation");
  const rows = v.rows.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid row");
    const r = value as Record<string, unknown>;
    if (
      typeof r.channelId !== "string" ||
      !/^0x[a-f0-9]{64}$/i.test(r.channelId) ||
      typeof r.minerPaid !== "string" ||
      !/^\d{1,40}$/.test(r.minerPaid) ||
      typeof r.settledBlock !== "number" ||
      !Number.isSafeInteger(r.settledBlock) ||
      r.settledBlock < 0 ||
      typeof r.escrowConserved !== "boolean"
    )
      throw new Error("Invalid row");
    return {
      channelId: r.channelId,
      settledBlock: r.settledBlock,
      minerPaid: r.minerPaid,
      escrowConserved: r.escrowConserved,
    };
  });
  if (new Set(rows.map((r) => r.channelId)).size !== rows.length) throw new Error("Duplicate channel");
  return { source, measuredAt: v.measuredAt, mode: v.mode, rows };
}

/** Format raw chain units exactly without floating-point loss. @example formatFlop("10000000000000000") */
export function formatFlop(raw: string): string {
  const units = BigInt(raw);
  const fraction = (units % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${units / 10n ** 18n}${fraction ? `.${fraction}` : ""}`;
}

/** Relative bar length for observed sample amounts only. @example amountRatio(row.minerPaid, rows) */
export function amountRatio(raw: string, rows: PreviewRow[]): number {
  const max = rows.reduce((m, r) => (BigInt(r.minerPaid) > m ? BigInt(r.minerPaid) : m), 0n);
  return max === 0n ? 0 : Number((BigInt(raw) * 10000n) / max) / 10000;
}
