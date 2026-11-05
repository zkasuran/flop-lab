// SPDX-License-Identifier: Apache-2.0
"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/controls";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { observeFlow, observed, recordedRequests, stages } from "./data";
import styles from "./pipeline.module.css";

const pluginUrl = "https://github.com/zkasuran/flop-lab/tree/main/plugins/kestra-flop";

/** Inspect a dated Kestra execution. Example: <KestraPipeline />. */
export function KestraPipeline() {
  const [active, setActive] = useState(0);
  const [view, setView] = useState<"yaml" | "output">("yaml");
  const reduced = useReducedMotion() !== false;
  const pipeline = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: pipeline, offset: ["start 85%", "end 40%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const stage = stages[active] ?? stages[0];
  const code = view === "yaml" ? stage.yaml : JSON.stringify(stage.output, null, 2);
  const coverage = observed.tape.count / observed.tape.total;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <ReadingReveal>
            <MotionLink href="/#tools" className={styles.back}>
              ← All tools
            </MotionLink>
            <p className="eyebrow">
              FLOP for Kestra <span className="badge alpha">alpha</span>
            </p>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <h1>
              From network
              <br />
              to workflow.
            </h1>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <p className={styles.intro}>
              Read the devnet. Check settlement arithmetic. Pass dated outputs to the next task in your Kestra flow.
            </p>
            <div className={styles.actions}>
              <CopyButton text={observeFlow} label="Copy read-only flow" />
              <MotionLink href={`${pluginUrl}#build-and-install`} className={styles.textLink}>
                Install the plugin ↗
              </MotionLink>
            </div>
            <p className={styles.small}>No FLOP key needed for the read-only flow.</p>
          </ReadingReveal>
        </div>
        <ReadingReveal order={3}>
          <aside className={styles.runCard} aria-label="Recorded execution summary">
            <div className={styles.cardTop}>
              <span className="eyebrow">Recorded execution</span>
              <span className={styles.success}>{observed.execution.state}</span>
            </div>
            <div className={styles.runCount}>
              <ObservedNumber value={observed.verify.count} />
              <span>settlements checked</span>
            </div>
            <p className="muted">Arithmetic {observed.verify.status} on the returned rows.</p>
            <dl className={styles.runFacts}>
              <div>
                <dt>HTTP requests</dt>
                <dd>
                  <ObservedNumber value={recordedRequests} />
                </dd>
              </div>
              <div>
                <dt>Kestra</dt>
                <dd>{observed.execution.kestraVersion}</dd>
              </div>
              <div>
                <dt>Read limit reached</dt>
                <dd>{observed.tape.truncated ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <div className={styles.timestamp}>
              <span>Captured on devnet</span>
              <time dateTime={observed.execution.completedAt}>
                {observed.execution.completedAt.slice(0, 10)} · {observed.execution.completedAt.slice(11, 16)} UTC
              </time>
            </div>
            <p className={styles.small}>Historical output. This page does not run Kestra or refresh the network.</p>
          </aside>
        </ReadingReveal>
      </header>

      <section ref={pipeline} className="section" aria-labelledby="pipeline-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inspect the flow</p>
            <h2 id="pipeline-title">Every step leaves a record.</h2>
          </div>
          <p className="muted">
            Choose a node to see its task YAML and recorded output. The line tracks reading progress, not execution.
          </p>
        </div>
        <div className={styles.workspace}>
          <div
            className={styles.nodes}
            role="tablist"
            aria-label="Kestra tasks"
            aria-orientation="vertical"
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? stages.length - 1
                    : (active + (event.key === "ArrowDown" ? 1 : -1) + stages.length) % stages.length;
              setActive(next);
              document.getElementById(`node-${stages[next]?.id}`)?.focus();
            }}
          >
            <div className={styles.track} aria-hidden="true">
              <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
            </div>
            {stages.map((item, index) => (
              <div key={item.id}>
                {index === 4 && <p className={styles.branchLabel}>Separate flows · different evidence</p>}
                <ReadingReveal order={index % 4}>
                  <MotionButton
                    id={`node-${item.id}`}
                    role="tab"
                    aria-selected={active === index}
                    aria-controls="task-panel"
                    tabIndex={active === index ? 0 : -1}
                    className={`${styles.node} ${active === index ? styles.active : ""}`}
                    onClick={() => setActive(index)}
                  >
                    {active === index && (
                      <motion.span
                        className={styles.selectedNode}
                        layoutId="kestra-selected-node"
                        transition={{ duration: reduced ? 0 : 0.25 }}
                      />
                    )}
                    <span className={styles.nodeNumber} aria-hidden="true">
                      {index < 4 ? `0${index + 1}` : "+"}
                    </span>
                    <span className={styles.nodeText}>
                      <span className={styles.nodeTitle}>{item.name}</span>
                      <span className={styles.nodeType}>{item.type}</span>
                      <span className={styles.nodeMetric}>{item.metric}</span>
                    </span>
                  </MotionButton>
                </ReadingReveal>
              </div>
            ))}
          </div>
          <div
            id="task-panel"
            role="tabpanel"
            aria-labelledby={`node-${stage.id}`}
            className={styles.inspector}
            tabIndex={0}
          >
            <motion.div
              key={stage.id}
              initial={{ opacity: reduced ? 1 : 0.65, x: reduced ? 0 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
              className={styles.detail}
            >
              <div className={styles.detailHeading}>
                <span className={`badge ${active < 4 ? "alpha" : ""}`}>{stage.label}</span>
                <h3>{stage.type}</h3>
                <p className="muted">{stage.description}</p>
              </div>
              <div className={styles.codeTools}>
                <div className={styles.views} aria-label="Code view">
                  <MotionButton aria-pressed={view === "yaml"} onClick={() => setView("yaml")}>
                    Task YAML
                  </MotionButton>
                  <MotionButton aria-pressed={view === "output"} onClick={() => setView("output")}>
                    Recorded output
                  </MotionButton>
                </div>
                <CopyButton
                  key={`${stage.id}-${view}`}
                  text={code}
                  label={view === "yaml" ? "Copy YAML" : "Copy JSON"}
                />
              </div>
              <pre
                className={styles.code}
                tabIndex={0}
                aria-label={`${stage.type} ${view === "yaml" ? "YAML" : "recorded JSON"}`}
              >
                <code>{code}</code>
              </pre>
              <p className={styles.note}>{stage.note}</p>
              <dl className={styles.provenance}>
                <div>
                  <dt>{stage.id === "verify" ? "Checked at" : "Measured at"}</dt>
                  <dd>
                    <time dateTime={stage.measuredAt}>{stage.measuredAt}</time>
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{stage.source}</dd>
                </div>
              </dl>
            </motion.div>
          </div>
        </div>
      </section>

      <section className={`section ${styles.bounds}`} aria-labelledby="bounds-title">
        <ReadingReveal>
          <p className="eyebrow">A bounded read</p>
          <h2 id="bounds-title">Know where the evidence ends.</h2>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.coverageHeader}>
            <p>Returned rows / reported tape total</p>
            <strong>
              <ObservedNumber value={observed.tape.count} /> / <ObservedNumber value={observed.tape.total} />
            </strong>
          </div>
          <div className={styles.coverageTrack} aria-hidden="true">
            <motion.div
              data-coverage-bar
              initial={{ scaleX: reduced ? coverage : 0 }}
              whileInView={{ scaleX: coverage }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 0.48 }}
            />
          </div>
          <p className={styles.small}>
            Source: {observed.tape.source}
            <br />
            <time dateTime={observed.tape.measuredAt}>{observed.tape.measuredAt}</time>. The feed can move between
            pages.
          </p>
        </ReadingReveal>
        <div className={styles.limitGrid}>
          <ReadingReveal order={1}>
            <article>
              <span className={styles.limitLabel}>What passed</span>
              <h3>Integer conservation.</h3>
              <p className="muted">
                For each supplied row, miner paid + unused escrow + burned equals escrow. Amounts stay as integer
                strings. Block order is also checked.
              </p>
              <code className={styles.formula}>minerPaid + unusedEscrow + burned = escrow</code>
            </article>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <article>
              <span className={styles.limitLabel}>What remains unknown</span>
              <h3>Work behind the numbers.</h3>
              <p className="muted">
                These checks do not verify inference, proofs, signatures, chain inclusion, finality or indexer truth. A
                PASS applies only to the returned rows.
              </p>
              <MotionLink href={`${pluginUrl}#what-this-does-not-verify`} className={styles.textLink}>
                Read the verification limits ↗
              </MotionLink>
            </article>
          </ReadingReveal>
        </div>
      </section>

      <section className={`section ${styles.getStarted}`} aria-labelledby="run-title">
        <ReadingReveal>
          <p className="eyebrow">Bring it to your Kestra instance</p>
          <h2 id="run-title">Copy the flow. Keep the provenance.</h2>
          <p className="muted">
            Build the plugin with Java 21 in Docker, install the JAR and restart Kestra. Paste this flow into the
            editor. Each network task returns its time, source and request count.
          </p>
          <div className={styles.actions}>
            <MotionLink href={`${pluginUrl}#build-and-install`} className="button">
              Build and install ↗
            </MotionLink>
            <MotionLink href="/kestra/evidence" className={styles.textLink}>
              Open recorded evidence ↗
            </MotionLink>
          </div>
          <p className={styles.small}>
            Execution <code>{observed.execution.id}</code>
            <br />
            The JSON is an excerpt of the local Kestra run, not a signed receipt.
          </p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.flowBox}>
            <div className={styles.codeTools}>
              <span className="mono">flop_observe.yml</span>
              <CopyButton text={observeFlow} label="Copy complete flow" />
            </div>
            <pre className={styles.fullFlow} tabIndex={0}>
              <code>{observeFlow}</code>
            </pre>
          </div>
        </ReadingReveal>
      </section>
    </div>
  );
}
