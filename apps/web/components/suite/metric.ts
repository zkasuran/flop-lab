// SPDX-License-Identifier: Apache-2.0
export interface SuiteMetric {
  value: number;
  label: string;
  measuredAt: string;
  source: string;
  sourceLabel: string;
  recording: string;
  note: string;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) throw new Error("Missing metric text");
  return value;
}
function link(value: unknown): string {
  const url = new URL(text(value));
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid metric source");
  return url.href;
}

/** Missing or malformed evidence stays absent. A measured zero stays zero. @example parseMetric(recording) */
export function parseMetric(input: unknown): SuiteMetric | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const value = input as Record<string, unknown>;
    if (typeof value.value !== "number" || !Number.isSafeInteger(value.value) || value.value < 0) return null;
    const measuredAt = text(value.measuredAt);
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(measuredAt) || !Number.isFinite(Date.parse(measuredAt)))
      return null;
    return {
      value: value.value,
      label: text(value.label),
      measuredAt,
      source: link(value.source),
      sourceLabel: text(value.sourceLabel),
      recording: link(value.recording),
      note: text(value.note),
    };
  } catch {
    return null;
  }
}
