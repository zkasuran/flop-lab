// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolHeader } from "@/components/tool-header";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { analyzeRecording } from "../../../../packages/finality/src/analysis";
import { PAPER_URL, QUOTES, RULES } from "../../../../packages/finality/src/rules";
import { parseRecording, type Recording } from "../../../../packages/finality/src/schema";
import type { Index } from "../../../../packages/recorder/src/schema";
import styles from "./view.module.css";

type Initial = { recording: Recording; mode: "observed" | "recorded-fixture"; error: string | null; checkedAt: string };
type History = { index: Index; mode: "recorded-fixture" | "data-branch"; source: string };

export function FinalityView({ initial, history }: { initial: Initial; history: History }) {
  const [current, setCurrent] = useState(initial);
  const [live, setLive] = useState(!initial.error);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [reset, setReset] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const lastRecording = useRef(initial.recording);
  const report = analyzeRecording(current.recording);
  const reduced = useReducedMotion() !== false;
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 85%", "end 50%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch("/finality/live", { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("Public observation unavailable. Last-known data is retained.");
      const recording = parseRecording(await response.json());
      const next = analyzeRecording(recording);
      if (!mounted.current) return;
      const oldHead = analyzeRecording(lastRecording.current).blocks.at(-1);
      const newHead = next.blocks.at(-1);
      setReset(
        Boolean(
          oldHead &&
          newHead &&
          (newHead.number < oldHead.number || (newHead.number === oldHead.number && newHead.hash !== oldHead.hash)),
        ),
      );
      lastRecording.current = recording;
      setCurrent({ recording, mode: "observed", error: null, checkedAt: new Date().toISOString() });
      setSelected(null);
    } catch (e) {
      if (!mounted.current) return;
      setCurrent((previous) => ({
        ...previous,
        error: e instanceof Error ? e.message : String(e),
        checkedAt: new Date().toISOString(),
      }));
      setLive(false);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    return () => clearInterval(timer);
  }, [live, refresh]);

  const age = now === null ? null : Math.max(0, Math.floor((now - Date.parse(current.recording.measuredAt)) / 1000));
  const block = report.blocks.find((b) => b.hash === selected);
  const maxInterval = Math.max(RULES.blockMs, report.production.maxMs ?? 0);
  const rows = history.index.entries
    .slice(-12)
    .map((entry) => ({ id: entry.id, point: entry.fields["stats.latestBlockNumber"] }))
    .filter((r) => r.point);
  const lagScale = report.lag === null ? 0 : Math.min(1, report.lag / RULES.freezeBlocks);
  return (
    <div className={styles.page}>
      <ToolHeader slug="finality" />
      <ReadingReveal order={3}>
        <div className={styles.notice}>
          <div className={styles.controls}>
            <span className="badge">
              {current.mode === "recorded-fixture"
                ? "Recorded fixture"
                : current.error || (age !== null && age > 30)
                  ? "Last known"
                  : "Public observation"}
            </span>
            <span className="muted">{age === null ? "Capture time below" : `${age} s since capture`}</span>
            <MotionButton className="quiet-button" onClick={() => setLive(!live)} aria-pressed={live}>
              {live ? "Pause live updates" : "Resume live updates"}
            </MotionButton>
            <MotionButton className="quiet-button" onClick={() => void refresh()} disabled={busy}>
              {busy ? "Reading public data" : "Refresh now"}
            </MotionButton>
          </div>
          <p>
            Captured <time>{current.recording.measuredAt}</time> from{" "}
            <MotionLink href={current.recording.source}>hosted MCP ↗</MotionLink>.
          </p>
          <p className="muted">
            Poll and server cache: 15 seconds. Hidden tabs pause polling. A failed read pauses updates and keeps the
            last observation.
          </p>
          <p role="status" className={styles.status}>
            {current.error ??
              (reset
                ? "Head regression or changed hash observed. This is a reset or reorg signal, not proof of either."
                : "Indexed production and reported finality are separate observations. No consensus proof is checked.")}
          </p>
        </div>
      </ReadingReveal>
      <section className={styles.summary} aria-label="Observation summary">
        {[
          {
            label: "Median production interval",
            value: report.production.medianMs,
            suffix: "ms",
            detail: `${report.production.intervals} linked consecutive pairs`,
          },
          {
            label: "Reported finality lag",
            value: report.lag,
            suffix: "blocks",
            detail: `Pinned rule result: ${report.lagState}`,
          },
          {
            label: "Latest indexed block",
            value: report.blocks.at(-1)?.number ?? null,
            suffix: "",
            detail: "Not the finalized prefix",
          },
        ].map((item, i) => (
          <ReadingReveal key={item.label} order={i}>
            <article>
              <p className="eyebrow">{item.label}</p>
              <p className={styles.big}>
                <ObservedNumber value={item.value ?? undefined} /> <small>{item.suffix}</small>
              </p>
              <p className="muted">{item.detail}</p>
            </article>
          </ReadingReveal>
        ))}
      </section>

      <section className={styles.panel} aria-labelledby="production-heading">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">01 / Block production</p>
            <h2 id="production-heading">Follow the parent links.</h2>
          </div>
          <span className="badge">R2.1 target: 1000 ms</span>
        </div>
        <p>
          New observed hashes enter from the right. Each bar is the interval from its linked parent, scaled to this
          window&apos;s maximum. Select a block to inspect it.
        </p>
        <div className={styles.strip} aria-label="Recent observed blocks">
          <AnimatePresence initial={false} mode="popLayout">
            {report.blocks.slice(-12).map((b) => {
              const pair = report.pairs.find((p) => p.to === b.number);
              return (
                <motion.div
                  key={b.hash}
                  layout={!reduced}
                  className={styles.block}
                  initial={{ x: reduced ? 0 : 24, opacity: 1 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.3 }}
                  data-block={b.number}
                >
                  <MotionButton
                    className={styles.blockButton}
                    onClick={() => setSelected(selected === b.hash ? null : b.hash)}
                    aria-pressed={selected === b.hash}
                    aria-label={`${pair?.durationMs == null ? "No data" : `${pair.durationMs} ms`} #${b.number}. Inspect block`}
                  >
                    <span className={styles.bar}>
                      <motion.span
                        data-interval-bar
                        initial={false}
                        animate={{ scaleY: pair?.durationMs == null ? 0 : pair.durationMs / maxInterval }}
                        transition={{ duration: reduced ? 0 : 0.4 }}
                      />
                    </span>
                    <strong>
                      {pair?.durationMs ?? "No data"}
                      <small>{pair?.durationMs == null ? "" : " ms"}</small>
                    </strong>
                    <span className={styles.blockNumber}>#{b.number}</span>
                  </MotionButton>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        {!report.blocks.length && <p>No indexed blocks returned. No production interval can be measured.</p>}
        <div className={styles.detail} aria-live="polite">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={block?.hash ?? "none"}
              initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              {block ? (
                <>
                  <strong>Block {block.number}</strong>
                  <p>Timestamp: {block.timestamp === null ? "unavailable" : new Date(block.timestamp).toISOString()}</p>
                  <p>
                    Hash: <code>{block.hash}</code>
                  </p>
                  <p>
                    Parent: <code>{block.parentHash ?? "unavailable"}</code>
                  </p>
                </>
              ) : (
                <p>
                  Select a block for its full hash, parent and timestamp. The strip shows the newest part of the
                  measured window.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="muted">
          Full window: {report.production.aboveTarget} intervals above 1000 ms. {report.production.excluded} excluded
          pairs. Missing heights, broken links and missing or non-increasing timestamps are excluded. Small timestamp
          differences are not a consensus verdict.
        </p>
        <p className="muted">
          Latest indexed timestamp age at capture:{" "}
          {report.indexedTipAgeMs === null ? "unavailable" : `${report.indexedTipAgeMs} ms`}. An old timestamp can
          reflect stale indexer data or stopped production. This sample does not distinguish them.
        </p>
        <Disclosure title="Read every interval and excluded pair">
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>From block</th>
                  <th>To block</th>
                  <th>Interval</th>
                  <th>Exclusion</th>
                </tr>
              </thead>
              <tbody>
                {report.pairs.map((p) => (
                  <tr key={p.to}>
                    <td>{p.from}</td>
                    <td>{p.to}</td>
                    <td>{p.durationMs === null ? "Unavailable" : `${p.durationMs} ms`}</td>
                    <td>{p.reason ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </section>

      <section className={styles.panel} aria-labelledby="lag-heading">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">02 / Reported finality</p>
            <h2 id="lag-heading">Production is not finality.</h2>
          </div>
          <span className="badge" data-lag-state={report.lagState}>
            {report.lagState}
          </span>
        </div>
        <p>
          The API reports best block <strong>{report.finality?.bestBlock ?? "unavailable"}</strong> and finalized block{" "}
          <strong>{report.finality?.finalizedBlock ?? "unavailable"}</strong>. Their difference must match its reported
          lag.
        </p>
        <div
          className={styles.gauge}
          role="img"
          aria-label={
            report.lag === null
              ? "Finality lag unavailable"
              : `Reported lag ${report.lag} blocks. Freeze boundary ${RULES.freezeBlocks} blocks.`
          }
        >
          <motion.div
            className={styles.fill}
            data-lag-fill
            initial={false}
            animate={{ scaleX: lagScale }}
            transition={{ duration: reduced ? 0 : 0.4 }}
          />
          <span className={styles.warnMarker} />
        </div>
        <div className={styles.axis}>
          <span>0</span>
          <span>Warn &gt; 30</span>
          <span>Freeze ≥ 120 blocks</span>
        </div>
        <p>
          {report.lag === null
            ? "No usable finalized heads. This gauge has no measured value."
            : `Reported lag: ${report.lag} blocks. The gauge caps at the freeze boundary. Escape eligibility begins at 3600 blocks.`}
        </p>
        <p className="muted">
          API state: {report.finality?.state ?? "unavailable"}. API safe mode:{" "}
          {report.finality ? String(report.finality.safeMode) : "unavailable"}. API thresholds match the pinned paper:{" "}
          {report.thresholdsMatch === null ? "unavailable" : String(report.thresholdsMatch)}.
        </p>
        {report.finalityError && <p className="warning">Finality data rejected: {report.finalityError}</p>}
        {report.finality && (
          <p className="muted">
            API thresholds: warn {report.finality.thresholds.warnBlocks}, freeze{" "}
            {report.finality.thresholds.freezeBlocks}, maximum stall {report.finality.thresholds.maxStallBlocks} blocks.
          </p>
        )}
        <p>
          No finalized hash, signature or storage proof is exposed by this query. Lag in blocks is not elapsed stall
          time. The paper specifies no finality latency target.
        </p>
      </section>

      <section ref={guide} className={styles.rules} aria-labelledby="rules-heading">
        <div className={styles.rail} aria-hidden="true">
          <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        <p className="eyebrow">03 / Quoted boundaries</p>
        <h2 id="rules-heading">Know what the alert means.</h2>
        {[
          { title: "Warn above 30 blocks", quote: QUOTES.warn, anchor: "param-finality_lag_warn" },
          { title: "Freeze at 120 blocks", quote: QUOTES.freeze, anchor: "param-finality_freeze_threshold" },
          { title: "Escape eligible at 3600 blocks", quote: QUOTES.escape, anchor: "param-max_finality_stall" },
        ].map((rule, i) => (
          <ReadingReveal key={rule.anchor} order={i}>
            <article>
              <h3>{rule.title}</h3>
              <blockquote>{rule.quote}</blockquote>
              <MotionLink href={`${PAPER_URL}#${rule.anchor}`}>Pinned Appendix A rule ↗</MotionLink>
            </article>
          </ReadingReveal>
        ))}
        <p className="muted">
          The rail tracks reading progress. Alerts compare the reported lag with the pinned paper. They do not claim
          that a runtime action was executed.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="validator-heading">
        <p className="eyebrow">04 / Validator visibility</p>
        <h2 id="validator-heading">The set is not exposed here.</h2>
        <div className={styles.validatorGrid}>
          <article>
            <h3>Observable</h3>
            <p>
              Block hashes, parent links, timestamps and reported finality heads are exposed by the captured indexer
              schema.
            </p>
          </article>
          <article>
            <h3>Unavailable</h3>
            <p>
              Active validator membership, session keys, selected committee identities and rotation events. No count is
              inferred from miners or active operators.
            </p>
          </article>
        </div>
        <p>
          Section 15 separates the authoring set from the selected finality committee. Registration enters
          ValidatorQueue. Rotation promotes into ActiveValidators using stake and performance gates with churn and
          minimum-set guards.
        </p>
        <MotionLink href={`${PAPER_URL}#15-validators--onboarding-duties-selection--rotation`}>
          Read section 15 ↗
        </MotionLink>
        <Disclosure title="Inspect the source and measurement limits">
          <p>
            The tool list and schema were captured with their response times in packages/finality/test/fixtures. A
            missing field describes the inspected surfaces, not every source on the network. Public block lookup and the
            GraphQL indexer share a source. Neither verifies committee signatures or on-chain rotation.
          </p>
          <p>Capture query:</p>
          <pre>{current.recording.query}</pre>
          <p>
            Measured HTTP requests: {current.recording.requests}. Collection duration: {current.recording.durationMs}{" "}
            ms.
          </p>
        </Disclosure>
      </section>

      <section className={styles.panel} aria-labelledby="history-heading">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">05 / Recorder history</p>
            <h2 id="history-heading">Keep the dates attached.</h2>
          </div>
          <span className="badge">{history.mode === "recorded-fixture" ? "Recorder fixture" : "Data branch"}</span>
        </div>
        <p>
          These are sampled indexed heights from the recorder. They are not a finalized-head series or a measurement of
          consecutive block times.
        </p>
        <div className={styles.history}>
          {rows.map(({ id, point }) => (
            <article key={id}>
              <time>{point!.measuredAt}</time>
              <p className={styles.historyValue}>
                {typeof point!.value === "number" ? <ObservedNumber value={point!.value} /> : "Unavailable"}
              </p>
              <p className="muted">Indexed height</p>
              <p className={styles.source}>{point!.source}</p>
            </article>
          ))}
        </div>
        {!rows.length && <p>No recorded height observations.</p>}
        <p className="muted">
          Showing the newest available recorder rows, capped at 12.{" "}
          {history.mode === "recorded-fixture"
            ? "The public archive had no usable index. Bundled real recordings retain their original dates."
            : "Loaded from the public data branch."}
        </p>
        <div className={styles.controls}>
          <MotionLink href="/history">Explore recorder history ↗</MotionLink>
          <MotionLink href={history.source}>Archive source ↗</MotionLink>
        </div>
      </section>
      <aside className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          No AlephBFT proof, canonical-chain check, finalized-prefix storage check, validator membership verification or
          runtime safe-mode verification. A normal API lag is not a finality guarantee. No uptime, latency SLA or
          elapsed stall duration is inferred. The devnet can reset.
        </p>
      </aside>
    </div>
  );
}
