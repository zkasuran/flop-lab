// SPDX-License-Identifier: Apache-2.0
export const accessForm = {
  source:
    "https://github.com/flop-labs/network/blob/9a59aca2ef3e013ea4862522074f8d0752bb43b9/.github/ISSUE_TEMPLATE/access.yml",
  fields: [
    {
      label: "Request",
      options: [
        "testnet miner sponsor allowlist entry",
        "operator key quota (several miners)",
        "gateway allowance",
        "private endpoint",
        "remove a retired host's access",
        "other",
      ],
    },
    { label: "Network", options: ["devnet", "testnet"] },
    { label: "Public identifiers", options: [] },
  ],
} as const;
export type LintResult = { valid: boolean; form: string; findings: { field: string; problem: string }[] };

/** Inspect a GitHub access-form body locally. Values are never returned. @example lintAccess("### Request\nother") */
export function lintAccess(body: string): LintResult {
  if (new TextEncoder().encode(body).byteLength > 65536) throw new Error("Access form exceeds 64 KiB");
  const sections = new Map<string, string[]>();
  let current = "",
    fenced = false;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced ? /^###\s+(.+?)\s*$/.exec(line) : null;
    if (heading) {
      current = heading[1]!.trim();
      sections.set(current, [...(sections.get(current) ?? []), ""]);
    } else if (current) {
      const entries = sections.get(current)!;
      entries[entries.length - 1] += `${line}\n`;
    }
  }
  const findings: LintResult["findings"] = [];
  for (const field of accessForm.fields) {
    const entries = sections.get(field.label) ?? [];
    const value = entries[0]?.replace(/<!--[\s\S]*?-->/g, "").trim() ?? "";
    if (entries.length > 1) findings.push({ field: field.label, problem: "Duplicate field" });
    else if (!value || /^(?:_No response_|None|N\/A|TODO|TBD|\[\s*\])$/i.test(value))
      findings.push({ field: field.label, problem: "Required field is missing" });
    else if (field.options.length && !(field.options as readonly string[]).includes(value))
      findings.push({ field: field.label, problem: "Choose an option from the pinned form" });
  }
  return { valid: findings.length === 0, form: accessForm.source, findings };
}
