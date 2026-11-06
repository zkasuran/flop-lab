// SPDX-License-Identifier: Apache-2.0
"use client";
import { ToolHeader } from "@/components/tool-header";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MotionButton as Control, MotionLink } from "@/components/motion";
import { initialPolicy, parsePolicyText, replay, scenario, fillRatio, type CatalogSeed } from "./library";
import styles from "./spendguard.module.css";

const command =
  "node packages/spendguard/dist/cli.js evaluate packages/spendguard/examples/policy.yaml packages/spendguard/examples/request.json --dry-run";

/** Interactive replay of the production evaluator. Example: <Playground seed={recordedIdentity} />. */
export function Playground({ seed }: { seed: CatalogSeed | null }) {
  const reduced = useReducedMotion() !== false;
  const pipeline = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: pipeline, offset: ["start end", "end center"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const defaults = seed ? initialPolicy(seed) : "";
  const [input, setInput] = useState(defaults);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(0);
  const [deniedOnly, setDeniedOnly] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState("");
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const steps = useMemo(() => (seed ? scenario(seed) : []), [seed]);
  const state = useMemo(() => {
    if (!seed)
      return {
        error: "No usable catalogue observation. The playground needs a recorded model and miner.",
        value: null,
      };
    try {
      return { error: null, value: replay(parsePolicyText(input), steps, count) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid policy", value: null };
    }
  }, [input, count, seed, steps]);
  const result = state.value;
  const decisions = result?.decisions ?? [];
  const last = decisions.at(-1);
  const visible = decisions.filter((step) => !deniedOnly || step.result.decision === "deny");
  const active = visible.find((step) => step.request.id === decisions[selected]?.request.id) ?? visible[0];
  const duration = reduced ? 0 : 0.28;
  const reveal = (index: number) => ({
    initial: { opacity: 1, y: 0 },
    whileInView: reduced ? { opacity: 1, y: 0 } : { opacity: [0.4, 1], y: [12, 0] },
    viewport: { once: true, amount: 0.1 },
    // Keyframes keep server-rendered content visible before hydration.
    transition: { duration, delay: reduced ? 0 : index * 0.06 },
  });
  function run(next: number) {
    setCount(next);
    setSelected(Math.max(0, next - 1));
    setEvaluatedAt(new Date().toISOString());
  }
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} copied`);
    } catch {
      setCopied("Clipboard unavailable. Select the text to copy.");
    }
  }
  return (
    <motion.div className={styles.page} initial={false} animate={{ opacity: 1 }}>
      <motion.header className={styles.hero} {...reveal(0)}>
        <MotionLink className={styles.back} href="/#tools">
          ↑ All tools
        </MotionLink>
        <ToolHeader slug="spendguard" />
        <p className={styles.intro}>Edit a policy. Send a scripted request. See exactly why it passes or stops.</p>
        <div className={styles.labels}>
          <span>Real policy engine</span>
          <span>In-memory simulation</span>
          <span>No signing</span>
        </div>
      </motion.header>

      <motion.section className={styles.observation} layout={!reduced} aria-label="Data provenance" {...reveal(1)}>
        <div>
          <span className="eyebrow">Recorded identities / chosen limits</span>
          <p>
            {seed ? (
              <>
                Model and miner from the <a href={seed.source}>gateway catalogue</a>. Amounts, prices and requests below
                are scripted inputs.
              </>
            ) : (
              "No recorded identities available."
            )}
          </p>
          {seed && (
            <p className="muted">
              Last known: <time dateTime={seed.measuredAt}>{seed.measuredAt}</time>. No current quote is implied.
            </p>
          )}
        </div>
        <Control
          className="quiet-button"
          aria-expanded={showSource}
          aria-controls="catalogue-source"
          onClick={() => setShowSource(!showSource)}
        >
          Source details {showSource ? "−" : "+"}
        </Control>
        <AnimatePresence initial={false}>
          {showSource && (
            <motion.div
              id="catalogue-source"
              className={styles.source}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration }}
            >
              {seed ? (
                <dl>
                  <dt>Model</dt>
                  <dd>{seed.model}</dd>
                  <dt>Miner</dt>
                  <dd>{seed.miner}</dd>
                  <dt>Price-source label</dt>
                  <dd>{seed.priceSource}</dd>
                  <dt>Recorded source expiry</dt>
                  <dd>{seed.expiresAt}</dd>
                  <dt>Fixture</dt>
                  <dd>apps/web/tests/fixtures/models.json</dd>
                </dl>
              ) : (
                <p>No data. No identity was invented.</p>
              )}
              <p>
                The catalogue supplies identities only. Gateway token prices are not GFLOP prices. This page does not
                refresh the recording or check quote signatures.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <section className={styles.pipeline} ref={pipeline} aria-labelledby="replay-heading">
        <div className={styles.readingRail} aria-hidden="true">
          <motion.div style={{ scaleY: reduced ? 1 : progress }} />
        </div>
        <motion.div className={styles.sectionTitle} {...reveal(2)}>
          <div>
            <p className="eyebrow">01 / Set the boundary</p>
            <h2 id="replay-heading">A budget you can inspect.</h2>
          </div>
          <p className="muted">
            Allowed requests reserve their full escrow. <br />
            Denied requests leave the ledger untouched.
          </p>
        </motion.div>
        <div className={styles.workspace}>
          <motion.section className={styles.editor} {...reveal(3)} aria-labelledby="policy-heading">
            <div className={styles.panelHead}>
              <h3 id="policy-heading">Policy</h3>
              <span className="mono">YAML / JSON</span>
            </div>
            <label className={styles.editorLabel} htmlFor="policy-input">
              Edit limits to replay the processed requests.
            </label>
            <motion.textarea
              id="policy-input"
              aria-describedby="policy-help policy-validation"
              aria-invalid={!!state.error}
              className={styles.code}
              value={input}
              spellCheck={false}
              maxLength={65536}
              whileFocus={{ borderColor: "var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.14 }}
              onChange={(event) => {
                setInput(event.target.value);
                setEvaluatedAt(new Date().toISOString());
              }}
            />
            <div id="policy-validation" className={styles.validation} role="status">
              {state.error ? (
                <span className="error">Policy rejected: {state.error}</span>
              ) : (
                <span className="success">Valid policy. Exact decimal arithmetic.</span>
              )}
            </div>
            <p id="policy-help" className={styles.help}>
              Quote FLOP values. Use two-space mappings and JSON inline lists. Unknown keys, anchors and inline comments
              are rejected.
            </p>
            <div className={styles.actions}>
              <Control
                className="quiet-button"
                onClick={() => {
                  setInput(defaults);
                  run(0);
                  setDeniedOnly(false);
                }}
              >
                Restore policy
              </Control>
              <Control className="quiet-button" onClick={() => void copy(input, "YAML")}>
                Copy YAML
              </Control>
            </div>
          </motion.section>

          <div className={styles.execution}>
            <motion.section className={styles.budgetPanel} aria-labelledby="budget-heading" {...reveal(4)}>
              <div className={styles.panelHead}>
                <div>
                  <p className="eyebrow">02 / Reserve only on allow</p>
                  <h3 id="budget-heading">Budget pressure</h3>
                </div>
                <span className="mono">FLOP</span>
              </div>
              <div className={styles.meters}>
                {(["task", "hour", "day", "total"] as const).map((key) => {
                  const budget = result?.budgets[key];
                  const fired = last?.result.fired.includes(`budget.${key}`) ?? false;
                  const ratio = budget ? fillRatio(budget.used, budget.limit) : 0;
                  return (
                    <motion.div
                      key={key}
                      className={styles.meter}
                      data-fired={fired}
                      animate={{ borderColor: fired ? "var(--danger)" : "var(--border)" }}
                      transition={{ duration }}
                    >
                      <div className={styles.meterHead}>
                        <span>
                          {key}
                          {key === "task" && result ? ` / ${result.task}` : ""}
                        </span>
                        <motion.strong
                          key={budget?.used ?? "invalid"}
                          initial={reduced ? false : { opacity: 0.5, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration }}
                        >
                          {budget ? `${budget.used} / ${budget.limit}` : "Invalid policy"}
                        </motion.strong>
                      </div>
                      <div
                        className={styles.track}
                        role="meter"
                        aria-label={`${key} budget used`}
                        aria-valuenow={Math.round(ratio * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={budget ? `${budget.used} of ${budget.limit} FLOP used` : "Policy invalid"}
                      >
                        <motion.div
                          className={styles.fill}
                          initial={false}
                          animate={{ scaleX: ratio, backgroundColor: fired ? "var(--danger)" : "var(--accent)" }}
                          transition={{ duration: reduced ? 0 : 0.4, ease: "easeOut" }}
                        />
                      </div>
                      <span className={styles.meterNote}>
                        {budget ? `${budget.remaining} remaining` : "Fix the policy to evaluate"}
                        {fired ? " / request blocked" : ""}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
              <p className={styles.help}>
                Task follows the latest request. Hour and day are rolling windows. Pending reservations never age out.
                No refunds are simulated.
              </p>
            </motion.section>

            <section className={styles.runner} aria-label="Replay controls">
              <div className={styles.runHead}>
                <span className="eyebrow">Scripted sequence</span>
                <span className="mono">
                  {count} / {steps.length} evaluated
                </span>
              </div>
              <p className={styles.next}>
                {steps[count] ? (
                  <>
                    Next: <strong>{steps[count].title}</strong>{" "}
                    <span className="mono">{steps[count].request.amount} FLOP</span>
                  </>
                ) : (
                  "Sequence complete. Edit the policy to compare decisions."
                )}
              </p>
              <div className={styles.actions}>
                <Control
                  className="button"
                  disabled={!!state.error || count >= steps.length}
                  onClick={() => run(count + 1)}
                >
                  Evaluate next <span aria-hidden="true">→</span>
                </Control>
                <Control
                  className="quiet-button"
                  disabled={!!state.error || count >= steps.length}
                  onClick={() => run(steps.length)}
                >
                  Run sequence
                </Control>
                <Control className="quiet-button" disabled={count === 0} onClick={() => run(0)}>
                  Reset replay
                </Control>
              </div>
              <p className={styles.runStatus} role="status">
                {state.error
                  ? "Evaluation paused. Invalid policy."
                  : last
                    ? `${last.result.decision.toUpperCase()}: ${last.title}. ${last.reservedAfter} FLOP reserved in total.`
                    : "Ready. The simulated ledger is empty."}
              </p>
            </section>
          </div>
        </div>

        <section className={styles.decisions} aria-labelledby="decisions-heading">
          <div className={styles.sectionTitle}>
            <div>
              <p className="eyebrow">03 / Follow every rule</p>
              <h2 id="decisions-heading">The decision is not a black box.</h2>
            </div>
            <Control className="quiet-button" aria-pressed={deniedOnly} onClick={() => setDeniedOnly(!deniedOnly)}>
              {deniedOnly ? "Show all decisions" : "Show denials only"}
            </Control>
          </div>
          <div className={styles.traceGrid}>
            <div className={styles.requestList}>
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((step) => (
                  <motion.div
                    layout={reduced ? false : "position"}
                    key={step.request.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration }}
                  >
                    <Control
                      className={styles.request}
                      aria-pressed={active?.request.id === step.request.id}
                      onClick={() => setSelected(decisions.indexOf(step))}
                    >
                      <span className={step.result.decision === "allow" ? styles.allow : styles.deny}>
                        {step.result.decision}
                      </span>
                      <span>
                        <strong>{step.title}</strong>
                        <small>
                          +{steps.findIndex((item) => item.request.id === step.request.id) * 2}s / {step.request.amount}{" "}
                          FLOP / task {step.request.task}
                        </small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </Control>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!visible.length && (
                <div className={styles.empty}>
                  {state.error
                    ? "Fix the policy to see decisions."
                    : count === 0
                      ? "Evaluate a request to start the trace."
                      : "No denials in the processed requests."}
                </div>
              )}
            </div>
            <section className={styles.trace} aria-label="Selected request rule trace">
              <AnimatePresence initial={false} mode="wait">
                {active ? (
                  <motion.div
                    key={active.request.id}
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0.6 }}
                    transition={{ duration: reduced ? 0 : 0.12 }}
                  >
                    <div className={styles.panelHead}>
                      <h3>{active.title}</h3>
                      <span className={active.result.decision === "allow" ? styles.allow : styles.deny}>
                        {active.result.decision}
                      </span>
                    </div>
                    <p className={styles.help}>
                      Requested: {active.request.amount} FLOP at {active.request.pricePerGflop} FLOP/GFLOP. Matching
                      preflight: {active.request.dryRun ? "simulated" : "absent"}.
                    </p>
                    <p className={styles.requestIdentity}>
                      Miner: <code>{active.request.miner}</code>
                      <br />
                      Model: <code>{active.request.model}</code>
                    </p>
                    <ul className={styles.rules}>
                      {active.result.rules.map((rule) => (
                        <li key={rule.rule} data-passed={rule.passed}>
                          <span aria-label={rule.passed ? "Pass" : "Fail"}>{rule.passed ? "✓" : "×"}</span>
                          <div>
                            <code>{rule.rule}</code>
                            <p>{rule.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className={styles.help}>
                      Trace arithmetic is before admission. Budget bars show the ledger after all processed requests.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="empty" className={styles.empty}>
                    <span className={styles.emptyMark} aria-hidden="true">
                      {}
                    </span>
                    <h3>Every check. Every reason.</h3>
                    <p>
                      Choose a decision to inspect the exact rule trace from <code>evaluate()</code>.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>
          <p className={styles.provenance}>
            Evaluation source: this browser / package Spendguard evaluator.{" "}
            {evaluatedAt ? (
              <>
                Evaluated at <time dateTime={evaluatedAt}>{evaluatedAt}</time>.
              </>
            ) : (
              "Not run yet."
            )}{" "}
            Scenario times are simulated offsets from the catalogue recording.
          </p>
        </section>
      </section>

      <section className={styles.install} aria-labelledby="local-heading">
        <div>
          <p className="eyebrow">Take the policy with you</p>
          <h2 id="local-heading">Run the same check locally.</h2>
          <p>
            From a checkout: <code>pnpm install</code>, then <code>pnpm --filter @flop-lab/spendguard build</code>. This
            command runs the bundled example policy.
          </p>
        </div>
        <div className={styles.command}>
          <code>{command}</code>
          <Control className="quiet-button" onClick={() => void copy(command, "Command")}>
            Copy command
          </Control>
        </div>
        <p className={styles.copyStatus} role="status">
          {copied}
        </p>
      </section>
      <section className={styles.limits} aria-labelledby="limits-heading">
        <h2 id="limits-heading">What this does not verify</h2>
        <p>
          This is an application policy simulation. It does not enforce chain limits, create preflight authorization,
          check finality or prove that a miner is available. A caller with a signer can bypass application checks.
        </p>
        <p>
          The browser ledger is temporary. It does not exercise the package's file lock, hash-chain audit log or refund
          reconciliation. Policy edits replay the processed prefix from an empty ledger. Reloading clears edits.
        </p>
        <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/spendguard">
          Read the package and its limits ↗
        </MotionLink>
      </section>
    </motion.div>
  );
}
