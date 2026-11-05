// SPDX-License-Identifier: Apache-2.0
/** Extract the dated Intel advisory fields, refusing an unrelated page. @example parseIntelAdvisory(html) */
export function parseIntelAdvisory(html: string): {
  id: string;
  originalRelease: string;
  lastRevised: string;
  title: string;
} {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const id = text.match(/Intel ID:\s*(INTEL-SA-\d+)/)?.[1];
  const title = text.match(/2019\.2 IPU.{0,100}?Update Advisory/)?.[0];
  const iso = (label: string) => {
    const match = text.match(new RegExp(`${label}:\\s*(\\d{2})/(\\d{2})/(\\d{4})`));
    if (!match) throw new Error(`Intel page has no ${label}`);
    const date = `${match[3]}-${match[1]}-${match[2]}`;
    if (!Number.isFinite(Date.parse(date))) throw new Error("Invalid Intel date");
    return date;
  };
  if (id !== "INTEL-SA-00219" || !title) throw new Error("Unexpected Intel advisory page");
  return { id, originalRelease: iso("Original release"), lastRevised: iso("Last revised"), title };
}
