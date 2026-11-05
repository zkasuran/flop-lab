// SPDX-License-Identifier: Apache-2.0
"use client";
import { ToolHeader } from "@/components/tool-header";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MotionButton, MotionLink, ReadingReveal, ObservedNumber, Disclosure } from "@/components/motion";
import { CopyButton } from "@/components/controls";
import type recordedRun from "../../../../packages/x402kit/fixtures/run.json";
import { amountRatio, formatFlop, parsePreview, type Preview } from "./data";
import styles from "./x402.module.css";

const command = "pnpm --filter @flop-lab/x402kit build && node packages/x402kit/dist/cli.js serve 3350";
const steps = [
  {
    name: "Request",
    label: "Recorded",
    title: "Start with a bound request.",
    text: "The request ID links retries. The server binds the method, URL, body and application headers to one quote.",
  },
  {
    name: "402",
    label: "Recorded",
    title: "The service asks for payment.",
    text: "These are the actual headers from the local reference handler. FLOP's legacy SDK reads X-Payment-* fields.",
  },
  {
    name: "Quote",
    label: "Recorded",
    title: "Read the terms before spending.",
    text: "This is a configured example price. The quote is expired and non-executable. A bounded client refuses it.",
  },
  {
    name: "Pay",
    label: "Blocked",
    title: "Stop where the evidence stops.",
    text: "The SDK HTLC helper does not pass the quoted recipient into creation. No audited merchant-bound adapter is configured. No payment was made.",
  },
  {
    name: "Confirm",
    label: "UNVERIFIED",
    title: "A header is not chain evidence.",
    text: "A server must independently check canonical finality, exact amount, recipient and full settlement before accepting a proof.",
  },
  {
    name: "Response",
    label: "Unavailable",
    title: "Release data only after verification.",
    text: "There is no paid response in this recording. The public MCP preview below is separate from this payment flow.",
  },
] as const;

