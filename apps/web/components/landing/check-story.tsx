// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import type { TapeRow } from "@/lib/evidence";
import { statusLabel } from "@/lib/status";
import { CONTRIBUTOR_DID } from "@/lib/constants";
import { ArrowRight } from "../icons";
import { EASE_OUT, MotionLink } from "../motion";
import styles from "./landing.module.css";

/** Group raw integer strings without converting them to floating point. Example: grouped("5220000") is "5,220,000". */
function grouped(value: string | null): string {
  if (value === null) return "missing";
  return /^\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : value;
}

type Recording = { measuredAt: string; recording: string; source: string; tool: string };

const steps = [
  {
    title: "Read what the network publishes",
    text: "The verifier reads a settlement page from FLOP's public MCP server. No wallet, no key, no account.",
  },
  {
    title: "Recompute it in exact integers",
    text: "Miner pay, unused escrow and burn must add up to the escrow. The check uses integer strings, never floating point.",
  },
  {
    title: "Label every check",
    text: "Each check reads PASS, FAIL or UNVERIFIABLE. What public data cannot settle stays on the page.",
  },
  {
    title: "Sign what was published",
    text: "Every pull request carries an Ed25519 signature over its file hashes. You can check it in your browser.",
  },
];

function Visual({ step, row, tape }: { step: number; row: TapeRow; tape: Recording }) {
  const lines = [
    { op: "", label: "minerPaid", value: row.minerPaid },
    { op: "+", label: "unusedEscrow", value: row.unusedEscrow },
    { op: "+", label: "burned", value: row.burned },
  ];
  let body: ReactNode;
  if (step === 0)
    body = (
      <>
        <p className={styles.visualKicker}>Request</p>
        <p className={`mono ${styles.visualCall}`}>{tape.tool}</p>
        <dl className={styles.visualFacts}>
          <div>
            <dt>Settled block</dt>
            <dd className="mono">{row.block === null ? "unknown" : row.block.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Channel</dt>
            <dd className="mono">{row.channel ? `${row.channel.slice(0, 14)}…${row.channel.slice(-8)}` : "unknown"}</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd className="mono">
              <time dateTime={tape.measuredAt}>{tape.measuredAt.slice(0, 16).replace("T", " ")} UTC</time>
            </dd>
          </div>
        </dl>
        <p className={styles.visualNote}>Source: {tape.source}</p>
      </>
    );
  else if (step === 1)
    body = (
      <>
        <p className={styles.visualKicker}>Escrow conservation</p>
        <div className={styles.visualEquation}>
          {lines.map((line) => (
            <div key={line.label} className={styles.visualRow}>
              <span>{line.op}</span>
              <span>{line.label}</span>
              <span className="mono">{grouped(line.value)}</span>
            </div>
          ))}
          <div className={`${styles.visualRow} ${styles.visualTotal}`}>
            <span>=</span>
            <span>escrow</span>
            <span className="mono">{grouped(row.escrow)}</span>
          </div>
        </div>
        <p className={styles.visualNote}>
          Difference <b className="mono">{row.difference ?? "unknown"}</b> raw units. Recorded values, grouped for
          reading.
        </p>
      </>
    );
  else if (step === 2)
    body = (
      <>
        <p className={styles.visualKicker}>Results for this settlement</p>
        <ul className={styles.visualChecks}>
          <li>
            <span>Escrow conservation</span>
            <span className={styles.tickerChip} data-status={row.conservation}>
              {statusLabel(row.conservation)}
            </span>
          </li>
          <li>
            <span>Display price ratio</span>
            <span className={styles.tickerChip} data-status={row.ratio}>
              {statusLabel(row.ratio)}
            </span>
          </li>
        </ul>
        <p className={styles.visualKicker}>Still needs evidence</p>
        <ul className={styles.visualOpen}>
          {["Agreed pricing", "Transcript inclusion", "Hardware quotes", "Challenge window"].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </>
    );
  else
    body = (
      <>
        <p className={styles.visualKicker}>Publisher key</p>
        <p className={`mono ${styles.visualKey}`}>{CONTRIBUTOR_DID}</p>
        <ul className={styles.visualChecks}>
          <li>
            <span>Algorithm</span>
            <span className="mono">Ed25519</span>
          </li>
          <li>
            <span>Covers</span>
            <span>The hash of every changed file</span>
          </li>
          <li>
            <span>Does not prove</span>
            <span>That the code is right</span>
          </li>
        </ul>
        <MotionLink className="text-link" href="/provenance">
          Verify a signature <ArrowRight />
        </MotionLink>
      </>
    );
  return (
    <div className={styles.visualCard} data-step={step}>
      <span className={styles.visualIndex} aria-hidden="true">
        {String(step + 1).padStart(2, "0")}
      </span>
      {body}
    </div>
  );
}

/**
 * How a check works, told in four steps. On wide screens the section pins and scrolling advances the steps.
 * The scroll line tracks reading, not verification. Narrow screens and reduced motion show every step in order.
 * Values come from the first row of the recorded tape. Example: <CheckStory row={tape.rows[0]} tape={tape} />.
 */
export function CheckStory({ row, tape }: { row: TapeRow; tape: Recording }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.min(steps.length - 1, Math.max(0, Math.floor(value * steps.length * 0.999)));
    setStep((current) => (current === next ? current : next));
  });
  return (
    <section ref={ref} className={styles.story} aria-labelledby="story-title">
      <div className={styles.storySticky}>
        <div className={styles.storyCopy}>
          <p className={`eyebrow ${styles.blockEyebrow}`}>
            <span aria-hidden="true" />
            How a check works
          </p>
          <h2 id="story-title">From a public record to a labelled result.</h2>
          <div className={styles.storyTrack}>
            <div className={styles.storyRail} aria-hidden="true">
              <motion.span style={{ scaleY: reduced ? 1 : fill }} />
            </div>
            <ol className={styles.storySteps}>
              {steps.map((item, index) => (
                <li key={item.title} data-active={index === step} data-done={index < step}>
                  <span className={styles.storyIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <div className={styles.storyInline}>
                      <Visual step={index} row={row} tape={tape} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className={styles.storyStage}>
          <div className={styles.stageGlow} aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className={styles.stageItem}
              initial={{ opacity: 0, y: reduced ? 0 : 24, scale: reduced ? 1 : 0.97, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: reduced ? 0 : -16, scale: reduced ? 1 : 0.98, filter: "blur(4px)" }}
              transition={{ duration: reduced ? 0 : 0.42, ease: EASE_OUT }}
            >
              <Visual step={step} row={row} tape={tape} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
