// SPDX-License-Identifier: Apache-2.0
"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Observation, Snapshot } from "@/lib/devnet";

function age(at: string | null, now: number): string {
  if (!at) return "not measured";
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  return seconds < 60
    ? `${seconds}s old`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m old`
      : `${Math.floor(seconds / 3600)}h old`;
}
function position(address: string) {
  let hash = 2166136261;
  for (const char of address) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return { x: 28 + (hash % 324), y: 25 + ((hash >>> 12) % 205) };
}
function Source({ observation, now }: { observation: Observation<unknown>; now: number }) {
  const stale = observation.stale || !observation.measuredAt || now - Date.parse(observation.measuredAt) > 60_000;
  return (
    <div className="observation-source">
      <span className={stale ? "warning" : "muted"}>
        {stale ? "Last known" : "Observed"} · {age(observation.measuredAt, now)}
      </span>
      <span>
        Measured at{" "}
        {observation.measuredAt ? (
          <time dateTime={observation.measuredAt}>{observation.measuredAt.replace("T", " ").replace(".000", "")}</time>
        ) : (
          "unavailable"
        )}
      </span>
      <span className="source-name">{observation.source}</span>
      {observation.error && <span className="warning">Source unavailable: {observation.error}</span>}
    </div>
  );
}

export function DevnetPanel({ snapshot, visual = false }: { snapshot: Snapshot; visual?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(Date.parse(snapshot.renderedAt));
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const previous = useRef(new Set(snapshot.settlements.value?.map((row) => row.channel)));
  const [pulses, setPulses] = useState<string[]>([]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!visual && !document.hidden) router.refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [router, visual]);
  useEffect(() => {
    const rows = snapshot.settlements.value ?? [];
    setPulses(rows.filter((row) => !previous.current.has(row.channel)).map((row) => row.miner));
    previous.current = new Set(rows.map((row) => row.channel));
  }, [snapshot.settlements]);
  const last = snapshot.settlements.value?.[0];
  if (visual)
    return (
      <div ref={ref} className="hero-panel miner-map">
        <div className="map-heading">
          <p className="eyebrow">Price-source map</p>
          <span className="badge">Observed addresses</span>
        </div>
        <svg
          viewBox="0 0 380 260"
          role="img"
          aria-label="Miner addresses positioned by address hash. Highlighted nodes appear in the returned settlement page."
        >
          <path
            d="M0 65H380M0 130H380M0 195H380M95 0V260M190 0V260M285 0V260"
            stroke="var(--border)"
            strokeWidth="0.5"
          />
          {(snapshot.miners.value ?? []).map((miner) => {
            const { x, y } = position(miner);
            const settled = snapshot.settlements.value?.some((row) => row.miner === miner);
            return (
              <motion.g
                key={miner}
                aria-label={`${miner}${settled ? " / in settlement sample" : ""}`}
                layout={!reduced}
                transition={{ duration: reduced ? 0 : 0.4 }}
              >
                <motion.circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill={settled ? "var(--accent)" : "var(--muted)"}
                  animate={{ r: !reduced && visible && pulses.includes(miner) ? [6, 12, 6] : 6 }}
                  transition={{ duration: reduced ? 0 : 0.5 }}
                />
                <text x={x} y={y + 20} textAnchor="middle" fill="var(--muted)" fontSize="9" fontFamily="monospace">
                  {miner.slice(0, 5)}
                </text>
              </motion.g>
            );
          })}
          {!snapshot.miners.value?.length && (
            <text x="190" y="130" textAnchor="middle" fill="var(--muted)" fontSize="14">
              No miner addresses observed
            </text>
          )}
        </svg>
        <p className="muted map-caption">
          One node per price-source address. Position is an address hash, not geography. Highlight means seen in the
          settlement sample.
        </p>
        <details className="map-details">
          <summary>Read addresses and source time</summary>
          <Source observation={snapshot.miners} now={now} />
          <ul>
            {snapshot.miners.value?.map((miner) => (
              <li key={miner}>
                <code>{miner}</code>
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  return (
    <section className="live-strip" aria-labelledby="observations-title">
      <div className="strip-heading">
        <h2 id="observations-title" className="eyebrow">
          Devnet observations
        </h2>
        <p className="muted">Refresh window: 30 seconds. Source failures retain dated values.</p>
      </div>
      <div className="stats-grid">
        <article>
          <h3>Block height</h3>
          <p className="stat-value mono">{snapshot.stats.value?.block.toLocaleString("en-US") ?? "No data"}</p>
          <Source observation={snapshot.stats} now={now} />
        </article>
        <article>
          <h3>Accounts</h3>
          <p className="stat-value mono">{snapshot.stats.value?.accounts.toLocaleString("en-US") ?? "No data"}</p>
          <Source observation={snapshot.stats} now={now} />
        </article>
        <article>
          <h3>Miners in price sources</h3>
          <p className="stat-value mono">{snapshot.miners.value?.length ?? "No data"}</p>
          <Source observation={snapshot.miners} now={now} />
        </article>
        <article>
          <h3>Last settlement in sample</h3>
          <p className="stat-value stat-time mono">
            {last ? (
              <time dateTime={new Date(last.at).toISOString()}>
                {new Date(last.at).toISOString().replace("T", " ").replace(".000", "")}
              </time>
            ) : (
              "No data"
            )}
          </p>
          <Source observation={snapshot.settlements} now={now} />
        </article>
      </div>
      <p className="strip-note muted">
        Public gateway and indexer observations. Price-source addresses are not active operator counts. No inference,
        uptime or proof validity is inferred. Settlements show the latest timestamp in the returned page.
      </p>
    </section>
  );
}