/** Replay recorded local headers beside real dated devnet observations. @example <X402Workbench run={run} initialPreview={preview} /> */
export function X402Workbench({ run, initialPreview }: { run: typeof recordedRun; initialPreview: Preview }) {
  const reduced = useReducedMotion() !== false;
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(initialPreview);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [order, setOrder] = useState<"block" | "amount">("block");
  const timeline = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: timeline, offset: ["start 85%", "end 35%"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const active = steps[step] ?? steps[0];
  const detail =
    step === 0
      ? run.request
      : step === 1
        ? run.response.headers
        : step === 2
          ? run.response.body.quote
          : step === 3
            ? { paymentExecution: run.paymentExecution, executable: run.response.body.quote.executable }
            : step === 4
              ? { chainEvidence: null, reason: "No independently observed merchant payment" }
              : { paidResponse: null, publicPreview: "/x402/preview" };
  const rows = [...preview.rows].sort((a, b) =>
    order === "block"
      ? b.settledBlock - a.settledBlock
      : BigInt(a.minerPaid) === BigInt(b.minerPaid)
        ? 0
        : BigInt(a.minerPaid) > BigInt(b.minerPaid)
          ? -1
          : 1,
  );
  const passing = preview.rows.filter((r) => r.escrowConserved).length;

  async function refresh() {
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch("/x402/preview", { signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      setPreview(parsePreview(await response.json()));
      setNotice("Read-only observation received. The payment recording is unchanged.");
    } catch {
      setNotice("Refresh unavailable. Showing the last received observation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <ReadingReveal>
          <MotionLink href="/#tools" className={styles.back}>
            ‹ All tools
          </MotionLink>
          <ToolHeader slug="x402" />
          <p className={styles.lead}>
            Trace the headers. Bound the spend. See exactly where chain verification is missing.
          </p>
          <div className={styles.actions}>
            <MotionLink className="button" href="#flow">
              Inspect the flow <span aria-hidden="true">↓</span>
            </MotionLink>
            <MotionLink className="quiet-button" href="https://github.com/zkasuran/flop-lab/tree/main/packages/x402kit">
              Source and protocol note ↗
            </MotionLink>
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <aside className={styles.receipt} aria-label="Recording summary">
            <div className={styles.receiptTop}>
              <span className="eyebrow">Local handler recording</span>
              <span className={styles.tag}>Replay</span>
            </div>
            <div className={styles.status}>
              <ObservedNumber value={run.response.status} />
              <span>
                Payment
                <br />
                required
              </span>
            </div>
            <div className={styles.rule} />
            <dl>
              <div>
                <dt>Asset</dt>
                <dd>{run.response.body.quote.asset}</dd>
              </div>
              <div>
                <dt>Example quote</dt>
                <dd>{run.response.body.quote.priceFlop} FLOP</dd>
              </div>
              <div>
                <dt>Chain execution</dt>
                <dd className={styles.warning}>UNVERIFIED</dd>
              </div>
            </dl>
            <p className={styles.stamp}>
              Recorded {run.measuredAt}
              <br />
              Source: local Request/Response handler
            </p>
            <div className={styles.receiptFoot}>No wallet connected. No funds moved.</div>
          </aside>
        </ReadingReveal>
      </section>

      <ReadingReveal order={2}>
        <div className={styles.boundary}>
          <span aria-hidden="true">⊘</span>
          <p>
            <strong>Payment execution is blocked.</strong> This reference has no verified chain adapter. The flow below
            replays recorded local headers. It is not a successful devnet payment.
          </p>
        </div>
      </ReadingReveal>

      <section ref={timeline} id="flow" className={styles.flow} aria-labelledby="flow-title">
        <ReadingReveal>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">Follow the request</p>
              <h2 id="flow-title">Every step has an evidence boundary.</h2>
            </div>
            <span className={styles.tag}>Recorded flow</span>
          </div>
        </ReadingReveal>
        <div className={styles.readingTrack} aria-hidden="true">
          <motion.div style={{ scaleX: reduced ? 1 : progress }} />
        </div>
        <p className={styles.caption}>The line tracks reading progress, not payment confirmation.</p>
        <div className={styles.steps} role="group" aria-label="Payment flow steps">
          {steps.map((item, i) => (
            <MotionButton
              key={item.name}
              onClick={() => setStep(i)}
              className={`${styles.step} ${i >= 3 ? styles.blockedStep : ""}`}
              aria-pressed={step === i}
              aria-controls="step-evidence"
            >
              {step === i && (
                <motion.span
                  className={styles.selection}
                  layoutId={reduced ? undefined : "x402-step"}
                  transition={{ duration: reduced ? 0 : 0.32 }}
                />
              )}
              <span className={styles.stepIndex} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <strong>{item.name}</strong>
              <span className={styles.stepLabel}>{item.label}</span>
            </MotionButton>
          ))}
        </div>
        <div id="step-evidence" className={styles.evidence}>
          <div className={styles.explanation}>
            <p className="eyebrow">{step < 3 ? "Recorded local evidence" : "Chain evidence missing"}</p>
            <motion.div
              key={step}
              initial={{ opacity: reduced ? 1 : 0.6, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              <h3>{active.title}</h3>
              <p className="muted">{active.text}</p>
            </motion.div>
            <div className={styles.actions}>
              <MotionButton className="quiet-button" onClick={() => setStep((step + 1) % steps.length)}>
                {step === steps.length - 1 ? "Restart replay" : "Next step"} <span aria-hidden="true">→</span>
              </MotionButton>
            </div>
          </div>
          <div className={styles.payload}>
            <div className={styles.payloadHead}>
              <span>{step < 3 ? "Recorded object" : "Evidence gap"}</span>
              <CopyButton text={JSON.stringify(detail, null, 2)} label="Copy object" />
            </div>
            <pre data-testid="payload">
              <code>{JSON.stringify(detail, null, 2)}</code>
            </pre>
          </div>
        </div>
        <MotionLink href="/x402/recording" className={styles.download} download>
          Download the complete recording ↓
        </MotionLink>
      </section>

      <section className={styles.preview} aria-labelledby="preview-title">
        <ReadingReveal>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">A real read-only payload</p>
              <h2 id="preview-title">Settlement preview, without a payment.</h2>
            </div>
            <MotionButton className="quiet-button" disabled={loading} onClick={refresh}>
              {loading ? "Reading devnet…" : "Refresh from devnet"}
            </MotionButton>
          </div>
        </ReadingReveal>
        <p className={styles.description}>
          Observed settlement rows from the hosted MCP. The arithmetic check asks whether miner payment, burn and refund
          add up to escrow. It does not prove chain finality or inference correctness.
        </p>
        <div className={styles.provenance}>
          <span className={styles.tag}>
            {preview.mode === "recorded" ? "Last-known recording" : "Live observation"}
          </span>
          <span>Observed {preview.measuredAt}</span>
          <MotionLink href="https://mcp.flop.network/mcp">Hosted FLOP MCP ↗</MotionLink>
        </div>
        <p role="status" className={styles.notice}>
          {notice || "Refresh is read-only. Server cache TTL: 60 seconds."}
        </p>
        <div className={styles.metrics}>
          <div>
            <span className="eyebrow">Rows in this sample</span>
            <strong>
              <ObservedNumber value={preview.rows.length} />
            </strong>
          </div>
          <div>
            <span className="eyebrow">Escrow sums agree</span>
            <strong>
              <ObservedNumber value={passing} />
              <span className={styles.denominator}> / {preview.rows.length}</span>
            </strong>
          </div>
          <div>
            <span className="eyebrow">Paid service response</span>
            <strong className={styles.noReceipt}>Not recorded</strong>
          </div>
        </div>
        <div className={styles.tableHead}>
          <span>Miner payment / FLOP</span>
          <MotionButton
            className="quiet-button"
            onClick={() => setOrder(order === "block" ? "amount" : "block")}
            aria-pressed={order === "amount"}
          >
            {order === "block" ? "Sort by amount" : "Sort by block"}
          </MotionButton>
        </div>
        <motion.div className={styles.rows} layout={!reduced}>
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.article
                className={styles.row}
                key={row.channelId}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.4 }}
              >
                <div className={styles.rowTop}>
                  <span>Block {row.settledBlock.toLocaleString("en-US")}</span>
                  <span className={row.escrowConserved ? styles.agrees : styles.warning}>
                    {row.escrowConserved ? "Sum agrees" : "Sum differs"}
                  </span>
                </div>
                <p className={styles.amount}>
                  {formatFlop(row.minerPaid)} <span>FLOP</span>
                </p>
                <div className={styles.amountTrack} aria-hidden="true">
                  <motion.div
                    initial={{ scaleX: reduced ? amountRatio(row.minerPaid, rows) : 0 }}
                    whileInView={{ scaleX: amountRatio(row.minerPaid, rows) }}
                    viewport={{ once: true }}
                    transition={{ duration: reduced ? 0 : 0.5 }}
                  />
                </div>
                <Disclosure title={`Inspect channel ${row.channelId.slice(0, 10)}`}>
                  <div className={styles.rowDetail}>
                    <p>
                      Channel: <code>{row.channelId}</code>
                    </p>
                    <p>
                      Miner payment in raw units: <code>{row.minerPaid}</code>
                    </p>
                    <p>
                      Source: {preview.source}
                      <br />
                      Observed: {preview.measuredAt}
                    </p>
                  </div>
                </Disclosure>
              </motion.article>
            ))}
          </AnimatePresence>
          {!rows.length && <p className={styles.empty}>No settlement rows were returned. No values are inferred.</p>}
        </motion.div>
        <p className={styles.caption}>
          Bar length = miner payment / largest miner payment in this sample. Values remain readable during motion.
        </p>
      </section>

      <ReadingReveal>
        <section className={styles.run} aria-labelledby="run-title">
          <div>
            <p className="eyebrow">Run the reference</p>
            <h2 id="run-title">Bring the evidence to your terminal.</h2>
            <p className="muted">
              From a flop-lab checkout after <code>pnpm install</code>. Node 22. The demo listens on loopback.
            </p>
          </div>
          <div className={styles.command}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy command" />
          </div>
          <p className="muted">
            Open <code>http://127.0.0.1:3350/preview</code>. The protected route asks for payment but cannot accept a
            proof without an audited adapter.
          </p>
        </section>
      </ReadingReveal>
      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          The recording does not verify a merchant payment, runtime finality, TEE appraisal or standard x402 v2
          interoperability. The kit checks supplied evidence and request policy. Its chain adapter remains UNVERIFIED.
        </p>
      </section>
    </div>
  );
}
