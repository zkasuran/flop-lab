// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import {
  formatFlop,
  integer,
  parseFlop,
  paymentSplit,
  rewardAt,
  rewardSplit,
  SPEC,
  subsidyAt,
  supplyAt,
  UNIT,
} from "../../../../packages/economics/src/model";
import type { Comparison, Report, Status } from "../../../../packages/economics/src/compare";
import styles from "./workbench.module.css";

const H = SPEC.halvingInterval;
const eras = Array.from({ length: 6 }, (_, i) => ({
  block: BigInt(i) * H,
  reward: rewardAt(i === 0 ? 1n : BigInt(i) * H),
}));
const x = (block: bigint) => 40 + (Number((block * 10000n) / (6n * H)) / 10000) * 820;
const y = (reward: bigint) => 230 - (Number(reward / UNIT) / 96) * 190;
const curve = eras
  .map(
    (e, i) =>
      `${i === 0 ? "M" : "H"} ${x(e.block)} ${i === 0 ? y(e.reward) : `V ${y(e.reward)}`} H ${x((BigInt(i) + 1n) * H)}`,
  )
  .join(" ");

function Amount({ value }: { value: bigint }) {
  const reduced = useReducedMotion() !== false;
  return (
    <motion.span
      key={value.toString()}
      initial={{ y: reduced ? 0 : 5 }}
      animate={{ y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22 }}
      className={styles.amount}
    >
      {formatFlop(value)}
    </motion.span>
  );
}

