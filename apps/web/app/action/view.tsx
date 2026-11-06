// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { parseOptions } from "../../../../packages/action/src/options";
import { statusOf } from "../../../../packages/action/src/results";
import { checkNames, type CheckName, type Report } from "../../../../packages/action/src/types";
import styles from "./view.module.css";

const descriptions = {
  tape: "Exact escrow and displayed-price arithmetic on sampled settlements.",
  spec: "Pinned paper values beside dated public observations. Gaps stay visible.",
  contracts: "The stats tool's advertised input and output contract. Missing schemas stay incomplete.",
};

/** Configure a CI job beside historical results. @example <ActionView report={recordedRun} /> */
export function ActionView({ report }: { report: Report }) {
  const reduced = useReducedMotion() !== false;
  const [selected, setSelected] = useState<CheckName[]>(["tape"]);
  const [mode, setMode] = useState("recorded");
  const [budget, setBudget] = useState("10");
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 50%"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const duration = reduced ? 0 : 0.24;
  const visible = report.checks.filter((check) => selected.includes(check.name));
  const status = statusOf(visible.map((check) => check.status));
  let error = "";
  try {
    parseOptions({ checks: selected.join(","), mode, maxRequests: budget });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Invalid configuration";
  }
  const command = `node packages/cli/dist/cli.js action --checks ${selected.join(",")} --mode ${mode} --max-requests ${budget}`;
  const yaml = `- uses: zkasuran/flop-lab@main\n  id: flop\n  with:\n    checks: ${selected.join(",")}\n    mode: ${mode}\n    max-requests: '${budget}'\n    fail-on-incomplete: 'true'`;
  const toggle = (name: CheckName) =>
    setSelected((values) =>
      values.includes(name)
        ? values.filter((value) => value !== name)
        : checkNames.filter((value) => values.includes(value) || value === name),
    );
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ToolHeader slug="action" />
        <ReadingReveal order={3}>
          <p className={styles.lead}>
            Run the same evidence checks in your CI. Bound public requests and keep incomplete evidence separate from a
            pass.
          </p>
        </ReadingReveal>
      </header>
      <ReadingReveal>
        <section className={styles.builder} aria-labelledby="configure-checks">
          <div>
            <p className="eyebrow">Configure the job</p>
            <h2 id="configure-checks">Choose the question.</h2>
            <div className={styles.controls} role="group" aria-label="Selected checks">
              {checkNames.map((name) => (
                <MotionButton
                  key={name}
                  className="quiet-button"
                  aria-pressed={selected.includes(name)}
                  onClick={() => toggle(name)}
                >
                  {selected.includes(name) ? "Remove" : "Include"} {name}
                </MotionButton>
              ))}
            </div>
            <div className={styles.inputs}>
              <label>
                CI mode
                <motion.select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  whileHover={{ borderColor: "var(--accent)" }}
                  whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
                  transition={{ duration }}
                >
                  <option value="recorded">Recorded inputs</option>
                  <option value="live">Live public MCP</option>
                </motion.select>
              </label>
              <label>
                HTTP attempt ceiling
                <motion.input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  whileHover={{ borderColor: "var(--accent)" }}
                  whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
                  transition={{ duration }}
                />
              </label>
            </div>
            <p className="muted">
              Retries share this ceiling. Recorded mode sends no service requests. Bootstrap downloads are separate.
            </p>
          </div>
          <div className={styles.command}>
            <p className="eyebrow">Copy into a built checkout</p>
            {error ? (
              <p role="status">{error}</p>
            ) : (
              <>
                <pre>{command}</pre>
                <CopyButton text={command} label="Copy check command" />
                <Disclosure title="GitHub Action step">
                  <pre>{yaml}</pre>
                  <CopyButton text={yaml} label="Copy Action step" />
                  <p className="muted">
                    Pin the Action to a reviewed full commit SHA. Set a timeout on the containing job.
                  </p>
                </Disclosure>
              </>
            )}
          </div>
        </section>
      </ReadingReveal>
      <section className={styles.preview} aria-labelledby="recorded-preview">
        <ReadingReveal>
          <div className={styles.heading}>
            <div>
              <p className="eyebrow">Recorded preview / not a live run</p>
              <h2 id="recorded-preview">See what the job can prove.</h2>
            </div>
            <span className={styles.status} data-status={status}>
              {status}
            </span>
          </div>
          <p className="muted">
            The preview below always replays committed raw observations. Changing CI mode changes the command. It does
            not make a live request from this page.
          </p>
        </ReadingReveal>
        <div className={styles.metrics}>
          <ReadingReveal order={1}>
            <strong>
              <ObservedNumber value={visible.reduce((sum, check) => sum + check.pass, 0)} />
            </strong>
            <span>passing checks in selected recordings</span>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <strong>
              <ObservedNumber value={visible.reduce((sum, check) => sum + check.incomplete, 0)} />
            </strong>
            <span>incomplete checks in selected recordings</span>
          </ReadingReveal>
          <ReadingReveal order={3}>
            <strong>
              <ObservedNumber value={report.requests} />
            </strong>
            <span>HTTP attempts in this recorded evaluation</span>
          </ReadingReveal>
        </div>
        <div className={styles.results}>
          <AnimatePresence initial={false}>
            {visible.map((check) => {
              const total = check.pass + check.fail + check.incomplete;
              return (
                <motion.article
                  layout
                  key={check.name}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                  transition={{ duration }}
                  className={styles.card}
                >
                  <div className={styles.heading}>
                    <h3>{check.name}</h3>
                    <span className={styles.status} data-status={check.status}>
                      {check.status}
                    </span>
                  </div>
                  <p>{descriptions[check.name]}</p>
                  <p className="mono">
                    {check.pass} pass / {check.fail} fail / {check.incomplete} incomplete
                  </p>
                  <div className={styles.track} role="img" aria-label={`${check.pass} of ${total} checks passed`}>
                    <motion.div
                      initial={false}
                      animate={{ scaleX: total ? check.pass / total : 0 }}
                      transition={{ duration }}
                    />
                  </div>
                  <Disclosure title={`Sources and limits for ${check.name}`}>
                    <ul>
                      {check.sources.map((source) => (
                        <li key={`${source.url}-${source.measuredAt}`}>
                          <time dateTime={source.measuredAt}>{source.measuredAt}</time>
                          <br />
                          <MotionLink href={source.url} target="_blank" rel="noreferrer">
                            {source.url}
                          </MotionLink>
                        </li>
                      ))}
                    </ul>
                    {check.details.slice(0, 4).map((detail, index) => (
                      <p key={index}>{detail}</p>
                    ))}
                  </Disclosure>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
        {!visible.length && (
          <p role="status" className="panel">
            Select a check to preview its recorded result. An empty run is incomplete.
          </p>
        )}
      </section>
      <section className={styles.guide} ref={guide} aria-labelledby="job-path">
        <ReadingReveal>
          <p className="eyebrow">Read the execution path</p>
          <h2 id="job-path">A budget follows the whole job.</h2>
        </ReadingReveal>
        <div className={styles.line} aria-hidden="true">
          <motion.div style={{ scaleY: reduced ? 1 : progress }} />
        </div>
        {[
          {
            title: "Validate before requesting",
            text: "Unknown checks, duplicate names and invalid ceilings stop before any service request.",
          },
          {
            title: "Count each HTTP attempt",
            text: "Checks run in order. Retries consume the same cap. Exhaustion makes the remaining checks incomplete.",
          },
          {
            title: "Preserve the verdict",
            text: "The job summary names the source dates and limits. Allowing incomplete evidence never relabels it as pass.",
          },
        ].map((step, index) => (
          <ReadingReveal key={step.title} order={index}>
            <article className={styles.step}>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </article>
          </ReadingReveal>
        ))}
      </section>
      <ReadingReveal>
        <section className="panel">
          <h2>What this does not verify</h2>
          <p>
            The Action does not prove inference, consensus or the caller's application. Tape arithmetic does not prove
            money moved. Spec gaps do not prove enforcement. The contract audit covers the stats tool only. Recorded
            evidence is historical.
          </p>
          <p>
            <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/action">
              Read the inputs, outputs and local runner guide ↗
            </MotionLink>
          </p>
        </section>
      </ReadingReveal>
    </div>
  );
}
