// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import type { AuditReport, Evidence, Finding, Observation, Status } from "../../../../packages/indexer-audit/src/types";
import { stakeArithmetic, visibleFindings, type Filter } from "./view";
import styles from "./indexer.module.css";

const statuses: Status[] = ["PASS", "FAIL", "UNVERIFIABLE"];
const labels: Record<Filter, string> = { ALL: "All checks", PASS: "Pass", FAIL: "Fail", UNVERIFIABLE: "Unverifiable" };
const explain: Record<Status, string> = {
  PASS: "The sampled values agree.",
  FAIL: "A declared rule does not hold.",
  UNVERIFIABLE: "The inputs cannot establish a result.",
};

function SourceValue({ evidence, observations }: { evidence: Evidence; observations: Observation[] }) {
  return (
    <div className={styles.sourceValue}>
      <p className="eyebrow">{evidence.label}</p>
      <pre>{evidence.value}</pre>
      {evidence.observationIds.map((id) => {
        const observation = observations.find((o) => o.id === id);
        return (
          <div className={styles.provenance} key={id}>
            <strong>{id}</strong>
            {observation ? (
              <>
                <MotionLink href={observation.source}>{observation.source}</MotionLink>
                <time dateTime={observation.measuredAt}>{observation.measuredAt}</time>
                {typeof observation.request.tool === "string" && <code>{observation.request.tool}</code>}
              </>
            ) : (
              <span>No observation available</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckRow({ finding, report }: { finding: Finding; report: AuditReport }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() !== false;
  const duration = reduced ? 0 : 0.22;
  const arithmetic = finding.id.startsWith("stake-") ? stakeArithmetic(report.snapshot, finding.id.slice(6)) : null;
  const sourceIds = [...new Set([...finding.left.observationIds, ...finding.right.observationIds])];
  const detailId = `indexer-${finding.id}`;
  const [title, channel] = finding.title.split(": 0x");
  return (
    <motion.article
      className={styles.row}
      data-status={finding.status}
      data-check={finding.id}
      layout={reduced ? false : "position"}
      initial={{ opacity: 1, y: reduced ? 0 : 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration }}
    >
      <MotionButton
        className={styles.rowToggle}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.pill} data-status={finding.status}>
          {finding.status}
        </span>
        <span className={styles.rowTitle}>
          {title}
          {channel && (
            <span className={styles.channel} title={`0x${channel}`}>
              0x{channel.slice(0, 10)}...{channel.slice(-6)}
            </span>
          )}
        </span>
        <motion.span
          className={styles.chevron}
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration }}
        >
          ›
        </motion.span>
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="evidence"
            id={detailId}
            className={styles.detail}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
          >
            <p className={styles.reason}>{finding.reason}</p>
            <div className={styles.comparison}>
              <SourceValue evidence={finding.left} observations={report.snapshot.observations} />
              <SourceValue evidence={finding.right} observations={report.snapshot.observations} />
            </div>
            <div className={styles.equation}>
              <p className="eyebrow">The rule</p>
              <code>{finding.formula}</code>
              {arithmetic && <pre>{arithmetic}</pre>}
              <MotionLink href={finding.reference}>Rule source ↗</MotionLink>
            </div>
            <Disclosure title="Inspect raw source responses">
              {sourceIds.map((id) => {
                const observation = report.snapshot.observations.find((o) => o.id === id);
                return (
                  <div key={id} className={styles.raw}>
                    <h3>{id}</h3>
                    <pre>{observation ? JSON.stringify(observation.request, null, 2) : "No request"}</pre>
                    <pre>{observation?.raw ?? observation?.error ?? "No response"}</pre>
                  </div>
                );
              })}
            </Disclosure>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function InvariantBoard({ report }: { report: AuditReport }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const reduced = useReducedMotion() !== false;
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 35%"] });
  const readingProgress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const visible = visibleFindings(report.findings, filter);
  const duration = reduced ? 0 : 0.36;
  const snapshot = report.snapshot;
  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero}>
        <ToolHeader slug="indexer" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>Check the totals. Follow the disagreement.</p>
          <p className="muted">
            Expand any rule to see its values, source responses and arithmetic. Agreement here is indexer consistency,
            not independent chain proof.
          </p>
        </ReadingReveal>
      </section>

      <ReadingReveal order={4}>
        <section className={styles.snapshot} aria-label="Recorded audit summary">
          <div className={styles.snapshotHeading}>
            <div>
              <span className={styles.recorded}>Recorded public data</span>
              <time dateTime={snapshot.completedAt}>{snapshot.completedAt}</time>
            </div>
            <MotionLink className="quiet-button" href="/indexer/recording" download="flop-indexer-snapshot.json">
              Download evidence ↓
            </MotionLink>
          </div>
          <div className={styles.metrics}>
            {statuses.map((status, i) => (
              <div className={styles.metric} data-status={status} key={status}>
                <span className="eyebrow">{labels[status]}</span>
                <strong>
                  <ObservedNumber value={report.counts[status]} />
                </strong>
                <p>{explain[status]}</p>
                <div className={styles.track} aria-hidden="true">
                  <motion.div
                    data-metric-bar={status}
                    initial={false}
                    whileInView={{
                      scaleX: report.findings.length ? report.counts[status] / report.findings.length : 0,
                    }}
                    viewport={{ once: true }}
                    style={{ scaleX: reduced ? report.counts[status] / report.findings.length : 0 }}
                    transition={{ duration, delay: reduced ? 0 : i * 0.06 }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className={styles.measurements}>
            {snapshot.requests} HTTP requests · {snapshot.durationMs.toLocaleString("en-US")} ms observed · row limit{" "}
            {snapshot.limit} · no live calls from this page
          </p>
        </section>
      </ReadingReveal>

      <section className={styles.board} aria-labelledby="indexer-board-title">
        <div className={styles.boardHeading}>
          <div>
            <p className="eyebrow">Invariant board</p>
            <h2 id="indexer-board-title">Start with what disagrees.</h2>
          </div>
          <p className="muted">Failures first. Unknowns stay visible.</p>
        </div>
        <div className={styles.filters} aria-label="Filter invariant results">
          {(["ALL", "FAIL", "UNVERIFIABLE", "PASS"] as const).map((status) => (
            <MotionButton
              key={status}
              className={styles.filter}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {filter === status && (
                <motion.span
                  className={styles.filterMarker}
                  layoutId={reduced ? undefined : "indexer-filter"}
                  transition={{ duration: reduced ? 0 : 0.22 }}
                />
              )}
              <span>{labels[status]}</span>
              <span className="mono">{status === "ALL" ? report.findings.length : report.counts[status]}</span>
            </MotionButton>
          ))}
        </div>
        <p className={styles.showing} aria-live="polite">
          Showing {visible.length} of {report.findings.length} checks from this recording.
        </p>
        <motion.div
          className={styles.rows}
          layout={reduced ? false : "position"}
          transition={{ duration: reduced ? 0 : 0.22 }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((finding) => (
              <CheckRow key={finding.id} finding={finding} report={report} />
            ))}
          </AnimatePresence>
          {visible.length === 0 && <p className={styles.empty}>No checks with this result in the recording.</p>}
        </motion.div>
      </section>

      <section className={styles.guide} ref={guide} aria-labelledby="indexer-guide-title">
        <div>
          <p className="eyebrow">How to read this audit</p>
          <h2 id="indexer-guide-title">A result is only as strong as its inputs.</h2>
          <p className="muted">The line tracks your place in this explanation.</p>
        </div>
        <div className={styles.guideSteps}>
          <div className={styles.guideTrack} aria-hidden="true">
            <motion.div style={{ scaleY: reduced ? 1 : readingProgress }} data-reading-progress />
          </div>
          {[
            [
              "01",
              "Match the observation",
              "Every result links to a received time and source. Different heights or settlement revisions are not treated as equal snapshots.",
            ],
            [
              "02",
              "Read the exact rule",
              "The stake check defines total as all bonded parts. A label mismatch can fail that rule without proving a runtime fault. Raw planck amounts keep every digit.",
            ],
            [
              "03",
              "Keep the unknowns",
              "Public miner data omits calibration acceptance and expiry blocks. A partial page cannot establish total supply or all inference payments. UNVERIFIABLE never means zero.",
            ],
          ].map(([number, title, body], i) => (
            <ReadingReveal key={number} order={i}>
              <article>
                <span className="eyebrow">{number}</span>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </section>

      <section className={styles.run} aria-labelledby="indexer-run-title">
        <div>
          <p className="eyebrow">Run your own observation</p>
          <h2 id="indexer-run-title">A bounded audit. An inspectable result.</h2>
          <p className="muted">
            Build the suite from the repository, then run the command. The page is a dated recording. Your CLI run
            collects a new sample.
          </p>
        </div>
        <div className={styles.command}>
          <code>flop indexer run --limit 20 --json</code>
          <CopyButton text="flop indexer run --limit 20 --json" label="Copy audit command" />
        </div>
        <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/indexer-audit">
          Installation, formulas and offline replay ↗
        </MotionLink>
      </section>
      <section className={styles.limits} aria-label="Verification limits">
        <h2>What this does not verify</h2>
        <p className="muted">
          MCP and explorer can share a backend. This board does not verify node storage, cryptographic proofs or
          inference. It does not claim that existing reports{" "}
          <MotionLink href="https://github.com/flop-labs/network/issues/75">#75</MotionLink> or{" "}
          <MotionLink href="https://github.com/flop-labs/network/issues/76">#76</MotionLink> are fixed. Sequential
          observations can span a head change and devnet can reset.
        </p>
      </section>
    </div>
  );
}