function Curve({ head }: { head: number | null }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 95%", "end 40%"] });
  const remaining = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const marked = head === null ? null : BigInt(head);
  const visible = marked !== null && marked <= 6n * H;
  return (
    <section ref={ref} className={`section ${styles.curve}`} aria-labelledby="emission-heading">
      <ReadingReveal>
        <p className="eyebrow">01 / The target schedule</p>
        <h2 id="emission-heading">Halve. Then keep the floor.</h2>
        <p className="muted">This is the pinned emission model. Scroll reveals the schedule, not observed issuance.</p>
      </ReadingReveal>
      <div className={styles.chart}>
        <svg viewBox="0 0 900 275" role="img" aria-labelledby="curve-title curve-desc">
          <title id="curve-title">Block reward schedule from the yellowpaper</title>
          <desc id="curve-desc">
            The reward halves at each era boundary and stays at three FLOP from era five. The table below gives exact
            amounts. Genesis block zero is unrewarded.
          </desc>
          {[3, 48, 96].map((value) => (
            <g key={value}>
              <line x1="40" x2="860" y1={y(BigInt(value) * UNIT)} y2={y(BigInt(value) * UNIT)} stroke="var(--border)" />
              <text x="0" y={y(BigInt(value) * UNIT) + 5} fill="var(--muted)" fontSize="14">
                {value}
              </text>
            </g>
          ))}
          <path d={curve} fill="none" stroke="var(--border)" strokeWidth="4" />
          <motion.path
            data-emission-path
            d={curve}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            pathLength={1}
            strokeDasharray="1"
            style={{ strokeDashoffset: reduced ? 0 : remaining }}
          />
          {visible && (
            <g>
              <line x1={x(marked)} x2={x(marked)} y1="20" y2="240" stroke="var(--warning)" strokeDasharray="3 5" />
              <circle cx={x(marked)} cy={y(rewardAt(marked))} r="6" fill="var(--warning)" />
            </g>
          )}
          {eras.map((e, i) => (
            <text key={i} x={x(e.block)} y="265" fill="var(--muted)" fontSize="14">
              Era {i}
            </text>
          ))}
        </svg>
      </div>
      <p className={styles.source}>
        Observed head: {head === null ? "No data" : head.toLocaleString("en-US")}.{" "}
        {visible
          ? "The gold marker locates that block on the model."
          : "The observed head is outside this chart or unavailable."}{" "}
        Zero is unrewarded.
      </p>
      <div className={styles.eras}>
        {eras.map((e, i) => (
          <div key={i}>
            <div>
              <span className="eyebrow">
                Era {i}
                {i === 5 ? " onward" : ""}
              </span>
              <strong>
                {formatFlop(e.reward)} <small>FLOP / block</small>
              </strong>
              <span className="muted">
                from block {e.block.toLocaleString("en-US")}
                {i === 0 ? " (reward starts at 1)" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="muted">
        Supply and reward receipts: <strong>UNOBSERVABLE</strong>. The selected indexer fields contain no issuance or
        reward-distribution records.
      </p>
    </section>
  );
}

function Calculators({ head, payment }: { head: number | null; payment: string | null }) {
  const reduced = useReducedMotion() !== false;
  const [blockInput, setBlock] = useState(head?.toString() ?? "");
  const [paymentInput, setPayment] = useState(payment === null ? "" : formatFlop(BigInt(payment)));
  let block: bigint | null = null,
    paymentValue: bigint | null = null;
  let blockError = "",
    paymentError = "";
  try {
    block = integer(blockInput);
  } catch {
    blockError = "Enter a nonnegative whole block number.";
  }
  try {
    paymentValue = parseFlop(paymentInput);
  } catch {
    paymentError = "Enter FLOP with at most 18 decimal places.";
  }
  const supply = block === null ? null : supplyAt(block);
  const split = paymentValue === null ? null : paymentSplit(paymentValue);
  const legs = split
    ? [
        { name: "Miner", value: split.miner, share: "850 / 1000" },
        { name: "Validators", value: split.validators, share: "150 / 1000 less audit" },
        { name: "Audit pool", value: split.audit, share: "10,000 / 1,000,000 of payment" },
      ]
    : [];
  return (
    <section className="section" aria-labelledby="calculator-heading">
      <ReadingReveal>
        <p className="eyebrow">02 / Calculate the rule</p>
        <h2 id="calculator-heading">Exact amounts. Explicit assumptions.</h2>
        <p className="muted">
          The starting inputs come from the recording. Your edits are scenarios. Results use the pinned target and
          base-unit integer arithmetic.
        </p>
      </ReadingReveal>
      <div className={styles.calculators}>
        <div className={styles.panel}>
          <h3>Supply through a block</h3>
          <label htmlFor="block-input">Block number, inclusive</label>
          <motion.input
            id="block-input"
            inputMode="numeric"
            value={blockInput}
            maxLength={78}
            onChange={(e) => setBlock(e.target.value)}
            aria-invalid={Boolean(blockError)}
            aria-describedby="block-error"
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          />
          <p id="block-error" className={styles.validation}>
            {blockError || "Genesis has no block reward. Gross supply is not circulating supply."}
          </p>
          <div className={styles.presets}>
            <MotionButton className="quiet-button" onClick={() => setBlock("0")}>
              Genesis
            </MotionButton>
            <MotionButton className="quiet-button" onClick={() => setBlock(H.toString())}>
              First halving
            </MotionButton>
            <MotionButton className="quiet-button" onClick={() => setBlock(SPEC.subsidyEnd.toString())}>
              Subsidy ends
            </MotionButton>
          </div>
          {supply && block !== null && (
            <dl className={styles.results} aria-live="polite">
              <div>
                <dt>Gross scheduled supply</dt>
                <dd data-gross>
                  <Amount value={supply.gross} /> FLOP
                </dd>
              </div>
              <div>
                <dt>Reward at block</dt>
                <dd data-reward>
                  <Amount value={rewardAt(block)} /> FLOP
                </dd>
              </div>
              <div>
                <dt>Subsidy per recipient at block</dt>
                <dd>
                  <Amount value={subsidyAt(block)} /> FLOP
                </dd>
              </div>
              <div>
                <dt>Cumulative reward / subsidy</dt>
                <dd>
                  {formatFlop(supply.emission)} / {formatFlop(supply.subsidy)} FLOP
                </dd>
              </div>
            </dl>
          )}
          {block !== null && (
            <Disclosure title="Inspect reward pool amounts">
              <dl className={styles.results}>
                {Object.entries(rewardSplit(block)).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{formatFlop(value)} FLOP</dd>
                  </div>
                ))}
              </dl>
              <p className="muted">Pools only. Individual rewards and onward payouts are not verified.</p>
            </Disclosure>
          )}
        </div>
        <div className={styles.panel}>
          <h3>Follow an inference payment</h3>
          <label htmlFor="payment-input">Gross payable, FLOP</label>
          <motion.input
            id="payment-input"
            inputMode="decimal"
            value={paymentInput}
            maxLength={79}
            onChange={(e) => setPayment(e.target.value)}
            aria-invalid={Boolean(paymentError)}
            aria-describedby="payment-error"
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          />
          <p id="payment-error" className={styles.validation}>
            {paymentError || "Successful cooperative spot settlement. Inclusion fees and tips are separate."}
          </p>
          <div className={styles.flow} aria-live="polite">
            <div className={styles.payer}>
              Agent escrow <span aria-hidden="true">↓</span>
            </div>
            {legs.map((leg, i) => (
              <motion.div
                key={leg.name}
                className={styles.leg}
                layout={!reduced}
                transition={{ duration: reduced ? 0 : 0.25 }}
              >
                <div>
                  <span>{leg.name}</span>
                  <strong>
                    <Amount value={leg.value} /> FLOP
                  </strong>
                </div>
                <div className={styles.track} aria-hidden="true">
                  <motion.div
                    data-payment-bar={leg.name}
                    initial={false}
                    animate={{
                      scaleX:
                        paymentValue && paymentValue > 0n ? Number((leg.value * 1000000n) / paymentValue) / 1000000 : 0,
                    }}
                    transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : i * 0.04 }}
                  />
                </div>
                <small className="muted">{leg.share}</small>
              </motion.div>
            ))}
          </div>
          {split && (
            <p className={styles.source} data-dust>
              Unassigned rounding dust: {split.roundingDust.toString()} base units. Burn: {formatFlop(split.burned)}{" "}
              FLOP. The audit allocation comes out of the validator pool.
            </p>
          )}
          <p className="muted">
            The paper does not name the recipient of indivisible dust. The calculator floors each pool and keeps dust
            visible.
          </p>
        </div>
      </div>
    </section>
  );
}

