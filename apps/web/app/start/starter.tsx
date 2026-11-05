// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CopyButton } from "@/components/controls";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolMark } from "@/components/tool-header";
import styles from "./starter.module.css";

interface Props {
  files: { name: string; detail: string }[];
  record: {
    healthAt: string;
    discoveryAt: string;
    source: string;
    registered: number;
    served: number;
    miners: number;
    fixtureFiles: number;
  };
}
const command = "node packages/cli/dist/cli.js start /tmp/my-flop-agent --max-flop 0.1";
const steps = [
  [
    "Check the network",
    "A fresh flop_health response must say FLOP Devnet, connected and not syncing. The service label is not a chain proof.",
  ],
  [
    "Discover and route",
    "Use served model and miner pairs from discovery. The scoreboard only selects a miner with eligible settlement evidence.",
  ],
  [
    "Reserve the full amount",
    "Require an expiring quote, then ask Spendguard before invoking an adapter. Keep the ledger across runs.",
  ],
  [
    "Check the settlement",
    "Fetch evidence for the returned channel and run the verifier. Missing proof stays incomplete. The budget stays reserved.",
  ],
] as const;

export function Starter({ files, record }: Props) {
  const reduced = useReducedMotion() !== false;
  const [selected, setSelected] = useState("src/guards.ts");
  const [replay, setReplay] = useState(0);
  const pipeline = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: pipeline, offset: ["start 85%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const tree = [
    ...files,
    { name: "fixtures/", detail: "Dated raw public responses. Offline replay uses their capture time." },
  ];
  const detail = tree.find((file) => file.name === selected)!;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ReadingReveal>
          <p className="eyebrow">
            <ToolMark slug="start" /> Build / Agent starter
          </p>
          <h1>
            Start with a ceiling.
            <br />
            <span>Run without spending.</span>
          </h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <p className={styles.lead}>
            A small TypeScript agent with devnet checks, miner routing, a spend ledger and settlement checks. Your first
            run uses recorded public inputs.
          </p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <div className={styles.command}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy starter command" />
          </div>
          <p className="muted">
            Run from a built flop-lab checkout. Choose a new destination.{" "}
            <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/create-flop-agent">
              Setup and quick start ↗
            </MotionLink>
          </p>
        </ReadingReveal>
        <ReadingReveal order={3}>
          <p className={styles.notice}>
            Dry run by default. No wallet or paid transport ships. The default ceiling is <code>0.1 FLOP</code>;
            generated code caps it at <code>1 FLOP</code>. These are policy settings.
          </p>
        </ReadingReveal>
      </header>

      <section aria-labelledby="tree-title" className={styles.project}>
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Open the scaffold</p>
            <h2 id="tree-title">Every file has a job.</h2>
          </div>
          <MotionButton className="quiet-button" onClick={() => setReplay((value) => value + 1)}>
            Replay file reveal
          </MotionButton>
        </div>
        <p className="muted">This is a preview of the generated project. Select a file to inspect its purpose.</p>
        <div className={styles.workspace}>
          <div className={styles.tree} role="group" aria-label="Generated files" key={replay}>
            <p className={styles.folder}>my-flop-agent/</p>
            {tree.map((file, index) => (
              <motion.div
                key={file.name}
                initial={{ x: reduced ? 0 : -12 }}
                whileInView={{ x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: reduced ? 0 : 0.25, delay: reduced ? 0 : Math.min(index * 0.025, 0.25) }}
              >
                <MotionButton
                  className={styles.file}
                  aria-pressed={selected === file.name}
                  onClick={() => setSelected(file.name)}
                >
                  {selected === file.name && (
                    <motion.span
                      className={styles.selection}
                      layoutId={reduced ? undefined : "starter-file"}
                      transition={{ duration: reduced ? 0 : 0.2 }}
                    />
                  )}
                  <span aria-hidden="true" className={styles.branch}>
                    ├
                  </span>
                  <code>{file.name}</code>
                </MotionButton>
              </motion.div>
            ))}
          </div>
          <div className={styles.inspector} aria-live="polite">
            <p className="eyebrow">File purpose</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selected}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: reduced ? 1 : 0 }}
                transition={{ duration: reduced ? 0 : 0.12 }}
              >
                <h3>
                  <code>{detail.name}</code>
                </h3>
                <p>{detail.detail}</p>
              </motion.div>
            </AnimatePresence>
            <div className={styles.terminal}>
              <p>After generation</p>
              <code>
                pnpm install --no-frozen-lockfile
                <br />
                pnpm check
                <br />
                pnpm start
              </code>
            </div>
            <p className="muted">
              The project links to this checkout until the packages are published. Keep the source checkout installed
              and at the same path.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.record} aria-labelledby="record-title">
        <p className="eyebrow">Recorded real inputs / not a live offer</p>
        <h2 id="record-title">The dry run has something real to read.</h2>
        <div className={styles.metrics}>
          {[
            [record.registered, "registered models"],
            [record.served, "models reported served"],
            [record.miners, "distinct listed miners"],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>
                <ObservedNumber value={Number(value)} />
              </strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className={styles.barTrack} aria-hidden="true">
          <motion.div
            initial={{ scaleX: reduced ? record.served / Math.max(1, record.registered) : 0 }}
            whileInView={{ scaleX: record.served / Math.max(1, record.registered) }}
            viewport={{ once: true }}
            transition={{ duration: reduced ? 0 : 0.45 }}
          />
        </div>
        <p className="muted">
          Bar: served models divided by registered models. A listing does not establish availability or an executable
          price.
        </p>
        <p>
          <strong>Health reported FLOP Devnet.</strong> Connected and not syncing at{" "}
          <time dateTime={record.healthAt}>{record.healthAt}</time>.
        </p>
        <p className="muted">
          Discovery captured <time dateTime={record.discoveryAt}>{record.discoveryAt}</time>. Source:{" "}
          <MotionLink href={record.source}>hosted FLOP MCP</MotionLink>, <code>flop_health</code> and{" "}
          <code>flop_discover_models</code>. The scaffold contains{" "}
          <ObservedNumber value={files.length + record.fixtureFiles} /> files including raw observations.
        </p>
        <p className={styles.notice}>
          A successful discovery can still stop at <code>quote-required</code>. A historical price is never used as a
          spending quote. No eligible miner is also a valid result.
        </p>
      </section>

      <section ref={pipeline} className={styles.pipeline} aria-labelledby="pipeline-title">
        <p className="eyebrow">Follow one bounded turn</p>
        <h2 id="pipeline-title">Checks before effects.</h2>
        <p className="muted">The line tracks reading progress, not verification status.</p>
        <div className={styles.steps}>
          <div className={styles.track} aria-hidden="true">
            <motion.div style={{ scaleY: reduced ? 1 : scaleY }} />
          </div>
          {steps.map(([title, text], index) => (
            <ReadingReveal key={title} order={index}>
              <article>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </section>
      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          A health label is not a genesis-hash or consensus proof. The starter does not perform inference or enforce a
          budget on a future adapter that ignores its quote. Public settlement checks do not establish correct
          inference, authenticated hardware or finality.
        </p>
        <div className={styles.links}>
          <MotionLink href="/scoreboard">Inspect the router ↗</MotionLink>
          <MotionLink href="/spendguard">Inspect spend policy ↗</MotionLink>
          <MotionLink href="/verify">Inspect verification ↗</MotionLink>
        </div>
      </section>
    </div>
  );
}
