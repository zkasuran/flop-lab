// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { analyzeHistory, MAX_GAP_MS, type ServiceHistory } from "../../../../packages/status/src/history";
import type { HistoryRead } from "../../../../packages/status/src/remote";
import styles from "./view.module.css";

function Sparkline({ row }: { row: ServiceHistory }) {
  const reduced = useReducedMotion() !== false;
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true });
  const first = Date.parse(row.firstSample ?? ""),
    last = Date.parse(row.lastSample ?? "");
  const max = Math.max(1, ...row.points.map((p) => p.latencyMs));
  const x = (time: string) => (last === first ? 150 : 8 + ((Date.parse(time) - first) / (last - first)) * 284);
  const y = (latency: number) => 50 - (latency / max) * 40;
  const path = row.points
    .map(
      (p, i) =>
        `${i === 0 || Date.parse(p.measuredAt) - Date.parse(row.points[i - 1]!.measuredAt) > MAX_GAP_MS ? "M" : "L"}${x(p.measuredAt)},${y(p.latencyMs)}`,
    )
    .join(" ");
  return (
    <div className={styles.spark} ref={ref}>
      <svg
        viewBox="0 0 300 60"
        role="img"
        aria-label={`${row.name}: ${row.samples} elapsed-time samples; vertical scale 0 to ${max} milliseconds. Gaps over 4.5 hours break the line.`}
      >
        <path d="M8,50 L292,50" className={styles.axis} />
        <motion.path
          data-latency-path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          initial={false}
          animate={{ pathLength: reduced || visible ? 1 : 0 }}
          transition={{ duration: reduced ? 0 : 0.45 }}
        />
        {row.points.map((p, i) => (
          <circle
            key={`${p.measuredAt}-${i}`}
            cx={x(p.measuredAt)}
            cy={y(p.latencyMs)}
            r={3}
            className={p.outcome === "pass" ? styles.passDot : styles.failDot}
            aria-hidden="true"
          />
        ))}
      </svg>
      <span className="muted">
        0 to {max} ms · elapsed time · {row.samples} samples
      </span>
    </div>
  );
}