function CheckRow({ row }: { row: Comparison }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() !== false;
  const id = `detail-${row.id}`;
  return (
    <motion.article
      data-check={row.id}
      layout={!reduced}
      className={styles.check}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reduced ? 1 : 0 }}
      transition={{ duration: reduced ? 0 : 0.22 }}
    >
      <MotionButton
        className={styles.checkToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span>
          <span className={styles.status} data-status={row.status}>
            {row.status}
          </span>{" "}
          {row.quantity}
          <small>
            {row.block === undefined ? row.clause : `Settlement block ${row.block.toLocaleString("en-US")}`}
          </small>
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
        >
          ›
        </motion.span>
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            data-detail
            className={styles.detail}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
          >
            <p>{row.reason}</p>
            <dl className={styles.results}>
              <div>
                <dt>Expected, base units</dt>
                <dd>{row.expected ?? "Not derivable"}</dd>
              </div>
              <div>
                <dt>Observed, base units</dt>
                <dd>{row.observed ?? "Not exposed"}</dd>
              </div>
            </dl>
            {row.channelId && (
              <p className={styles.source}>
                Channel <code>{row.channelId}</code>
              </p>
            )}
            <MotionLink href={SPEC.source}>{row.clause}: pinned source ↗</MotionLink>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** Dated economics workbench. @example <EconomicsWorkbench report={report} payment="1000000000000000000" /> */
export function EconomicsWorkbench({ report, payment }: { report: Report; payment: string | null }) {
  const [filter, setFilter] = useState<Status | "ALL">("DRIFT");
  const [limit, setLimit] = useState(8);
  const rows = report.rows.filter((row) => filter === "ALL" || row.status === filter);
  const firstMiner = report.rows.find((row) => row.id.endsWith(":miner"));
  return (
    <div className={styles.page}>
      <section className={`section ${styles.hero}`}>
        <ToolHeader slug="economics" />
        <ReadingReveal order={3}>
          <div className={styles.finding}>
            <span className="eyebrow">Recorded target comparison</span>
            <h2>{report.counts.DRIFT > 0 ? "The indexed miner fee differs." : "Read the available evidence."}</h2>
            {firstMiner?.observed && firstMiner.expected && !firstMiner.expected.includes("..") && (
              <p>
                Latest sampled miner payment: <strong>{formatFlop(BigInt(firstMiner.observed))} FLOP</strong>. Target:{" "}
                <strong>{formatFlop(BigInt(firstMiner.expected))} FLOP</strong>.
              </p>
            )}
            <p className="muted">
              DRIFT compares the indexer with the pinned paper. It does not prove a runtime defect.{" "}
              <MotionLink href="https://github.com/flop-labs/network/issues/7">Existing upstream report ↗</MotionLink>
            </p>
          </div>
        </ReadingReveal>
      </section>
      <div className={styles.provenance}>
        <p>
          <strong>Last-known recording</strong> · <time dateTime={report.measuredAt}>{report.measuredAt}</time>
        </p>
        <p>
          <MotionLink href={report.source}>Hosted MCP / indexer ↗</MotionLink> · {report.sampleSize} sampled settlements
          {report.totalSettlements === null ? "" : ` of ${report.totalSettlements} indexed`} ·{" "}
          <MotionLink href={report.spec.source}>Paper {report.spec.sha.slice(0, 7)} ↗</MotionLink>
        </p>
        <MotionLink href="/economics/recording" download>
          Download raw observation ↓
        </MotionLink>
      </div>
      <div className={styles.metrics}>
        {(["MATCH", "DRIFT", "UNOBSERVABLE"] as const).map((status, i) => (
          <ReadingReveal key={status} order={i}>
            <div className={styles.metric}>
              <span className={styles.status} data-status={status}>
                {status}
              </span>
              <strong>
                <ObservedNumber value={report.counts[status]} />
              </strong>
              <small>compared quantities</small>
            </div>
          </ReadingReveal>
        ))}
      </div>
      <Curve head={report.head} />
      <Calculators head={report.head} payment={payment} />
      <section className="section" aria-labelledby="comparison-heading">
        <ReadingReveal>
          <p className="eyebrow">03 / Inspect the evidence</p>
          <h2 id="comparison-heading">Which quantities can we compare?</h2>
          <p className="muted">
            Amounts below are exact base units. Each row keeps its source clause and explains its limits.
          </p>
        </ReadingReveal>
        <div className={styles.filters} role="group" aria-label="Filter comparisons">
          {(["ALL", "MATCH", "DRIFT", "UNOBSERVABLE"] as const).map((status) => (
            <MotionButton
              key={status}
              className="quiet-button"
              aria-pressed={filter === status}
              onClick={() => {
                setFilter(status);
                setLimit(8);
              }}
            >
              {status === "ALL" ? "All" : status} {status === "ALL" ? report.rows.length : report.counts[status]}
            </MotionButton>
          ))}
        </div>
        <p className={styles.source} role="status">
          Showing {Math.min(limit, rows.length)} of {rows.length} quantities.
        </p>
        <div className={styles.checks}>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.slice(0, limit).map((row) => (
              <CheckRow key={row.id} row={row} />
            ))}
          </AnimatePresence>
        </div>
        {rows.length === 0 && <p>No quantities in this filter. No result was invented.</p>}
        {rows.length > limit && (
          <MotionButton className="quiet-button" onClick={() => setLimit(limit + 12)}>
            Show more quantities
          </MotionButton>
        )}
        <Disclosure title="Why networkValue and termCurve are not supply evidence">
          <p>
            networkValue contains contributor concentration. termCurve contains forward-market prices. stats supplies
            the observed block. None exposes token issuance or reward receipts. A zero contributor count is not zero
            supply. A missing price is not a zero fee.
          </p>
          <p>
            Validator and audit receipts are absent from these settlement fields. unusedEscrow is a residual label. It
            is not proof of a refund.
          </p>
        </Disclosure>
      </section>
      <section className={`section ${styles.footer}`}>
        <h2>Reproduce the comparison.</h2>
        <div className={styles.command}>
          <code>pnpm --filter @flop-lab/cli exec node dist/cli.js economics compare --json</code>
          <CopyButton
            text="pnpm --filter @flop-lab/cli exec node dist/cli.js economics compare --json"
            label="Copy replay command"
          />
        </div>
        <p className="muted">
          Build first using the package quick start. The CLI replays this recording by default. Add --live for a bounded
          public read.
        </p>
        <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/economics#formula-ledger">
          Formula ledger and quick start ↗
        </MotionLink>
        <h3>What this does not verify</h3>
        <p className="muted">
          No runtime storage proof, circulating supply, finality, reward recipient, audit payout or inference
          correctness. The gross supply model assumes the pinned genesis and unchanged schedule with the survival
          governor off. Historical projections can differ from the current target. Devnet can reset.
        </p>
      </section>
    </div>
  );
}
