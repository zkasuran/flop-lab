// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { rankRecordedHistory, type RankedMiner } from "../../../../packages/scoreboard/src/scoring";
import type { Snapshot } from "../../../../packages/scoreboard/src/schema";
import styles from "./reliability.module.css";

const short = (address: string) => `${address.slice(0, 7)}...${address.slice(-6)}`;
const percent = (value: number | null) => (value === null ? "No data" : `${(value * 100).toFixed(1)}%`);

/** A dated, filterable event sample for one miner. Example: <MinerTimeline row={row} /> */
export function MinerTimeline({ row }: { row: RankedMiner }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const r = row.reliability;
  const events = [
    ...r.events.map((e) => ({ ...e, key: `event:${e.id}`, label: e.kind, note: "Reliability event" })),
    ...r.ghostSnapshots.map((e) => ({
      ...e,
      key: `ghost:${e.id}`,
      label: `ghost_${e.eventKind}`,
      note: `Cumulative ghost counters: ${e.totalCompleted ?? "unknown"} completed, ${e.totalExpired ?? "unknown"} expired, ${e.totalIncorrect ?? "unknown"} incorrect.`,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp || a.key.localeCompare(b.key));
  const filtered = events.filter((e) => filter === "all" || e.label === filter);
  return (
    <section className={styles.timeline} aria-label="Miner reliability timeline">
      <h3>Reliability timeline</h3>
      <p className="muted">
        {r.ghostStatus === "failure-observed"
          ? "Ghost failure observed."
          : r.ghostStatus === "completion-observed"
            ? "Ghost completion observed."
            : "No usable ghost outcome."}{" "}
        These observations do not prove registration or current serving capacity.
      </p>
      {r.measuredAt && (
        <p className={styles.source}>
          <a href={r.source}>Indexer evidence ↗</a> · <time>{r.measuredAt}</time>
          <br />
          Captured window: <time>{new Date(r.from!).toISOString()}</time> to{" "}
          <time>{new Date(r.to!).toISOString()}</time>. Only complete days enter the score.
        </p>
      )}
      <label>
        Event kind
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setExpanded(false);
          }}
        >
          <option value="all">All observed kinds</option>
          {[...new Set(events.map((e) => e.label))].map((kind) => (
            <option key={kind}>{kind}</option>
          ))}
        </select>
      </label>
      <p className="muted">
        {filtered.length} matching observations in the bounded sample. Missing events do not establish absence.
      </p>
      <motion.ol layout={!reduced} className={styles.events}>
        <AnimatePresence initial={false}>
          {filtered.slice(0, expanded ? 200 : 8).map((e) => (
            <motion.li
              key={e.key}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
            >
              <strong>{e.label}</strong>
              <time>{new Date(e.timestamp).toISOString()}</time>
              <small>
                Block {e.blockNumber} · {e.note}
              </small>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ol>
      {!filtered.length && <p role="status">No matching events in this sample.</p>}
      {filtered.length > 8 && (
        <motion.button
          className="quiet-button"
          whileHover={{ scale: reduced ? 1 : 1.02 }}
          whileTap={{ scale: reduced ? 1 : 0.98 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer events" : "Show all sampled events"}
        </motion.button>
      )}
    </section>
  );
}

/** Compare the same captured fields without peer-relative scoring. Example: <MinerComparison rows={rows} snapshot={snapshot} onInspect={open} /> */
export function MinerComparison({
  rows,
  snapshot,
  onInspect,
}: {
  rows: RankedMiner[];
  snapshot: Snapshot;
  onInspect: (miner: string) => void;
}) {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const reduced = useReducedMotion();
  const a = rows.find((r) => r.miner === left) ?? rows[0];
  const b = rows.find((r) => r.miner === right && r.miner !== a?.miner) ?? rows.find((r) => r.miner !== a?.miner);
  const history = rankRecordedHistory(snapshot);
  const delta =
    a?.score !== null && a?.score !== undefined && b?.score !== null && b?.score !== undefined
      ? a.score - b.score
      : null;
  return (
    <section className="section" aria-labelledby="comparison-heading" id="compare-miners">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Compare over time</p>
          <h2 id="comparison-heading">Two miners. The same evidence.</h2>
        </div>
        <p className="muted">
          Acknowledgements, ghost outcomes and proof activity remain separate. A missing term earns no points.
        </p>
      </div>
      <div className={styles.grid}>
        {[
          { row: a, label: "Miner A", set: setLeft },
          { row: b, label: "Miner B", set: setRight },
        ].map(({ row, label, set }) => (
          <div key={label} className={styles.card}>
            <label>
              {label}
              <select aria-label={label} value={row?.miner ?? ""} onChange={(e) => set(e.target.value)}>
                {!row && <option value="">No other miner</option>}
                {rows.map((r) => (
                  <option key={r.miner} value={r.miner} disabled={label === "Miner B" && r.miner === a?.miner}>
                    {short(r.miner)}
                  </option>
                ))}
              </select>
            </label>
            <AnimatePresence mode="wait" initial={false}>
              {row && (
                <motion.div
                  key={row.miner}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <p className={styles.address}>{row.miner}</p>
                  <div className={styles.score}>
                    <strong>{row.score?.toFixed(2) ?? "No score"}</strong>
                    <span>{row.scoreVersion} / 100</span>
                  </div>
                  <div className={styles.track} aria-hidden="true">
                    <motion.div
                      initial={reduced ? false : { scaleX: 0 }}
                      animate={{ scaleX: (row.score ?? 0) / 100 }}
                      transition={{ duration: reduced ? 0 : 0.4 }}
                    />
                  </div>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Acknowledgement ratio</dt>
                      <dd>{percent(row.reliability.acknowledgements)}</dd>
                    </div>
                    <div>
                      <dt>Observed ack outcomes</dt>
                      <dd>{row.reliability.acknowledgementOutcomes || "No data"}</dd>
                    </div>
                    <div>
                      <dt>Ghost pass ratio</dt>
                      <dd>{percent(row.reliability.ghostPass)}</dd>
                    </div>
                    <div>
                      <dt>Ghost signal</dt>
                      <dd>{row.reliability.ghostStatus}</dd>
                    </div>
                    <div>
                      <dt>Window proof count</dt>
                      <dd>{row.reliability.proofs ?? "No data"}</dd>
                    </div>
                    <div>
                      <dt>Usable settlements</dt>
                      <dd>{row.settlements}</dd>
                    </div>
                    <div>
                      <dt>Cumulative outcome term</dt>
                      <dd>{percent(row.reliability.terms.find((t) => t.name === "outcomes")?.value ?? null)}</dd>
                    </div>
                  </dl>
                  <motion.button
                    className="quiet-button"
                    whileHover={{ scale: reduced ? 1 : 1.02 }}
                    whileTap={{ scale: reduced ? 1 : 0.98 }}
                    onClick={() => onInspect(row.miner)}
                  >
                    Inspect {label} timeline ↗
                  </motion.button>
                  {row.reliability.measuredAt && (
                    <p className={styles.source}>
                      <a href={row.reliability.source}>Indexer series ↗</a>
                      <br />
                      <time>{row.reliability.measuredAt}</time>
                    </p>
                  )}
                  {history.length > 0 && (
                    <>
                      <h3>Recorder sample scores</h3>
                      <ul className={styles.history}>
                        {history.map((point) => (
                          <li key={point.source}>
                            <a href={point.source}>
                              <time>{point.measuredAt}</time>
                            </a>
                            <strong>
                              {point.rows.find((r) => r.miner === row.miner)?.score?.toFixed(2) ?? "No data"}
                            </strong>
                          </li>
                        ))}
                      </ul>
                      <p className="muted">
                        Each sample uses settlement-v1 at capture time. Separate samples are not an uptime trend.
                      </p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p aria-live="polite">
        {delta === null
          ? "Both miners need a score to show a difference."
          : `A minus B: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} evidence points. This is not a success probability.`}
      </p>
      {!history.length && (
        <p className="muted">
          Recorder history: {snapshot.archive?.state ?? "not captured"}. Reliability history uses the indexer series. No
          missing days are filled.
        </p>
      )}
    </section>
  );
}
