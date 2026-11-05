// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";
import type { Observation, Stats } from "@/lib/devnet";
import { age, isStale } from "@/lib/observation-view";
import styles from "./home.module.css";

/** The latest block observation with its age. It is a reading, not a liveness claim. Example: <LiveStatus stats={snapshot.stats} renderedAt={snapshot.renderedAt} />. */
export function LiveStatus({ stats, renderedAt }: { stats: Observation<Stats>; renderedAt: string }) {
  const [now, setNow] = useState(Date.parse(renderedAt));
  useEffect(() => {
    // The page can be served from a cache. Age uses this browser's clock.
    setNow(Date.now());
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const stale = isStale(stats, now);
  const block = stats.value?.block;
  return (
    <p className={styles.live} data-stale={stale}>
      <span className="status-dot" aria-hidden="true" />
      <span className={styles.liveState}>{stale ? "Last known" : "Observed"}</span>
      <span className={styles.liveDivider} aria-hidden="true" />
      <span>
        Devnet block <span className="mono">{block === undefined ? "unavailable" : block.toLocaleString("en-US")}</span>
      </span>
      <span className={styles.liveDivider} aria-hidden="true" />
      <span className="muted">{age(stats.measuredAt, now)}</span>
    </p>
  );
}
