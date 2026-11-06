// SPDX-License-Identifier: Apache-2.0
import type { CSSProperties, ReactNode } from "react";

/**
 * The hero for story pages. Each title line rises once at first paint. The accent line takes the decorative
 * signal gradient. Example: <PageHero eyebrow="Findings" lines={["The arithmetic passes."]} lede="..." />.
 */
export function PageHero({
  eyebrow,
  lines,
  accent,
  lede,
  children,
}: {
  eyebrow: string;
  lines: readonly string[];
  accent?: number;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading page-hero">
      <p className="eyebrow page-hero-eyebrow">
        <span aria-hidden="true" />
        {eyebrow}
      </p>
      <h1>
        {lines.map((line, index) => (
          <span className="split-word" key={line}>
            <span className={index === accent ? "signal-text" : undefined} style={{ "--i": index } as CSSProperties}>
              {line}
            </span>
          </span>
        ))}
      </h1>
      {lede && <p className="intro">{lede}</p>}
      {children && <div className="page-hero-actions">{children}</div>}
    </header>
  );
}
