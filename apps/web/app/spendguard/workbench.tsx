// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { MotionButton as Control } from "@/components/motion";
import { lintPolicyText } from "../../../../packages/spendguard/src/lint";
import { replayTape, type ReplayTape } from "../../../../packages/spendguard/src/replay";
import { parsePolicyText } from "./library";
import { tapePolicy } from "./recorded";
import styles from "./spendguard.module.css";

function Count({ value }: { value: number }) {
  const reduced = useReducedMotion() !== false;
  const current = useMotionValue(value);
  const rounded = useTransform(current, Math.round);
  useEffect(() => {
    const control = animate(current, value, { duration: reduced ? 0 : 0.4 });
    return () => control.stop();
  }, [current, reduced, value]);
  return (
    <>
      <span className="sr-only">{value}</span>
      <motion.span aria-hidden="true">{rounded}</motion.span>
    </>
  );
}

/** Inspect policy findings and dated counterfactual decisions. @example <Workbench tapes={[tape]} /> */
export function Workbench({ tapes }: { tapes: ReplayTape[] }) {
  const reduced = useReducedMotion() !== false;
  const [which, setWhich] = useState(0);
  const tape = tapes[which];
  const [input, setInput] = useState(() => (tapes[0] ? JSON.stringify(tapePolicy(tapes[0]), null, 2) : ""));
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start end", "end center"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const lint = useMemo(() => lintPolicyText(input), [input]);
  const result = useMemo(() => {
    if (!tape) return { value: null, error: "No validated recording available." };
    try {
      return { value: replayTape(parsePolicyText(input), tape, count), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Invalid policy" };
    }
  }, [tape, input, count]);
  const duration = reduced ? 0 : 0.3;
  const steps = result.value?.steps ?? [];
  const visible = steps.filter((step) => filter === "all" || step.status === filter);
  const active = steps.find((step) => step.row.id === selected);
  const run = (next: number) => {
    setCount(next);
    setEvaluatedAt(new Date().toISOString());
  };
  const reveal = (delay: number) => ({
    initial: false as const,
    whileInView: reduced ? { opacity: 1 } : { opacity: [0.55, 1], y: [10, 0] },
    viewport: { once: true, amount: 0.05 },
    transition: { duration, delay: reduced ? 0 : delay },
  });
  return (
    <section ref={section} className={styles.pipeline} aria-labelledby="recorded-heading" id="recorded-replay">
      <div className={styles.readingRail} aria-hidden="true">
        <motion.div style={{ scaleY: reduced ? 1 : progress }} />
      </div>
      <motion.div className={styles.sectionTitle} {...reveal(0)}>
        <div>
          <p className="eyebrow">Shared budget / policy audit</p>
          <h2 id="recorded-heading">Would this tape fit your policy?</h2>
        </div>
        <p className="muted">
          Lint the boundary. Replay recorded exposure.
          <br />
          Every total uses exact decimal arithmetic.
        </p>
      </motion.div>
      {!tape ? (
        <p>No validated recording available.</p>
      ) : (
        <>
          <div className={styles.actions} aria-label="Replay source">
            {tapes.map((item, index) => (
              <Control
                className="quiet-button"
                key={item.kind}
                aria-pressed={which === index}
                onClick={() => {
                  setWhich(index);
                  setCount(0);
                  setSelected(null);
                  setEvaluatedAt(null);
                }}
              >
                {item.kind === "settlements" ? "Recorded settlements" : "SDK cost estimate"}
              </Control>
            ))}
            <Control
              className="quiet-button"
              onClick={() => {
                setInput(JSON.stringify(tapePolicy(tape), null, 2));
                run(0);
              }}
            >
              Load chosen limits for this tape
            </Control>
          </div>
          <div className={styles.tapeSource}>
            <p>
              <strong>
                {tape.rows.length} recorded {tape.kind === "settlements" ? "settlements" : "estimated channels"}
              </strong>{" "}
              / {tape.partial ? "Partial page. Earlier history is excluded." : "Complete supplied recording."}
            </p>
            <p>
              Captured <time dateTime={tape.measuredAt}>{tape.measuredAt}</time> from{" "}
              <a href={tape.source}>{tape.source}</a>.
            </p>
            <ul>
              {tape.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
          <div className={styles.workspace}>
            <motion.div className={styles.editor} {...reveal(0.05)}>
              <h3>Replay policy</h3>
              <label className={styles.editorLabel} htmlFor="replay-policy">
                Chosen limits, not a recommended budget. Edits rerun the processed prefix.
              </label>
              <motion.textarea
                id="replay-policy"
                className={styles.code}
                value={input}
                spellCheck={false}
                maxLength={65536}
                aria-invalid={!lint.valid}
                aria-describedby="lint-summary"
                whileFocus={{ borderColor: "var(--accent)" }}
                transition={{ duration }}
                onChange={(event) => {
                  setInput(event.target.value);
                  setEvaluatedAt(new Date().toISOString());
                }}
              />
              <div className={styles.actions}>
                <Control
                  className="quiet-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(input);
                      setCopyStatus("Replay policy copied.");
                    } catch {
                      setCopyStatus("Select the policy text to copy it.");
                    }
                  }}
                >
                  Copy replay policy
                </Control>
                <span role="status" className={styles.help}>
                  {copyStatus}
                </span>
              </div>
            </motion.div>
            <motion.section className={styles.trace} aria-labelledby="lint-heading" {...reveal(0.1)}>
              <div className={styles.panelHead}>
                <h3 id="lint-heading">Policy linter</h3>
                <span id="lint-summary" role="status">
                  {lint.findings.length} findings
                </span>
              </div>
              <p className={styles.help}>
                Reference: SDK {lint.reference.symbol}. Per transaction {lint.reference.perTxFlop} FLOP. Daily{" "}
                {lint.reference.dailyFlop} FLOP. Captured {lint.reference.measuredAt}.{" "}
                <a href={lint.reference.source}>Source package</a>.
              </p>
              <p className={styles.help}>{lint.reference.status} Findings do not rewrite or relax your policy.</p>
              <div className={styles.lintList}>
                <AnimatePresence initial={false}>
                  {lint.findings.map((finding, index) => (
                    <motion.article
                      layout={!reduced}
                      key={`${finding.code}-${finding.path}-${index}`}
                      className={styles.finding}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration }}
                    >
                      <span className={finding.severity === "error" ? styles.deny : styles.allow}>{finding.code}</span>
                      <h4>{finding.path}</h4>
                      <p>{finding.message}</p>
                      <p>
                        <strong>Fix:</strong> {finding.fix}
                      </p>
                    </motion.article>
                  ))}
                </AnimatePresence>
                {!lint.findings.length && (
                  <p className={styles.cleanPolicy}>No static findings. This does not prove runtime enforcement.</p>
                )}
              </div>
            </motion.section>
          </div>
          <div className={styles.actions}>
            <Control
            className="button"
              disabled={!result.value || count === tape.rows.length}
              onClick={() => run(count + 1)}
            >
              Next recorded row
            </Control>
            <Control
              className="quiet-button"
              disabled={!result.value || count === tape.rows.length}
              onClick={() => run(tape.rows.length)}
            >
              Replay full recording
            </Control>
            <Control
              className="quiet-button"
              onClick={() => {
                run(0);
                setSelected(null);
              }}
            >
              Reset recorded replay
            </Control>
          </div>
          <p className={styles.validation} role="status">
            {result.error ??
              `Processed ${count} of ${tape.rows.length} rows. ${evaluatedAt ? `Evaluated in this browser at ${evaluatedAt}.` : "Not run yet."}`}
          </p>
          <div className={styles.totals} aria-label="Recorded running totals">
            {(
              [
                ["Allowed", result.value?.totals.allowed, result.value?.totals.allowedFlop],
                ["Refused", result.value?.totals.refused, result.value?.totals.refusedFlop],
                ["Skipped", result.value?.totals.skipped, result.value?.totals.skippedFlop],
              ] as const
            ).map(([label, value, amount]) => (
              <motion.div key={label} className={styles.meter} {...reveal(0)}>
                <h3>
                  {label} <Count value={value ?? 0} />
                </h3>
                <motion.p
                  className={styles.exactTotal}
                  key={amount ?? "invalid"}
                  initial={reduced ? false : { opacity: 0.5, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration }}
                >
                  {amount === undefined ? "Invalid policy" : `${amount} FLOP`}
                </motion.p>
                <div className={styles.track} aria-hidden="true">
                  <motion.div
                    className={styles.fill}
                    data-total={label}
                    initial={false}
                    animate={{ scaleX: tape.rows.length ? (value ?? 0) / tape.rows.length : 0 }}
                    transition={{ duration: reduced ? 0 : 0.4 }}
                  />
                </div>
                <p className={styles.help}>Bar: share of recorded rows. Amount: full escrow.</p>
              </motion.div>
            ))}
          </div>
          <div className={styles.actions} aria-label="Decision filter">
            {["all", "allow", "deny", "skipped"].map((kind) => (
              <Control
                className="quiet-button"
                key={kind}
                aria-pressed={filter === kind}
                onClick={() => setFilter(kind)}
              >
                {kind === "all" ? "All recorded decisions" : kind}
              </Control>
            ))}
          </div>
          <div className={styles.tapeRows} aria-label="Recorded decisions">
            <AnimatePresence initial={false}>
              {visible.map((step) => (
                <motion.div
                  key={step.row.id}
                  layout={!reduced}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration }}
                >
                  <Control
                    className={styles.tapeRow}
                    aria-expanded={selected === step.row.id}
                    onClick={() => setSelected(selected === step.row.id ? null : step.row.id)}
                  >
                    <span className={step.status === "allow" ? styles.allow : styles.deny}>{step.status}</span>
                    <code>{step.row.id}</code>
                    <span>{step.row.amount} FLOP</span>
                  </Control>
                </motion.div>
              ))}
            </AnimatePresence>
            {!visible.length && (
              <p className={styles.help}>
                {count ? "No rows match this filter." : "Run a row to inspect its decision."}
              </p>
            )}
          </div>
          <AnimatePresence initial={false}>
            {active && (
              <motion.section
                layout={!reduced}
                className={styles.trace}
                aria-label="Recorded row details"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration }}
              >
                <h3>
                  {active.status}: {active.row.amount} FLOP
                </h3>
                <p className={styles.requestIdentity}>
                  Agent: {active.row.agent}
                  <br />
                  Miner: {active.row.miner}
                  <br />
                  Model: {active.row.model ?? "Missing"}
                  <br />
                  Time proxy: {new Date(active.row.at).toISOString()}
                  <br />
                  Rounded price: {active.row.pricePerGflop} FLOP/GFLOP
                </p>
                <p>Running allowed exposure after this row: {active.totals.allowedFlop} FLOP.</p>
                <ul className={styles.rules}>
                  {active.decision
                    ? active.decision.rules.map((rule) => (
                        <li key={rule.rule} data-passed={rule.passed}>
                          <span>{rule.passed ? "Pass" : "Fail"}</span>
                          <div>
                            <code>{rule.rule}</code>
                            <p>{rule.detail}</p>
                          </div>
                        </li>
                      ))
                    : active.reason.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </motion.section>
            )}
          </AnimatePresence>
          <p className={styles.provenance}>
            The Node SharedBudget API pins one policy and locks each admission across local processes. This browser
            replay does not run that lock. No transaction is sent. Replay results do not reconstruct original
            admissions, refunds or finality.
          </p>
        </>
      )}
    </section>
  );
}