export function StatusView({ history }: { history: HistoryRead }) {
  const [latestOnly, setLatestOnly] = useState(false);
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [latencyOrder, setLatencyOrder] = useState(false);
  const reduced = useReducedMotion() !== false;
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 55%"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const sorted = [...history.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const runs = latestOnly ? sorted.slice(-1) : sorted;
  const times = runs.flatMap((r) => r.probes.map((p) => p.measuredAt)).sort();
  const window = { from: times[0] ?? new Date(0).toISOString(), to: times.at(-1) ?? new Date(0).toISOString() };
  const allRows = analyzeHistory(runs, window);
  const rows = allRows.filter((r) => !failuresOnly || r.passed < r.samples);
  if (latencyOrder) rows.sort((a, b) => (b.latest?.latencyMs ?? -1) - (a.latest?.latencyMs ?? -1));
  const sampleCount = allRows.reduce((n, r) => n + r.samples, 0);
  const passed = allRows.reduce((n, r) => n + r.passed, 0);
  const incidents = allRows.flatMap((r) => r.incidents.map((i) => ({ ...i, name: r.name, source: r.url })));
  const timeX = (time: string) =>
    window.from === window.to
      ? 150
      : 8 + ((Date.parse(time) - Date.parse(window.from)) / (Date.parse(window.to) - Date.parse(window.from))) * 284;
  return (
    <div className={styles.page}>
      <ToolHeader slug="status" />
      <ReadingReveal order={3}>
        <section className={styles.notice} aria-label="Observation source">
          <span className="badge">{history.mode === "recorded-fixture" ? "Recorded fixture" : "Dated archive"}</span>
          <p>{history.note}</p>
          <p className="muted">
            Archive checked <time>{history.checkedAt}</time>. Page cache: 5 minutes.
          </p>
          <p>
            <MotionLink href={history.source}>Source records ↗</MotionLink> ·{" "}
            <MotionLink href="/status/recording">Download displayed JSONL</MotionLink>
          </p>
          <div className={styles.command}>
            <code>pnpm --filter @flop-lab/cli exec flop status probe --json</code>
            <CopyButton text="pnpm --filter @flop-lab/cli exec flop status probe --json" label="Copy probe command" />
          </div>
        </section>
      </ReadingReveal>
      <div className={styles.summary}>
        <ReadingReveal order={0}>
          <p className="eyebrow">Content checks passed</p>
          <strong>
            <ObservedNumber value={sampleCount ? passed : undefined} /> <small>/ {sampleCount} probes</small>
          </strong>
          <p>HTTP 200 plus the expected content.</p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <p className="eyebrow">Recorded rounds</p>
          <strong>
            <ObservedNumber value={runs.length} />
          </strong>
          <p>Each round attempts every listed service once.</p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="eyebrow">Observed failure spans</p>
          <strong>
            <ObservedNumber value={sampleCount ? incidents.length : undefined} />
          </strong>
          <p>Sample boundaries, not continuous downtime.</p>
        </ReadingReveal>
      </div>
      <section aria-labelledby="services-heading">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">01 / Public responses</p>
            <h2 id="services-heading">The answer and the evidence.</h2>
          </div>
        </div>
        <p>
          Sample availability = passed probes / measured probes. Each probe has equal weight. No sample means no data.
        </p>
        <p className={styles.window}>
          {times.length ? (
            <>
              Selected window: <time>{window.from}</time> to <time>{window.to}</time>.
            </>
          ) : (
            "No measured window is available."
          )}
        </p>
        <p className="muted">
          Observers: {[...new Set(runs.map((r) => r.observer))].join(", ") || "No data"}. Sparklines use actual capture
          times and a separate vertical scale per service.
        </p>
        <div className={styles.controls}>
          <MotionButton className="quiet-button" aria-pressed={latestOnly} onClick={() => setLatestOnly(!latestOnly)}>
            Latest round only
          </MotionButton>
          <MotionButton
            className="quiet-button"
            aria-pressed={failuresOnly}
            onClick={() => setFailuresOnly(!failuresOnly)}
          >
            Failures only
          </MotionButton>
          <MotionButton
            className="quiet-button"
            aria-pressed={latencyOrder}
            onClick={() => setLatencyOrder(!latencyOrder)}
          >
            Slowest latest first
          </MotionButton>
        </div>
        <div className={styles.rows} aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row, index) => (
              <motion.article
                className={styles.row}
                key={row.id}
                layout={reduced ? false : "position"}
                initial={{ opacity: 1, y: reduced ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.3 }}
                data-service={row.id}
              >
                <ReadingReveal order={index % 3}>
                  <div className={styles.rowGrid}>
                    <div>
                      <h3>{row.name}</h3>
                      <span className={row.latest?.outcome === "pass" ? styles.pass : styles.fail}>
                        {row.latest
                          ? row.latest.outcome === "pass"
                            ? "Content passed"
                            : row.latest.outcome
                          : "No data"}
                      </span>
                      <p className="muted">Latest HTTP {row.latest?.httpStatus ?? "none"}</p>
                    </div>
                    <div>
                      <p className="eyebrow">Sample availability</p>
                      <strong className={styles.value}>
                        {row.availability === null ? "No data" : `${(row.availability * 100).toFixed(1)}%`}
                      </strong>
                      <p>
                        {row.passed} / {row.samples} measured probes
                      </p>
                      <div className={styles.barTrack}>
                        <motion.div
                          data-availability-bar
                          initial={false}
                          animate={{ scaleX: row.availability ?? 0 }}
                          transition={{ duration: reduced ? 0 : 0.4 }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="eyebrow">Latest elapsed time</p>
                      <strong className={styles.value}>
                        <ObservedNumber value={row.latest?.latencyMs} /> <small>ms</small>
                      </strong>
                      <Sparkline row={row} />
                    </div>
                  </div>
                  <p className={styles.stamp}>
                    {row.latest ? (
                      <>
                        <time>{row.latest.measuredAt}</time> · <MotionLink href={row.url}>{row.url} ↗</MotionLink>
                      </>
                    ) : (
                      <MotionLink href={row.url}>{row.url} ↗</MotionLink>
                    )}
                  </p>
                  <Disclosure title={`Inspect ${row.name} samples`}>
                    <p>
                      {row.method === "initialize" ? "MCP initialize" : "GET"}: {row.check}.
                    </p>
                    <p className="muted">
                      Window: {row.firstSample ?? "No data"} to {row.lastSample ?? "No data"}. Latency includes reading
                      the response body. A timeout measures time spent waiting.
                    </p>
                    <div className={styles.tableWrap}>
                      <table>
                        <caption>{row.name} measured samples</caption>
                        <thead>
                          <tr>
                            <th>Captured UTC</th>
                            <th>HTTP</th>
                            <th>Result</th>
                            <th>Elapsed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.points.map((p, i) => (
                            <tr key={`${p.measuredAt}-${i}`}>
                              <td>{p.measuredAt}</td>
                              <td>{p.httpStatus ?? "none"}</td>
                              <td>
                                {p.outcome}
                                <br />
                                <small>{p.detail}</small>
                              </td>
                              <td>{p.latencyMs} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Disclosure>
                </ReadingReveal>
              </motion.article>
            ))}
          </AnimatePresence>
          {!rows.length && (
            <p className={styles.empty}>
              No failed probes in this selected window. This does not cover the time between probes.
            </p>
          )}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="incidents-heading">
        <p className="eyebrow">02 / Failure observations</p>
        <h2 id="incidents-heading">Where a probe stopped passing.</h2>
        <p>
          A span joins consecutive failed samples from the same observer. Gaps over 4.5 hours break the span. A later
          passing sample marks observed recovery only.
        </p>
        {!incidents.length ? (
          <p className={styles.notice}>
            {sampleCount
              ? "No failed samples in this window. No incident duration can be inferred."
              : "No incident data. No probes were recorded in this window."}
          </p>
        ) : (
          incidents.map((incident, i) => (
            <ReadingReveal key={`${incident.name}-${i}`}>
              <article className={styles.incident}>
                <h3>{incident.name}</h3>
                <svg
                  className={styles.incidentTrack}
                  viewBox="0 0 300 24"
                  role="img"
                  aria-label={`Failed observations from ${incident.firstFailure} to ${incident.lastFailure} within the selected window`}
                >
                  <path d="M8,12 L292,12" className={styles.axis} />
                  <motion.path
                    d={`M${timeX(incident.firstFailure)},12 L${timeX(incident.lastFailure)},12`}
                    stroke="currentColor"
                    strokeWidth="4"
                    initial={false}
                    animate={{ opacity: 1 }}
                  />
                  <circle cx={timeX(incident.firstFailure)} cy="12" r="4" fill="currentColor" />
                  <circle cx={timeX(incident.lastFailure)} cy="12" r="4" fill="currentColor" />
                </svg>
                <p>
                  {incident.failedSamples} failed samples · {incident.observer}
                </p>
                <p>
                  First failure: {incident.firstFailure}
                  <br />
                  Last failure: {incident.lastFailure}
                  <br />
                  {incident.recoveryObservedAt
                    ? `Passing sample: ${incident.recoveryObservedAt}`
                    : `No recovery observed before ${incident.endReason === "gap" ? "the next data gap" : "the window ended"}`}
                </p>
                <MotionLink href={incident.source}>Probe source ↗</MotionLink>
              </article>
            </ReadingReveal>
          ))
        )}
      </section>
      <section ref={guide} className={`${styles.section} ${styles.guide}`} aria-labelledby="method-heading">
        <div className={styles.progress}>
          <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : progress }} />
        </div>
        <p className="eyebrow">03 / Read the boundary</p>
        <h2 id="method-heading">A passing page is a narrow claim.</h2>
        {[
          [
            "One request",
            "A probe makes one fixed GET or MCP initialize request. It has a total deadline and a bounded body. Redirects and retries cannot hide a failed first attempt.",
          ],
          [
            "Check the content",
            "Model ids, protocol information, page titles, health text and SDK metadata have explicit checks. MCP tools, inference, faucet funding and explorer queries are not exercised.",
          ],
          [
            "Keep the gaps visible",
            "Only recorded samples enter availability. Scheduled history is designed for one round every three hours. Missed runs stay missing. These observations do not prove continuous uptime or chain health.",
          ],
        ].map(([title, body], i) => (
          <ReadingReveal order={i} key={title}>
            <article className={styles.step}>
              <span className="eyebrow">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          </ReadingReveal>
        ))}
      </section>
    </div>
  );
}
