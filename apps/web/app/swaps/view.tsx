// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { planSwap, parameters, specification, type SwapPlanInput } from "../../../../packages/swaps/src/planner";
import { generateHashLock, normalizeHashLock } from "../../../../packages/swaps/src/hash";
import type { recordedObservations } from "../../../../packages/swaps/src/observed";
import styles from "./view.module.css";
import { timelineGeometry } from "./model";

type Report = ReturnType<typeof recordedObservations>;
const initial: SwapPlanInput = {
  flopBlocks: "7200",
  otherBlocks: "6",
  flopBlockMs: "1000",
  otherBlockMs: "600000",
  currentFinalityLag: "0",
  refundHead: "finalized",
  counterRefundBeforeLateClaim: true,
};

function Timeline({ plan }: { plan: ReturnType<typeof planSwap> }) {
  const reduced = useReducedMotion() !== false;
  const { foreignBoundary: endOther, safeBoundary: endRequired, legs } = timelineGeometry(plan);
  return (
    <div className={styles.timeline}>
      <div className={styles.row}>
        <h3>Two-chain timing envelope</h3>
        <span className={styles.tag}>Synthetic scenario</span>
      </div>
      <p className="muted">Both durations start now. A timeout enables refund. It does not erase a hash-lock claim.</p>
      {legs.map((leg) => (
        <div className={styles.leg} key={leg.label}>
          <div className={styles.row}>
            <strong>{leg.label}</strong>
            <span>
              {leg.blocks} blocks · {leg.ms} ms
            </span>
          </div>
          <div className={styles.track} aria-hidden="true">
            <motion.div
              data-swap-bar={leg.label}
              className={leg.label === "FLOP" ? styles.flopBar : styles.otherBar}
              initial={false}
              animate={{ scaleX: leg.scale }}
              transition={{ duration: reduced ? 0 : 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      ))}
      <div
        className={styles.zones}
        aria-hidden="true"
        style={{
          background:
            endRequired === null
              ? "var(--surface-raised)"
              : `linear-gradient(to right, var(--danger) 0% ${endOther * 100}%, var(--warning) ${endOther * 100}% ${endRequired * 100}%, var(--accent) ${endRequired * 100}% 100%)`,
        }}
      />
      <div className={styles.legend}>
        <span>
          <i className={styles.red} />
          Too early: foreign duration
        </span>
        <span>
          <i className={styles.amber} />
          Required safety allowance
        </span>
        <span>
          <i className={styles.green} />
          Timing region only
        </span>
      </div>
      <p className={styles.caption}>
        {endRequired === null
          ? "Safety boundary unknown without current finality lag."
          : `Minimum FLOP duration: ${plan.requiredFlopBlocks} one-second blocks. The green region does not override a frozen admission gate or prove completion.`}
      </p>
    </div>
  );
}

export function SwapView({ report }: { report: Report }) {
  const reduced = useReducedMotion() !== false;
  const [input, setInput] = useState<SwapPlanInput>(initial);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(6);
  const [pair, setPair] = useState<Awaited<ReturnType<typeof generateHashLock>> | null>(null);
  const [reveal, setReveal] = useState(false);
  const [hash, setHash] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [busy, setBusy] = useState(false);
  let plan: ReturnType<typeof planSwap> | null = null,
    inputError = "";
  try {
    plan = planSwap(input);
  } catch (error) {
    inputError = error instanceof Error ? error.message : String(error);
  }
  let hashCommand = "";
  try {
    if (hash) hashCommand = `node packages/cli/dist/cli.js swap check --hash-lock ${normalizeHashLock(hash)}`;
  } catch {
    /* Show the inline validation message. */
  }
  const rows = report.htlcs.value ?? [];
  const filtered = rows.filter(
    (row) => (filter === "all" || row.status === filter) && row.hashLock.toLowerCase().includes(query.toLowerCase()),
  );
  const statuses = Array.from(new Set(rows.map((row) => row.status).filter((s): s is string => s !== null))).sort();
  const focus = { boxShadow: "0 0 0 2px var(--accent)" };
  const duration = reduced ? 0 : 0.24;
  const command = plan
    ? `node packages/cli/dist/cli.js swap plan --flop-blocks ${input.flopBlocks} --other-blocks ${input.otherBlocks} --flop-block-ms ${input.flopBlockMs} --other-block-ms ${input.otherBlockMs}${input.currentFinalityLag !== null ? ` --lag ${input.currentFinalityLag}` : ""} --refund-head ${input.refundHead}${input.counterRefundBeforeLateClaim === true ? " --counter-refund-first" : ""}`
    : "";
  const setField = (key: keyof SwapPlanInput, value: string) =>
    setInput((previous) => ({ ...previous, [key]: key === "currentFinalityLag" && value === "" ? null : value }));
  async function generate() {
    setBusy(true);
    setGenerationError("");
    setReveal(false);
    try {
      const next = await generateHashLock();
      setPair(next);
      setHash(next.hashLock);
    } catch {
      setGenerationError("Local Web Crypto generation failed. Use the CLI on Node 22.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.hero}>
        <ToolHeader slug="swaps" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            Give the FLOP leg enough time. Check the finality gate. Keep the preimage local.
          </p>
        </ReadingReveal>
        <ReadingReveal order={4}>
          <p className={styles.notice}>
            Timing is one condition. The pinned paper makes no deployed chain-pair completion guarantee.
          </p>
        </ReadingReveal>
      </header>

      <section className={styles.facts} aria-label="Recorded public observations">
        <ReadingReveal>
          <article>
            <p className="eyebrow">Open FLOP_BTC orders</p>
            <strong className={styles.number}>
              <ObservedNumber value={report.swaps.value?.total} />
            </strong>
            <p>Order indexer total for this pair and status.</p>
            <time>{report.swaps.measuredAt}</time>
          </article>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <article>
            <p className="eyebrow">Indexed HTLC rows</p>
            <strong className={styles.number}>
              <ObservedNumber value={report.htlcs.value?.length} />
            </strong>
            <p>First page. These are not verified paired swaps.</p>
            <time>{report.htlcs.measuredAt}</time>
          </article>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <article>
            <p className="eyebrow">Hash-lock checker</p>
            <strong className={styles.unknown}>UNKNOWN</strong>
            <p>{report.check.value?.explanation ?? "No checker data"}</p>
            <time>{report.check.measuredAt}</time>
          </article>
        </ReadingReveal>
      </section>
      <p className={styles.source}>
        Last-known recordings from <MotionLink href={report.swaps.source}>the hosted FLOP MCP ↗</MotionLink>. This page
        does not poll.
      </p>

      <section className={styles.section} aria-labelledby="planner-heading">
        <ReadingReveal>
          <p className="eyebrow">01 / Declare the timing</p>
          <h2 id="planner-heading">Plan the gap between refunds</h2>
          <p>Counter-chain reveal to FLOP relay. Inputs below are a synthetic scenario, not measured chain state.</p>
        </ReadingReveal>
        <div className={styles.presets} aria-label="Synthetic scenarios">
          <MotionButton onClick={() => setInput(initial)}>Timing boundary</MotionButton>
          <MotionButton onClick={() => setInput({ ...initial, flopBlocks: "4320" })}>Margin too short</MotionButton>
          <MotionButton onClick={() => setInput({ ...initial, flopBlocks: "9000", currentFinalityLag: "120" })}>
            Finality frozen
          </MotionButton>
          <MotionButton onClick={() => setInput({ ...initial, currentFinalityLag: null })}>Lag unknown</MotionButton>
        </div>
        <div className={styles.builder}>
          <div className={styles.panel}>
            <h3>Remaining duration from the same instant</h3>
            <div className={styles.fields}>
              {(
                [
                  { key: "flopBlocks", label: "FLOP timelock", unit: "blocks" },
                  { key: "otherBlocks", label: "Other timelock", unit: "blocks" },
                  { key: "flopBlockMs", label: "FLOP block interval", unit: "ms" },
                  { key: "otherBlockMs", label: "Other block interval", unit: "ms" },
                  { key: "currentFinalityLag", label: "Current finality lag", unit: "blocks; blank = unknown" },
                ] as const
              ).map((field) => (
                <label key={field.key} htmlFor={field.key}>
                  {field.label}
                  <span className="muted">{field.unit}</span>
                  <motion.input
                    id={field.key}
                    inputMode="numeric"
                    maxLength={30}
                    value={input[field.key] ?? ""}
                    onChange={(event) => setField(field.key, event.target.value)}
                    whileFocus={focus}
                    transition={{ duration }}
                  />
                </label>
              ))}
              <label htmlFor="refund-head">
                FLOP refund gate<span className="muted">Declared assumption</span>
                <motion.select
                  id="refund-head"
                  value={input.refundHead}
                  onChange={(event) =>
                    setInput({ ...input, refundHead: event.target.value as SwapPlanInput["refundHead"] })
                  }
                  whileFocus={focus}
                  transition={{ duration }}
                >
                  <option value="finalized">Finalized head</option>
                  <option value="tip">Tip only</option>
                  <option value="unknown">Unknown</option>
                </motion.select>
              </label>
            </div>
            <label className={styles.checkbox}>
              <motion.input
                type="checkbox"
                checked={input.counterRefundBeforeLateClaim === true}
                onChange={(event) =>
                  setInput({ ...input, counterRefundBeforeLateClaim: event.target.checked ? true : null })
                }
                whileFocus={focus}
                transition={{ duration }}
              />
              Assume counter refund is included before a late claim
            </label>
            <p className="muted">
              The paper uses a one-second FLOP clock. Changing an interval models time; it does not change runtime
              parameters.
            </p>
          </div>
          <div className={`${styles.panel} ${styles.result}`}>
            <div className={styles.resultStatus} aria-live="polite" aria-atomic="true">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={plan?.status ?? "invalid"}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration }}
                >
                  <p className="eyebrow">Declared conditions</p>
                  <h3
                    className={plan?.status === "PASS" ? styles.pass : styles.unknown}
                    data-plan-status={plan?.status ?? "INVALID"}
                  >
                    {!plan
                      ? "Invalid input"
                      : plan.status === "PASS"
                        ? "Timing conditions met"
                        : plan.status === "FAIL"
                          ? "Do not start under these inputs"
                          : "More evidence needed"}
                  </h3>
                </motion.div>
              </AnimatePresence>
            </div>
            {plan ? (
              <>
                <div className={styles.row}>
                  <span>Minimum FLOP blocks</span>
                  <strong data-required-blocks>{plan.requiredFlopBlocks ?? "Unknown"}</strong>
                </div>
                <div className={styles.row}>
                  <span>Headroom in blocks</span>
                  <strong>{plan.headroomBlocks ?? "Unknown"}</strong>
                </div>
                <Timeline plan={plan} />
              </>
            ) : (
              <p role="alert">{inputError}</p>
            )}
          </div>
        </div>
        {plan && (
          <div className={styles.rules}>
            {plan.checks.map((check) => (
              <Disclosure key={check.id} title={`${check.status} · ${check.id}`}>
                <p>{check.explanation}</p>
                <blockquote>{check.quote}</blockquote>
                <MotionLink href={`${specification.source}#10-htlc-atomic-swap`}>Pinned source ↗</MotionLink>
              </Disclosure>
            ))}
          </div>
        )}
        {command && (
          <div className={styles.command}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy plan command" />
          </div>
        )}
        <p className={styles.source}>
          Documented defaults: margin {parameters.marginPercent}%, finality stall {parameters.maxFinalityStall} blocks,
          freeze {parameters.freezeThreshold} blocks, BTC interval {parameters.btcBlockSeconds} seconds and burn share{" "}
          {parameters.burnSharePpt} ppt. Captured {specification.measuredAt}.{" "}
          <MotionLink href={specification.source}>Exact paper text ↗</MotionLink>
        </p>
      </section>

      <ReadingPath
        title="What must happen before value moves"
        steps={[
          {
            title: "Lock against one hash",
            text: "Each FLOP-leg hash lock permits at most one successful redeem or refund. This planner does not create a lock.",
          },
          {
            title: "Observe the counter-chain reveal",
            text: "The supported direction assumes a counter-chain reveal followed by FLOP relay. Counterparty binding, finality and timely inclusion need separate evidence.",
          },
          {
            title: "Leave the finality allowance",
            text: "The longer FLOP timelock must cover the foreign duration plus the larger of the percentage margin and finality allowance. A frozen gate rejects new opens.",
          },
          {
            title: "Resolve through the right terminal path",
            text: "FLOP refunds require the finalized head. Counter refunds must precede late claims under the pair's assumptions. A passed timing calculation does not establish that ordering.",
          },
        ]}
      />

      <section className={styles.section} aria-labelledby="hash-heading">
        <ReadingReveal>
          <p className="eyebrow">02 / Keep the preimage here</p>
          <h2 id="hash-heading">Local bytes. Public hash.</h2>
          <p>Generate with this browser's Web Crypto. The preimage stays in memory. Nothing is sent to a service.</p>
        </ReadingReveal>
        <div className={styles.panel}>
          <div className={styles.presets}>
            <MotionButton disabled={busy} onClick={generate}>
              {busy ? "Generating" : "Generate local pair"}
            </MotionButton>
            {pair && (
              <MotionButton
                onClick={() => {
                  setPair(null);
                  setHash("");
                  setReveal(false);
                }}
              >
                Clear local pair
              </MotionButton>
            )}
          </div>
          {generationError && <p role="alert">{generationError}</p>}
          <AnimatePresence initial={false}>
            {pair && (
              <motion.div
                key={pair.hashLock}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration }}
                className={styles.local}
              >
                <p>SHA-256 hash lock</p>
                <code data-local-hash>{pair.hashLock}</code>
                <CopyButton text={pair.hashLock} label="Copy hash lock" />
                <MotionButton aria-expanded={reveal} onClick={() => setReveal(!reveal)}>
                  {reveal ? "Hide preimage" : "Reveal private preimage"}
                </MotionButton>
                {reveal && (
                  <div>
                    <p>Keep this value private until the intended redemption.</p>
                    <code data-local-preimage>{pair.preimage}</code>
                  </div>
                )}
                <p className="muted">Generated locally at {pair.generatedAt}. Reloading discards this pair.</p>
              </motion.div>
            )}
          </AnimatePresence>
          <label htmlFor="lookup-hash">
            Prepare a read-only hash lookup
            <motion.input
              id="lookup-hash"
              value={hash}
              maxLength={66}
              placeholder="32-byte hash lock in hex"
              onChange={(event) => setHash(event.target.value)}
              whileFocus={focus}
              transition={{ duration }}
            />
          </label>
          {hash && !hashCommand && (
            <p role="alert">Use exactly 64 hexadecimal characters, with an optional 0x prefix.</p>
          )}
          {hashCommand && (
            <div className={styles.command}>
              <code>{hashCommand}</code>
              <CopyButton text={hashCommand} label="Copy hash lookup command" />
            </div>
          )}
          <p className="muted">
            Run the command with the built CLI. It sends only the hash lock to flop_check_htlc. The recorded checker
            could not distinguish an absent HTLC from unavailable RPC.
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="observed-heading">
        <ReadingReveal>
          <p className="eyebrow">03 / Inspect last-known evidence</p>
          <h2 id="observed-heading">HTLCs are not an order book</h2>
          <p>
            The recorded order list contains {report.swaps.value?.total ?? "no measured count of"} open FLOP_BTC orders.
            Below are indexed HTLCs from a separate first-page query.
          </p>
        </ReadingReveal>
        <div className={styles.presets} aria-label="HTLC status filters">
          {["all", ...statuses, ...(!statuses.includes("SETTLED") ? ["SETTLED"] : [])].map((status) => (
            <MotionButton
              key={status}
              aria-pressed={filter === status}
              onClick={() => {
                setFilter(status);
                setShown(6);
              }}
            >
              {status === "all" ? "All recorded" : status}
            </MotionButton>
          ))}
        </div>
        <label htmlFor="hash-filter">
          Filter by hash lock
          <motion.input
            id="hash-filter"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(6);
            }}
            whileFocus={focus}
            transition={{ duration }}
          />
        </label>
        <p aria-live="polite">{filtered.length} matching rows in this recorded page.</p>
        <div className={styles.observed}>
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.slice(0, shown).map((row) => (
              <motion.article
                layout={!reduced}
                key={row.hashLock}
                data-htlc={row.hashLock}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration }}
              >
                <div className={styles.row}>
                  <strong>{row.status ?? "Status unknown"}</strong>
                  <span>Timeout height: {row.timeout ?? "Unknown"}</span>
                </div>
                <code>{row.hashLock}</code>
                <Disclosure title="Inspect indexed fields">
                  <dl>
                    <dt>Raw amount</dt>
                    <dd>{row.amount ?? "Unknown"}</dd>
                    <dt>Sender</dt>
                    <dd>{row.sender || "Not reported"}</dd>
                    <dt>Recipient</dt>
                    <dd>{row.recipient || "Not reported"}</dd>
                  </dl>
                  <p>Indexed status only. No finalized inclusion or counter-chain association is verified.</p>
                  <CopyButton
                    text={`node packages/cli/dist/cli.js swap check --hash-lock ${normalizeHashLock(row.hashLock)}`}
                    label="Copy indexed hash lookup"
                  />
                </Disclosure>
              </motion.article>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && <p className={styles.empty}>No rows match this filter in the recorded page.</p>}
        </div>
        {filtered.length > shown && (
          <MotionButton onClick={() => setShown(shown + 6)}>Show more recorded rows</MotionButton>
        )}
        <Disclosure title="Inspect raw observation and query">
          <pre>
            {JSON.stringify(
              {
                source: report.htlcs.source,
                measuredAt: report.htlcs.measuredAt,
                query: report.htlcs.args.query,
                raw: report.htlcs.raw,
              },
              null,
              2,
            )}
          </pre>
        </Disclosure>
      </section>

      <section className={`${styles.section} ${styles.notice}`} aria-labelledby="limits-heading">
        <h2 id="limits-heading">What this does not verify</h2>
        <p>
          This page does not verify runtime admission, finalized storage, chain-pair qualification, counterparty
          binding, relayer permissions, timely inclusion or refund ordering. It sends no transactions. Indexer records
          can outlive a devnet reset.
        </p>
        <p>
          The zero burn-share parameter preserves principal under the documented rule. It does not provide a fee-floor
          or incentive guarantee.
        </p>
        <MotionLink href="https://docs.flop.network/docs/atomic-swaps">Read the draft swap guide ↗</MotionLink>
      </section>
    </div>
  );
}
