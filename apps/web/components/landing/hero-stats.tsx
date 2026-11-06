// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";
import type { Observation, Stats } from "@/lib/devnet";
import { age, isStale } from "@/lib/observation-view";
import { SwapValue } from "../motion";
import styles from "./landing.module.css";

export type HeroFigure = { label: string; value: string; note: string; recordedAt: string; href: string };

function day(at: string): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * The hero readings strip. The block reading ages against this browser's clock. Recorded figures keep their
 * capture date and link to the recording. Values change as whole values. Example: <HeroStats stats={...} />.
 */
export function HeroStats({
  stats,
  miners,
  renderedAt,
  figures,
}: {
  stats: Observation<Stats>;
  miners: { count: number | null; inSample: number | null; observation: Observation<unknown> };
  renderedAt: string;
  figures: readonly HeroFigure[];
}) {
  const [now, setNow] = useState(Date.parse(renderedAt));
  useEffect(() => {
    // A cached page has an older render time. Age uses this browser's clock.
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const blockStale = isStale(stats, now);
  const minersStale = isStale(miners.observation, now);
  const block = stats.value?.block;
  return (
    <dl className={styles.stats}>
      <div className={styles.stat}>
        <dt>Devnet block</dt>
        <dd className={`mono ${styles.statValue}`}>
          <SwapValue value={block === undefined ? "No data" : block.toLocaleString("en-US")} />
        </dd>
        <dd className={styles.statNote} data-stale={blockStale}>
          <span className="status-dot" aria-hidden="true" />
          {blockStale ? "Last known" : "Observed"} / {age(stats.measuredAt, now)}
        </dd>
      </div>
      <div className={styles.stat}>
        <dt>Price-source addresses</dt>
        <dd className={`mono ${styles.statValue}`}>
          <SwapValue value={miners.count === null ? "No data" : String(miners.count)} />
        </dd>
        <dd className={styles.statNote} data-stale={minersStale}>
          <span className="status-dot" aria-hidden="true" />
          {miners.inSample === null ? "Sample unavailable" : `${miners.inSample} in the settlement sample`}
        </dd>
      </div>
      {figures.map((figure) => (
        <div className={styles.stat} key={figure.label}>
          <dt>{figure.label}</dt>
          <dd className={`mono ${styles.statValue}`}>{figure.value}</dd>
          <dd className={styles.statNote}>
            {figure.note} /{" "}
            <a href={figure.href}>
              recorded <time dateTime={figure.recordedAt}>{day(figure.recordedAt)}</time>
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
