// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Observation, Snapshot } from "@/lib/devnet";
import { age, compareSample, isStale } from "@/lib/observation-view";
import { Disclosure, EASE_OUT, MotionButton, ObservedNumber } from "./motion";
import { recordedModels, withRecording, type ModelFallback } from "@/app/history/fallback";

function addressHash(address: string) {
  let hash = 2166136261;
  for (const char of address) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
function Source({ observation, now }: { observation: Observation<unknown>; now: number }) {
  const stale = isStale(observation, now);
  return (
    <div className="observation-source">
      <span className={stale ? "warning" : "success"}>
        <span className="status-dot" aria-hidden="true" />
        {observation.source.startsWith("Recorded snapshot")
          ? "Recorded snapshot"
          : stale
            ? "Last known"
            : "Observed"} / {age(observation.measuredAt, now)}
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

function MinerMap({ snapshot, now, pulses }: { snapshot: Snapshot; now: number; pulses: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.25 });
  const reduced = useReducedMotion() !== false;
  const [sampleOnly, setSampleOnly] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const update = () => setTabVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const addresses = snapshot.miners.value ?? [];
  const ordered = [...addresses].sort((a, b) => addressHash(a) - addressHash(b) || a.localeCompare(b));
  const columns = Math.min(6, ordered.length);
  const rows = Math.ceil(ordered.length / Math.max(1, columns));
  // The plot grows with the number of rows so a short list stays compact.
  const rowGap = 64;
  const height = Math.max(1, rows) * rowGap + 8;
  const guides = [
    ...Array.from({ length: Math.max(0, rows - 1) }, (_, row) => `M0 ${30 + rowGap / 2 + row * rowGap}H380`),
    `M95 0V${height}M190 0V${height}M285 0V${height}`,
  ].join("");
  const sampled = new Set(snapshot.settlements.value?.map((row) => row.miner));
  const comparison = compareSample(snapshot.miners.value, snapshot.settlements.value);
  const matches = comparison?.matches ?? [];
  const known = comparison !== null;
  const stale = [snapshot.miners, snapshot.settlements].some((observation) => isStale(observation, now));
  const shown = sampleOnly ? matches : addresses;
  const moving = !reduced && visible && tabVisible;
  return (
    <div ref={ref} className="miner-map frame">
      <div className="map-heading">
        <p className="eyebrow">Price sources / Settlement sample</p>
        <span className={`badge ${stale ? "warning" : "success"}`}>{stale ? "Last known" : "Observed addresses"}</span>
      </div>
      <div className="map-total">
        <span className="mono">
          <ObservedNumber value={snapshot.miners.value?.length} />
        </span>
        <span className="muted">distinct price-source addresses</span>
      </div>
      <div className="map-filters" role="group" aria-label="Map addresses">
        <LayoutGroup id="map-filter">
          {[
            { value: false, label: "All addresses", disabled: false },
            { value: true, label: "In sample", disabled: !known },
          ].map((option) => (
            <MotionButton
              key={option.label}
              className="quiet-button"
              aria-pressed={sampleOnly === option.value}
              disabled={option.disabled}
              onClick={() => setSampleOnly(option.value)}
            >
              {sampleOnly === option.value && (
                <motion.span
                  layoutId="map-filter-pill"
                  className="filter-pill"
                  transition={{ duration: reduced ? 0 : 0.24, ease: EASE_OUT }}
                />
              )}
              <span>{option.label}</span>
            </MotionButton>
          ))}
        </LayoutGroup>
      </div>
      <svg
        className="map-plot"
        viewBox={`0 0 380 ${height}`}
        role="img"
        aria-label="Miner addresses ordered by address hash. Filled nodes appear in the returned settlement page."
      >
        <defs>
          <radialGradient id="node-glow">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={guides} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4" />
        <AnimatePresence initial={false}>
          {shown.map((miner, index) => {
            const slot = ordered.indexOf(miner);
            const x = columns > 1 ? 28 + (slot % columns) * (324 / (columns - 1)) : 190;
            const y = 30 + Math.floor(slot / columns) * rowGap;
            const settled = sampled.has(miner);
            return (
              <motion.g
                key={miner}
                aria-label={`${miner}${settled ? " / in settlement sample" : ""}`}
                className="map-node"
                initial={false}
                animate={{ opacity: 1, y: moving || reduced ? 0 : 8 }}
                exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.18, delay: 0 } }}
                transition={{
                  duration: reduced ? 0 : 0.3,
                  ease: EASE_OUT,
                  delay: reduced ? 0 : Math.min(index * 0.02, 0.2),
                }}
              >
                {settled && <circle cx={x} cy={y} r={20} fill="url(#node-glow)" />}
                {moving && pulses.includes(miner) ? (
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={11}
                    fill="none"
                    stroke={settled ? "var(--accent)" : "var(--muted)"}
                    style={{ transformOrigin: `${x}px ${y}px` }}
                    animate={{ scale: [1, 1.8, 1] }}
                    transition={{ duration: reduced ? 0 : 0.5 }}
                  />
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={11}
                    fill="var(--background)"
                    stroke={settled ? "var(--accent)" : "var(--border-strong)"}
                  />
                )}
                <circle cx={x} cy={y} r={4} fill={settled ? "var(--accent)" : "var(--surface-raised)"} />
                <text x={x} y={y + 26} textAnchor="middle" fill="var(--subtle)" fontSize="9" className="map-label">
                  {miner.slice(0, 5)}
                </text>
              </motion.g>
            );
          })}
        </AnimatePresence>
        {!shown.length && (
          <text x="190" y={height / 2} textAnchor="middle" fill="var(--muted)" fontSize="12">
            {sampleOnly ? "No matching addresses in this page" : "No miner addresses observed"}
          </text>
        )}
      </svg>
      <p className="map-caption" role="status">
        {known ? (
          <>
            <ObservedNumber value={matches.length} /> of <ObservedNumber value={addresses.length} /> price-source
            addresses in the settlement page
          </>
        ) : (
          "Sample comparison unavailable"
        )}
      </p>
      <div className="sample-track" aria-hidden="true">
        <motion.div
          className="sample-fill"
          initial={false}
          animate={{
            scaleX: reduced || visible ? (comparison?.ratio ?? 0) : 0,
          }}
          transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT }}
        />
      </div>
      <p className="muted map-caption">
        One node per address, ordered by address hash. Not geography. A filled centre means a sample match. This is not
        a measure of activity or capacity.
      </p>
      <div className="map-details">
        <Disclosure title="Read addresses and source times">
          <p className="eyebrow">Price sources</p>
          <Source observation={snapshot.miners} now={now} />
          <p className="eyebrow">Settlement page</p>
          <Source observation={snapshot.settlements} now={now} />
          <motion.ul layout={!reduced} transition={{ duration: reduced ? 0 : 0.24 }}>
            <AnimatePresence initial={false}>
              {shown.map((miner) => (
                <motion.li
                  layout={!reduced}
                  key={miner}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                >
                  <code>{miner}</code>
                  <span className="muted">
                    {!known ? " / sample unavailable" : sampled.has(miner) ? " / in sample" : " / absent from sample"}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {!shown.length && <p className="muted">No addresses in this view.</p>}
        </Disclosure>
      </div>
    </div>
  );
}

export function DevnetPanel({ snapshot: liveSnapshot, visual = false }: { snapshot: Snapshot; visual?: boolean }) {
  const [recording, setRecording] = useState<ModelFallback | null>(null);
  const snapshot = withRecording(liveSnapshot, recording);
  useEffect(() => {
    let active = true;
    if (liveSnapshot.miners.stale || liveSnapshot.miners.value === null) {
      void recordedModels().then((value) => {
        if (active) setRecording(value);
      });
    }
    return () => {
      active = false;
    };
  }, [liveSnapshot.miners.stale, liveSnapshot.renderedAt, liveSnapshot.miners.value]);
  const router = useRouter();
  const [now, setNow] = useState(Date.parse(snapshot.renderedAt));
  const previous = useRef(new Set(snapshot.settlements.value?.map((row) => row.channel)));
  const [pulses, setPulses] = useState<string[]>([]);
  useEffect(() => {
    // The server-rendered page can itself be cached. Its render time is not the browser's current time.
    setNow(Date.now());
    const onVisibility = () => {
      setNow(Date.now());
      if (!visual && !document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!visual && !document.hidden) router.refresh();
    }, 30_000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, visual]);
  useEffect(() => {
    const rows = snapshot.settlements.value ?? [];
    setPulses(rows.filter((row) => !previous.current.has(row.channel)).map((row) => row.miner));
    previous.current = new Set(rows.map((row) => row.channel));
    const timer = setTimeout(() => setPulses([]), 500);
    return () => clearTimeout(timer);
  }, [snapshot.settlements]);
  const last = snapshot.settlements.value?.[0];
  if (visual) return <MinerMap snapshot={snapshot} now={now} pulses={pulses} />;
  const stale = [snapshot.stats, snapshot.miners, snapshot.settlements].some((observation) =>
    isStale(observation, now),
  );
  return (
    <section className="live-strip frame" aria-labelledby="observations-title">
      <div className="strip-heading">
        <h2 id="observations-title" className="eyebrow">
          <span className={stale ? "warning" : "success"}>
            <span className="status-dot" aria-hidden="true" />
          </span>
          Devnet observations
        </h2>
        <p className="muted">Refresh window: 30 seconds. Source failures retain dated values.</p>
      </div>
      <div className="stats-grid">
        <article>
          <h3>Block height</h3>
          <p className="stat-value mono">
            <ObservedNumber value={snapshot.stats.value?.block} />
          </p>
          <Source observation={snapshot.stats} now={now} />
        </article>
        <article>
          <h3>Accounts</h3>
          <p className="stat-value mono">
            <ObservedNumber value={snapshot.stats.value?.accounts} />
          </p>
          <Source observation={snapshot.stats} now={now} />
        </article>
        <article>
          <h3>Miners in price sources</h3>
          <p className="stat-value mono">
            <ObservedNumber value={snapshot.miners.value?.length} />
          </p>
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
