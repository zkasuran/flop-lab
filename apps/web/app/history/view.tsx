// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import { analyze } from "../../../../packages/recorder/src/analysis";
import { DATA_URL } from "../../../../packages/recorder/src/feed";
import type { Index, Point } from "../../../../packages/recorder/src/schema";
import styles from "./view.module.css";

const labels: Record<string, string> = {
  "stats.latestBlockNumber": "Block height",
  "stats.totalAccounts": "Accounts",
  "models.miners": "Price-source addresses",
  "models.count": "Models",
  "stats.proofs24h": "Proofs in 24h",
  "stats.activeOperators": "Active operators",
};
const display = (value: Point["value"]) =>
  value === null ? "No data" : typeof value === "number" ? value.toLocaleString("en-US") : String(value);

export function HistoryView({
  index,
  mode,
  source,
  error,
}: {
  index: Index;
  mode: "recorded-fixture" | "data-branch";
  source: string;
  error: string | null;
}) {
  const analysis = analyze(index);
  const fields = Object.keys(analysis.series).filter((key) =>
    analysis.series[key]!.some((point) => typeof point.value === "number"),
  );
  const [field, setField] = useState("stats.latestBlockNumber");
  const [showChanges, setShowChanges] = useState(false);
  const selected = analysis.series[field] ?? [];
  const latest = selected.at(-1);
  const first = index.entries[0],
    last = index.entries.at(-1);
  const reduced = useReducedMotion() !== false;
  const chart = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: chart, offset: ["start 90%", "end 45%"] });
  const pathLength = useTransform(scrollYProgress, [0, 1], [0.05, 1]);
  const values = selected.flatMap((point) => (typeof point.value === "number" ? [point.value] : []));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const start = first ? Date.parse(first.measuredAt) : 0;
  const end = last ? Date.parse(last.measuredAt) : start;
  const points = selected.map((point, i) => ({
    ...point,
    x: 44 + (end > start ? (Date.parse(index.entries[i]!.measuredAt) - start) / (end - start) : 0.5) * 912,
    y: typeof point.value === "number" ? 200 - (max > min ? (point.value - min) / (max - min) : 0.5) * 150 : null,
  }));
  const path = points
    .map((point, i) =>
      point.y === null ? "" : `${i === 0 || points[i - 1]?.y === null ? "M" : "L"}${point.x},${point.y}`,
    )
    .join(" ");
  const events = analysis.events.filter((event) => !showChanges || event.kind === "claim-change");
  const command = "node packages/cli/dist/cli.js history record --store ./archive";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <ReadingReveal>
          <p className="eyebrow">Observe / Network history</p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h1>Keep the change.</h1>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="intro">
            How has the devnet changed? Compare dated public observations. Follow reset signals and see when a claim
            changes status.
          </p>
        </ReadingReveal>
        <ReadingReveal order={3}>
          <div className={styles.links}>
            <MotionLink href="/api/history.json">JSON feed ↗</MotionLink>
            <MotionLink href="/history/feed.xml">RSS changes ↗</MotionLink>
            <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/recorder">Source ↗</MotionLink>
          </div>
        </ReadingReveal>
      </header>
      <ReadingReveal order={4}>
        <aside className={styles.notice}>
          <span className="badge">{mode === "recorded-fixture" ? "Recorded fixture" : "Data branch"}</span>
          <p>
            {mode === "recorded-fixture"
              ? "The public archive has no usable index yet. These real runs were recorded close together to make the page inspectable. They do not establish a daily trend."
              : "Showing the rolling archive. Runs are separate observations, not atomic chain snapshots."}
          </p>
          <p className="muted">
            {first?.measuredAt} to {last?.measuredAt}. Revalidation window: 5 minutes.
          </p>
          {error && <p className="warning">Archive unavailable: {error}</p>}
        </aside>
      </ReadingReveal>
      <section className={styles.summary} aria-label="Recording summary">
        {[
          { label: "Recorded runs", value: index.entries.length },
          { label: "Reset signals", value: analysis.events.filter((e) => e.kind === "reset-signal").length },
          { label: "Claim changes", value: analysis.events.filter((e) => e.kind === "claim-change").length },
        ].map((item, order) => (
          <ReadingReveal key={item.label} order={order}>
            <article>
              <p className="eyebrow">{item.label}</p>
              <p className={styles.big}>
                <ObservedNumber value={item.value} />
              </p>
            </article>
          </ReadingReveal>
        ))}
      </section>
      <section className={styles.chart} ref={chart} aria-labelledby="series-heading">
        <div className={styles.chartHead}>
          <div>
            <p className="eyebrow">Observed series</p>
            <h2 id="series-heading">{labels[field] ?? field}</h2>
          </div>
          <p className={styles.big}>
            <ObservedNumber value={typeof latest?.value === "number" ? latest.value : undefined} />
          </p>
        </div>
        <div className={styles.filters} role="group" aria-label="Series field">
          {Object.entries(labels).map(([key, label]) => (
            <MotionButton key={key} className="quiet-button" aria-pressed={field === key} onClick={() => setField(key)}>
              {label}
            </MotionButton>
          ))}
        </div>
        <label className={styles.select}>
          All numeric fields{" "}
          <motion.select
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            whileHover={{ y: reduced ? 0 : -1 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            value={field}
            onChange={(event) => setField(event.target.value)}
          >
            {fields.map((name) => (
              <option key={name} value={name}>
                {labels[name] ?? name}
              </option>
            ))}
          </motion.select>
        </label>
        <svg
          className={styles.plot}
          viewBox="0 0 1000 250"
          role="img"
          aria-label={`${labels[field] ?? field}. ${selected.map((point) => `${point.measuredAt}: ${display(point.value)}`).join(". ")}`}
        >
          {[50, 125, 200].map((y) => (
            <path key={y} d={`M44 ${y}H956`} stroke="var(--border)" strokeDasharray="3 7" />
          ))}
          <text x="44" y="24" fill="var(--muted)" fontSize="12">
            Observed range {display(min)} to {display(max)}
          </text>
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.25" />
          <motion.path
            key={field}
            data-history-line
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            style={{ pathLength: reduced ? 1 : pathLength }}
          />
          {points.map((point, pointIndex) =>
            point.y === null ? null : (
              <g key={point.snapshotId}>
                <circle cx={point.x} cy={point.y} r="5" fill="var(--accent)" />
                {(points.length <= 8 || pointIndex === 0 || pointIndex === points.length - 1) && (
                  <text
                    x={point.x}
                    y={point.y - 12}
                    textAnchor={point.x > 900 ? "end" : point.x < 100 ? "start" : "middle"}
                    fill="var(--foreground)"
                    fontSize="14"
                  >
                    {display(point.value)}
                  </text>
                )}
                {analysis.events.some(
                  (event) => event.kind === "reset-signal" && event.snapshotId === point.snapshotId,
                ) && <path d={`M${point.x} 38V212`} stroke="var(--warning)" strokeDasharray="5 5" />}
              </g>
            ),
          )}
          <text x="44" y="239" fill="var(--muted)" fontSize="12">
            {first?.measuredAt}
          </text>
          <text x="956" y="239" textAnchor="end" fill="var(--muted)" fontSize="12">
            {last?.measuredAt}
          </text>
        </svg>
        <p className="muted">
          The line draws as you read. Dots and values are visible immediately. Straight segments connect samples. Gaps
          mean unavailable data. The vertical scale follows the observed range.
        </p>
        <Disclosure title="Read exact values and sources">
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Measured at (UTC)</th>
                  <th>Value</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((point) => (
                  <tr key={point.snapshotId}>
                    <td>
                      <time>{point.measuredAt}</time>
                    </td>
                    <td>{display(point.value)}</td>
                    <td>{point.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </section>
      <section className={styles.section} aria-labelledby="changes-heading">
        <div className={styles.chartHead}>
          <div>
            <p className="eyebrow">Between runs</p>
            <h2 id="changes-heading">Signals, with context.</h2>
          </div>
          <MotionButton
            className="quiet-button"
            aria-pressed={showChanges}
            onClick={() => setShowChanges(!showChanges)}
          >
            Claim changes only
          </MotionButton>
        </div>
        <p className="muted">
          A lower height or account count can reflect a reset or an indexer correction. A changed block-zero hash is
          reported evidence. No node consensus check is made here.
        </p>
        <motion.div layout={!reduced} transition={{ duration: reduced ? 0 : 0.2 }} className={styles.events}>
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.article
                key={event.id}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <span className="badge">{event.kind}</span>
                <h3>{event.field}</h3>
                <p>
                  {event.before} → {event.after}
                </p>
                <p className="muted">
                  {event.previousAt} to {event.measuredAt}
                </p>
                <p className="muted">{event.source}</p>
              </motion.article>
            ))}
          </AnimatePresence>
          {!events.length && (
            <p className={styles.empty}>
              No {showChanges ? "claim status changes" : "reset signals or claim status changes"} between these recorded
              runs.
            </p>
          )}
        </motion.div>
      </section>
      <section className={styles.section} aria-labelledby="claims-heading">
        <p className="eyebrow">Fixed checks / Bounded requests</p>
        <h2 id="claims-heading">Claim status timeline.</h2>
        <p className="muted">
          The same read-only claim set runs with each snapshot. UNVERIFIABLE and SKIPPED remain visible. Neither is a
          pass.
        </p>
        <div className={styles.timeline}>
          {index.entries.slice(-12).map((entry, order) => (
            <ReadingReveal key={entry.id} order={order}>
              <article>
                <time>{entry.measuredAt}</time>
                {entry.claims.map((claim) => (
                  <div key={claim.id} className={styles.claim}>
                    <span className="badge">{claim.status}</span>
                    <div>
                      <strong>{claim.id}</strong>
                      <p className="muted">{claim.reason}</p>
                    </div>
                  </div>
                ))}
                {!entry.claims.length && <p>No harness observation</p>}
                <Disclosure title="Snapshot provenance">
                  <code>{entry.id}</code>
                  <p className="muted">
                    {mode === "data-branch"
                      ? `${DATA_URL}${entry.path}`
                      : `Repository fixture: packages/recorder/test/fixtures/seed/${entry.path}`}
                  </p>
                  <p className="muted">
                    Each field has its own measurement time. A content hash checks bytes, not chain authenticity.
                  </p>
                </Disclosure>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </section>
      <ReadingPath
        title="From observation to history."
        steps={[
          { title: "Read", text: "Public MCP and gateway calls produce a dated snapshot. Failures remain explicit." },
          {
            title: "Keep",
            text: "A content-hashed file stays on the data branch. The signed main tree does not change for a recording.",
          },
          {
            title: "Compare",
            text: "Counts, reported genesis and claim status are compared with the previous available observation. Missing data stays missing.",
          },
        ]}
      />
      <section className={styles.section}>
        <h2>Keep your own record.</h2>
        <p className="muted">From a built checkout of flop-lab. No wallet or API key.</p>
        <div className="command">
          <code>{command}</code>
          <CopyButton text={command} />
        </div>
        <p className="muted">
          Public archive source: <MotionLink href={source}>{source}</MotionLink>
        </p>
        <h3>What this does not verify</h3>
        <p className="muted">
          No proof verification, finality check or uptime claim. Price-source addresses are not active operators.
          Historical price sources can be expired. Samples do not cover every settlement. The recorded fixture is not a
          daily trend.
        </p>
      </section>
    </div>
  );
}
