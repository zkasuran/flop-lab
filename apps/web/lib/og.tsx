// SPDX-License-Identifier: Apache-2.0
// Shared social card layout. Satori renders it at build time, so every element uses flex layout and inline styles.
import type { ReactNode } from "react";
import type { ClaimStatus } from "./status";

export const OG_SIZE = { width: 1200, height: 630 };
const ink = {
  background: "#0a0d0b",
  surface: "#101512",
  border: "#263029",
  strong: "#435047",
  foreground: "#eef3ea",
  muted: "#a3afa6",
  accent: "#c2f07f",
  fail: "#ff9f93",
  warning: "#f2d083",
};

function Mark() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        width: 50,
        height: 50,
        gap: 4,
        padding: 7,
        borderRadius: 12,
        border: `2px solid ${ink.strong}`,
      }}
    >
      <div style={{ width: 14, height: 14, borderRadius: 4, background: ink.accent }} />
      <div style={{ width: 14, height: 14, borderRadius: 4, background: ink.accent }} />
      <div style={{ width: 14, height: 14, borderRadius: 4, background: ink.accent }} />
      <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${ink.warning}` }} />
    </div>
  );
}

/** One small cell per recorded claim, coloured by outcome. Example: <OgMatrix statuses={run.claims.map((c) => c.status)} />. */
export function OgMatrix({ statuses }: { statuses: ClaimStatus[] }) {
  const style = (status: ClaimStatus) =>
    status === "PASS"
      ? { background: ink.accent }
      : status === "FAIL"
        ? { background: ink.fail }
        : status === "UNVERIFIABLE"
          ? { border: `2px solid ${ink.warning}`, background: "rgba(242, 208, 131, 0.14)" }
          : { border: `2px solid ${ink.strong}` };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: 432, gap: 8 }}>
      {statuses.map((status, index) => (
        <div key={index} style={{ width: 46, height: 46, borderRadius: 8, ...style(status) }} />
      ))}
    </div>
  );
}

/** The card frame: wordmark, title, an optional subtitle, a footer line and an optional visual on the right. */
export function OgCard({
  eyebrow,
  title,
  subtitle,
  footer,
  visual,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  footer: string;
  visual?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: 64,
        background: ink.background,
        backgroundImage: `radial-gradient(circle at 78% 40%, rgba(194, 240, 127, 0.14), rgba(10, 13, 11, 0) 55%)`,
        color: ink.foreground,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark />
          <div style={{ display: "flex", fontSize: 32, letterSpacing: -1.5 }}>
            flop<span style={{ color: ink.muted }}>-lab</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: ink.muted, textTransform: "uppercase" }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              lineHeight: 1.02,
              letterSpacing: -3.5,
              maxWidth: visual ? 600 : 960,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                lineHeight: 1.3,
                color: ink.muted,
                maxWidth: visual ? 600 : 960,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: ink.accent, maxWidth: visual ? 600 : 960 }}>{footer}</div>
      </div>
      {visual && <div style={{ display: "flex", alignItems: "center", paddingLeft: 40 }}>{visual}</div>}
    </div>
  );
}
