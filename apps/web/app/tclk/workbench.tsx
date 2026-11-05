// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { simulate, simulationPaths } from "../../../../packages/tclk-inspect/src/simulate";
import { SPEC_URL, UPSTREAM_COMMIT, type Inspection, type Status } from "../../../../packages/tclk-inspect/src/model";
import type { HtlcRow } from "../../../../packages/tclk-inspect/src/chain";
import styles from "./tclk.module.css";
import { projectTranscript } from "./view";

interface ChainSnapshot {
  rows: HtlcRow[];
  measuredAt: string;
  source: string;
  query: string;
  check: string;
  checkedAt: string;
}
const statuses: Status[] = ["proposed", "accepted", "locked", "claimed", "refunded", "cancelled"];
const date = (ms: number | undefined) =>
  ms !== undefined && Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : "No usable export time";

export function Workbench({ initial, chain }: { initial: Inspection; chain: ChainSnapshot }) {
  const reduced = useReducedMotion() !== false;
  const [path, setPath] = useState("wrong-preimage");
  const [text, setText] = useState(() => JSON.stringify(simulate("wrong-preimage"), null, 2));
  const [report, setReport] = useState(initial);
  const [selected, setSelected] = useState(initial.firstViolation?.index ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  const requestId = useRef(0);
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 40%"] });
  const readingScale = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const { step, passed, visible, selectedState, hash, matches } = projectTranscript(
    report,
    selected,
    onlyBad,
    chain.rows,
  );
  const duration = reduced ? 0 : 0.28;
  async function inspect(value: string, source: string) {
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      // Load cryptography only when the visitor asks to inspect. Initial evidence is server-rendered.
      const { inspectTranscript, parseTranscript } = await import("../../../../packages/tclk-inspect/src/inspect");
      const next = inspectTranscript(parseTranscript(value), source);
      if (id !== requestId.current) return;
      setReport(next);
      setSelected(next.firstViolation?.index ?? next.steps[0]?.index ?? 0);
      setOnlyBad(false);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : "Could not inspect this JSON");
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  const choose = (next: string) => {
    const value = JSON.stringify(simulate(next), null, 2);
    setPath(next);
    setText(value);
    void inspect(value, `synthetic ${next} rehearsal`);
  };
  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero}>
        <ToolHeader slug="tclk" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            A signature says who spoke. Follow each message to see whether the deal can advance.
          </p>
          <p className="muted">
            The examples are synthetic signed rehearsals. Chain observations below are recorded public data.
          </p>
        </ReadingReveal>
      </section>

      <ReadingReveal>
        <section className={styles.controls} aria-label="Transcript controls">
          <div>
            <label htmlFor="tclk-path">Pick a rehearsal</label>
            <motion.select
              id="tclk-path"
              value={path}
              onChange={(e) => choose(e.target.value)}
              whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
              transition={{ duration }}
            >
              {simulationPaths.map((p) => (
                <option key={p} value={p}>
                  {p.replaceAll("-", " ")}
                </option>
              ))}
            </motion.select>
          </div>
          <div className={styles.status} aria-live="polite" aria-busy={busy}>
            <span className="eyebrow">{busy ? "Inspecting locally" : "Supplied transcript"}</span>
            <strong data-verdict className={report.verdict === "violation" ? styles.badText : ""}>
              {report.verdict}
            </strong>
          </div>
          <div className={styles.count}>
            <ObservedNumber value={passed} />
            <span> / {report.steps.length} records accepted</span>
            <div className={styles.bar} aria-hidden="true">
              <motion.div
                initial={false}
                animate={{ scaleX: report.steps.length ? passed / report.steps.length : 0 }}
                transition={{ duration }}
              />
            </div>
          </div>
        </section>
      </ReadingReveal>

      <div className={styles.editor}>
        <Disclosure title="Paste or inspect transcript JSON">
          <label htmlFor="tclk-input">Normalized signed records. Processing stays in this browser.</label>
          <motion.textarea
            id="tclk-input"
            value={text}
            spellCheck={false}
            maxLength={2_000_000}
            onChange={(e) => setText(e.target.value)}
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            transition={{ duration }}
          />
          <div className={styles.actions}>
            <MotionButton
              className="primary-button"
              disabled={busy}
              onClick={() => void inspect(text, "pasted transcript")}
            >
              Inspect pasted JSON
            </MotionButton>
            <CopyButton text={text} label="Copy transcript" />
          </div>
          <p className="muted">
            The export supplies timestamps and order. Signatures do not authenticate either. Numeric nonces and detached
            frame objects are rejected.
          </p>
        </Disclosure>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}. The previous result remains below.
        </p>
      )}

      <section className={styles.result} aria-labelledby="tclk-result-title">
        <div className={styles.resultHeading}>
          <div>
            <p className="eyebrow">Message by message</p>
            <h2 id="tclk-result-title">Follow the deal</h2>
          </div>
          <MotionButton className="quiet-button" aria-pressed={onlyBad} onClick={() => setOnlyBad(!onlyBad)}>
            {onlyBad ? "Show all records" : "Show violations"}
          </MotionButton>
        </div>
        <div className={styles.playback}>
          <div className={styles.sequence} data-sequence>
            <div className={styles.agents}>
              <div>
                <span className={styles.avatar}>A</span>
                <strong>Offerer</strong>
                <small>{report.state?.offer.role ?? "No role"}</small>
              </div>
              <span className={styles.public}>PUBLIC TRANSCRIPT</span>
              <div>
                <span className={styles.avatar}>B</span>
                <strong>Acceptor</strong>
                <small>{!report.state ? "No role" : report.state.offer.role === "payer" ? "payee" : "payer"}</small>
              </div>
            </div>
            <div className={styles.lanes}>
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((s) => (
                  <motion.div
                    layout={!reduced}
                    key={`${s.index}-${s.type}`}
                    initial={{ opacity: 1, y: reduced ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: reduced ? 1 : 0 }}
                    transition={{ duration }}
                  >
                    <MotionButton
                      className={`${styles.message} ${!s.ok ? styles.bad : ""} ${selected === s.index ? styles.active : ""}`}
                      onClick={() => setSelected(s.index)}
                      aria-pressed={selected === s.index}
                      aria-label={`Record ${s.index + 1}: ${s.type}, ${s.ok ? "accepted" : "rejected"}`}
                    >
                      <span className={styles.index}>{String(s.index + 1).padStart(2, "0")}</span>
                      <span className={styles.messageBody}>
                        <strong>{s.type}</strong>
                        <span>
                          {s.from} <span aria-hidden="true">→</span> {s.to}
                        </span>
                      </span>
                      <span className={styles.flow} aria-hidden="true">
                        <motion.span
                          key={`${report.inspectedAt}-${s.index}`}
                          data-message-dot
                          initial={{ x: reduced ? 0 : s.sender === report.state?.offer.from ? -22 : 22 }}
                          animate={{ x: 0 }}
                          transition={{
                            duration: reduced ? 0 : 0.45,
                            delay: reduced ? 0 : Math.min(s.index * 0.035, 0.14),
                          }}
                        >
                          {s.sender === report.state?.offer.from ? "→" : "←"}
                        </motion.span>
                      </span>
                      <span className={styles.verdict}>{s.ok ? "ACCEPTED" : "REJECTED"}</span>
                    </MotionButton>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!visible.length && (
                <p className="muted">
                  {report.steps.length
                    ? "No violations in the supplied records."
                    : "No records supplied. No deal established."}
                </p>
              )}
            </div>
          </div>
          <aside className={styles.machine} aria-label="State machine and selected record">
            <p className="eyebrow">Transcript state machine</p>
            <div className={styles.states}>
              {statuses.map((state) => (
                <div key={state} className={styles.state}>
                  {selectedState === state && (
                    <motion.span
                      layoutId={reduced ? undefined : "tclk-state"}
                      className={styles.stateMarker}
                      transition={{ duration }}
                    />
                  )}
                  <span>{state}</span>
                </div>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              {step && (
                <motion.div
                  key={`${report.inspectedAt}-${step.index}`}
                  className={styles.detail}
                  initial={{ opacity: reduced ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: reduced ? 1 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.12 }}
                >
                  <p className="eyebrow">Selected record {step.index + 1}</p>
                  <h3>{step.ok ? "State guard passed" : "State did not advance"}</h3>
                  <p className={!step.ok ? styles.badText : ""}>
                    {step.reason ?? `${step.type}: ${step.from} to ${step.to}.`}
                  </p>
                  {step.warnings.map((warning) => (
                    <p key={warning} className={styles.warning}>
                      {warning}
                    </p>
                  ))}
                  <MotionLink href={SPEC_URL}>SPEC section {step.section} ↗</MotionLink>
                  <small className={styles.date}>
                    {date(step.timestampMs)}
                    <br />
                    Export time, not signed time
                  </small>
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        </div>
        <div className={`${styles.finding} ${report.firstViolation ? styles.findingBad : ""}`} role="status">
          <strong>
            {report.firstViolation
              ? `First violation: record ${report.firstViolation.index + 1}`
              : report.verdict === "no-data"
                ? "No data"
                : "All supplied records passed"}
          </strong>
          <p>{report.firstViolation?.reason ?? "A conformant transcript is not a payment proof."}</p>
          <span className="muted">
            Final transcript state: {report.state?.status ?? "none"}. Source: {report.source}.
          </span>
        </div>
      </section>

      <section className={`section ${styles.chain}`} aria-labelledby="tclk-chain-title">
        <ReadingReveal>
          <p className="eyebrow">Recorded devnet observation</p>
          <h2 id="tclk-chain-title">Does the hash appear on-chain?</h2>
          <p>
            Check the transcript statement against a dated indexer page. A matching hash alone does not prove this deal
            was paid.
          </p>
        </ReadingReveal>
        <div className={styles.chainGrid}>
          <article className={styles.panel}>
            <strong className={styles.metric}>
              <ObservedNumber value={chain.rows.length} />
            </strong>
            <h3>HTLC rows in this sample</h3>
            <p className="muted">
              {chain.measuredAt}
              <br />
              First page, capped at 100 rows.
            </p>
            <MotionLink href="https://mcp.flop.network/mcp">Hosted MCP source ↗</MotionLink>
          </article>
          <article className={styles.panel}>
            <h3>
              {!hash
                ? "No hash statement to compare"
                : matches.length
                  ? "Hash present in the sample"
                  : "No match in this sample"}
            </h3>
            <p className={styles.hash}>
              {hash ??
                (report.state?.offer.lock === "point"
                  ? "Point locks need a different chain check."
                  : "No accepted hash statement in the supplied records.")}
            </p>
            <p className="muted">This is a recorded page. It does not establish absence from the whole chain.</p>
            <p>
              Checker response for an observed indexer hash: <strong>{chain.check}</strong>
            </p>
            <small>{chain.checkedAt}</small>
          </article>
        </div>
        <Disclosure title="Inspect the recorded query and rows">
          <pre>{chain.query}</pre>
          <pre>{JSON.stringify(chain.rows, null, 2)}</pre>
          <p className="muted">
            Source: {chain.source}. The checker does not distinguish absence from unavailable RPC.
          </p>
        </Disclosure>
        <div className={styles.command}>
          <code>node packages/cli/dist/cli.js tclk inspect transcript.json --json</code>
          <CopyButton text="node packages/cli/dist/cli.js tclk inspect transcript.json --json" />
        </div>
        <p className="muted">The CLI makes fresh read-only requests. This page uses the dated recording above.</p>
      </section>

      <section ref={guide} className={`section ${styles.guide}`} aria-labelledby="tclk-limits-title">
        <div className={styles.readingTrack} aria-hidden="true">
          <motion.div style={{ scaleY: reduced ? 1 : readingScale }} />
        </div>
        <p className="eyebrow">Reading progress, not verification progress</p>
        <h2 id="tclk-limits-title">Know where the evidence stops</h2>
        {[
          {
            title: "Signed words",
            text: "The signature binds the room, nonce and exact message. The export still supplies time, order and completeness.",
          },
          {
            title: "Protocol decisions",
            text: "A late reveal can pass before the refund boundary. Replayed frames and noncanonical JSON fail here even when the pinned reference accepts them.",
          },
          {
            title: "Money and work",
            text: "No work quality, payment, arbitration verdict or adaptor presignature is verified. The indexer sample is an observation, not a settlement proof.",
          },
        ].map((item, index) => (
          <ReadingReveal key={item.title} order={index}>
            <article>
              <h3>{item.title}</h3>
              <p className="muted">{item.text}</p>
            </article>
          </ReadingReveal>
        ))}
        <MotionLink href={SPEC_URL}>Pinned protocol {UPSTREAM_COMMIT.slice(0, 12)} ↗</MotionLink>
      </section>
    </div>
  );
}
