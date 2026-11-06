// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import {
  commission,
  minerStake,
  slashStake,
  unbonding,
  type Citation,
  type Offence,
  type Parameters,
} from "../../../../packages/staking/src/model";
import type { auditStake } from "../../../../packages/staking/src/observed";
import { barRatio, filterMiners } from "./view";
import styles from "./staking.module.css";

type Report = Omit<ReturnType<typeof auditStake>, "sources"> & { sources: { source: string; measuredAt: string }[] };
function Quote({ citation }: { citation: Citation }) {
  return (
    <div className={styles.quote}>
      <blockquote>{citation.quote}</blockquote>
      <p>
        <MotionLink href={citation.source}>Source ↗</MotionLink> · Recorded <time>{citation.measuredAt}</time>
      </p>
    </div>
  );
}
function Bar({
  label,
  value,
  total,
  danger = false,
}: {
  label: string;
  value: string;
  total: string;
  danger?: boolean;
}) {
  const reduced = useReducedMotion() !== false;
  const ratio = barRatio(value, total);
  return (
    <div className={styles.barRow}>
      <div className={styles.barLabel}>
        <span>{label}</span>
        <strong>{value} FLOP</strong>
      </div>
      <div className={styles.track} aria-hidden="true">
        <motion.div
          data-stake-bar={label}
          className={danger ? styles.loss : styles.fill}
          initial={false}
          animate={{ scaleX: ratio }}
          transition={{ duration: reduced ? 0 : 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function StakeBuilder({
  parameters: p,
  offences,
  report,
}: {
  parameters: Parameters;
  offences: Offence[];
  report: Report;
}) {
  const reduced = useReducedMotion() !== false;
  const [capacity, setCapacity] = useState("1"),
    [percent, setPercent] = useState("20");
  const [offenceId, setOffenceId] = useState("fraud"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [shown, setShown] = useState(8),
    [positionsShown, setPositionsShown] = useState(8);
  let scenario: ReturnType<typeof minerStake> | null = null,
    error = "";
  try {
    scenario = minerStake(capacity, p);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  let capResult: ReturnType<typeof commission> | null = null;
  try {
    capResult = commission(percent, p);
  } catch {
    /* The inline status reports invalid input. */
  }
  const offence = offences.find((o) => o.id === offenceId) ?? offences[0]!;
  const loss = scenario ? slashStake(scenario.requiredFlop, offence) : null;
  const miners = filterMiners(report.miners, filter, query);
  const focus = { boxShadow: "0 0 0 2px var(--accent)" };
  const command = `flop stake miner --gflop ${scenario?.capacityGflop ?? "1"}`;
  const latest = report.sources
    .map((s) => s.measuredAt)
    .sort()
    .at(-1);
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.hero}>
        <ToolHeader slug="staking" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            A base bond is only the beginning. Build a capacity scenario, follow its slashing exposure and compare it
            with recorded miner balances.
          </p>
        </ReadingReveal>
        <ReadingReveal order={4}>
          <p className={styles.notice}>
            Documented defaults, not a runtime stake quote. Capacity economics are under reconciliation.
          </p>
        </ReadingReveal>
      </header>

      <section className={styles.builder} aria-labelledby="build-heading">
        <ReadingReveal>
          <div className={styles.inputs}>
            <p className="eyebrow">01 / Declare a scenario</p>
            <h2 id="build-heading">Build the bond</h2>
            <label htmlFor="capacity">
              Calibrated capacity scenario <span className="muted">GFLOP/s</span>
            </label>
            <motion.input
              id="capacity"
              inputMode="decimal"
              value={capacity}
              aria-invalid={Boolean(error)}
              aria-describedby="capacity-note capacity-error"
              onChange={(e) => setCapacity(e.target.value)}
              whileFocus={focus}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
            <p id="capacity-note" className="muted">
              Your input is not a hardware or calibration claim.
            </p>
            <p id="capacity-error" role="status" className={styles.error}>
              {error || "Exact decimal input. No exponent notation."}
            </p>
            <div className={styles.actions}>
              {["0", "1", "200"].map((n) => (
                <MotionButton key={n} onClick={() => setCapacity(n)} aria-pressed={capacity === n}>
                  {n} GFLOP/s
                </MotionButton>
              ))}
            </div>
            <label htmlFor="commission">Legacy commission scenario (%)</label>
            <motion.input
              id="commission"
              inputMode="decimal"
              value={percent}
              aria-invalid={!capResult}
              onChange={(e) => setPercent(e.target.value)}
              whileFocus={focus}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
            <p role="status" className="muted">
              {capResult
                ? `${capResult.withinLegacyCap ? "Within" : "Above"} the retained ${p.commissionCap}% cap.`
                : "Enter a percentage from 0 to 100."}{" "}
              D-0530 supersedes delegated staking.
            </p>
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.result} aria-live="polite">
            <p className="eyebrow">Documented requirement / FLOP</p>
            <motion.p
              data-required
              className={styles.total}
              key={scenario?.requiredFlop ?? "invalid"}
              initial={{ y: reduced ? 0 : 5 }}
              animate={{ y: 0 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
            >
              {scenario?.requiredFlop ?? "Invalid input"}
            </motion.p>
            <p className="muted">Base self-stake plus capacity exposure</p>
            {scenario && (
              <>
                <Bar label="Base" value={scenario.baseFlop} total={scenario.requiredFlop} />
                <Bar label="Capacity exposure" value={scenario.capacityBondFlop} total={scenario.requiredFlop} />
                <p className={styles.formula}>{scenario.formula.replace("capacity", scenario.capacityGflop)}</p>
                <p className="muted">
                  The bars share the required-stake scale. The exposure includes the revocation window and surge
                  multiplier.
                </p>
                <div className={styles.command}>
                  <code>{command}</code>
                  <CopyButton text={command} label="Copy scenario" />
                </div>
              </>
            )}
          </div>
        </ReadingReveal>
      </section>

      <section className={styles.facts} aria-label="Unbonding and validator floor">
        <ReadingReveal>
          <article>
            <p className="eyebrow">Miner unbonding</p>
            <h3>{p.minerUnbonding} blocks</h3>
            <p className="muted">
              {unbonding("miner", p).secondsAtTargetCadence} seconds at the documented target cadence. This is not a
              withdrawal deadline.
            </p>
          </article>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <article>
            <p className="eyebrow">Validator baseline</p>
            <h3>{p.validatorBaseline} FLOP</h3>
            <p className="muted">
              The effective floor is value-coupled and ratcheted. Baseline alone does not establish admission.
            </p>
          </article>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <article>
            <p className="eyebrow">Validator unbonding</p>
            <h3>{p.validatorUnbonding} blocks</h3>
            <p className="muted">
              {unbonding("validator", p).secondsAtTargetCadence} seconds at the target cadence. Separate from miner
              unbonding.
            </p>
          </article>
        </ReadingReveal>
      </section>

      <section className={styles.section} aria-labelledby="slash-heading">
        <ReadingReveal>
          <p className="eyebrow">02 / Follow the consequence</p>
          <h2 id="slash-heading">What can this bond lose?</h2>
          <p className="muted">
            Apply the quoted rule to your miner requirement as a hypothetical slashable balance. Validator and DA
            scenarios reuse that amount only for comparison.
          </p>
        </ReadingReveal>
        <div className={styles.actions} aria-label="Slashing scenarios">
          {offences.map((o) => (
            <MotionButton key={o.id} aria-pressed={o.id === offence.id} onClick={() => setOffenceId(o.id)}>
              {o.label}
            </MotionButton>
          ))}
        </div>
        <motion.div className={styles.scenario} layout={!reduced} transition={{ duration: reduced ? 0 : 0.24 }}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={offence.id}
              initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
            >
              <h3>{offence.label}</h3>
              <p>{offence.consequence}</p>
              <Quote citation={offence.citation} />
            </motion.div>
          </AnimatePresence>
          <div className={styles.lossPanel} aria-live="polite">
            {loss?.lossMaxFlop !== null && loss?.lossMaxFlop !== undefined ? (
              <>
                <p className={styles.lossNumber}>
                  Loss:{" "}
                  {loss.lossMinFlop === loss.lossMaxFlop
                    ? loss.lossMaxFlop
                    : `${loss.lossMinFlop} to ${loss.lossMaxFlop}`}{" "}
                  FLOP
                </p>
                <Bar label="Maximum scenario loss" value={loss.lossMaxFlop} total={loss.stakeFlop} danger />
                <p>
                  Remaining:{" "}
                  {loss.remainingMinFlop === loss.remainingMaxFlop
                    ? loss.remainingMinFlop
                    : `${loss.remainingMinFlop} to ${loss.remainingMaxFlop}`}{" "}
                  FLOP
                </p>
                <p className="muted">{loss.rounding}</p>
              </>
            ) : (
              <p role="status">
                {scenario
                  ? "Rate unspecified. The quoted source does not support a numeric loss."
                  : "Enter a valid capacity to calculate a loss."}
              </p>
            )}
          </div>
        </motion.div>
      </section>

      <ReadingPath
        title="From a scenario to a conviction"
        steps={[
          {
            title: "Size with all exposure factors",
            text: "The nominal coefficient is only one factor. The revocation window and surge factor remain part of the quoted model.",
          },
          {
            title: "Read current runtime eligibility",
            text: "Indexed capacity does not authenticate a current calibration lease. Sponsored principal counts only when the devnet feature and active balance semantics allow it.",
          },
          {
            title: "Require evidence before slashing",
            text: "A fraud conviction needs on-chain cryptographic evidence. The docs send slashed collateral to the FLOP Foundation account. This calculator makes no accusation.",
          },
        ]}
      />

      <section className={styles.section} aria-labelledby="observed-heading">
        <ReadingReveal>
          <p className="eyebrow">03 / Compare a dated recording</p>
          <h2 id="observed-heading">Observed stake</h2>
          <p className="muted">
            Last recorded response: <time>{latest ?? "No data"}</time>. This page makes no live requests.
          </p>
        </ReadingReveal>
        <div className={styles.facts}>
          <article>
            <p className="eyebrow">Miners in page</p>
            <h3>
              <ObservedNumber value={report.miners.length} />
            </h3>
            <p className="muted">
              {report.minerPageComplete ? "Complete at recorded pagination total." : "Incomplete or unavailable page."}
            </p>
          </article>
          <article>
            <p className="eyebrow">Indexed capacity available</p>
            <h3>
              <ObservedNumber value={report.miners.filter((r) => r.capacityGflop !== null).length} />
            </h3>
            <p className="muted">gnMax is not a calibration lease proof.</p>
          </article>
          <article>
            <p className="eyebrow">Sponsor positions sampled</p>
            <h3>
              <ObservedNumber value={report.positions.length} />
            </h3>
            <p className="muted">One page, bounded at {report.positionLimit}. Not a network total.</p>
          </article>
        </div>
        {report.errors.map((e) => (
          <p className={styles.notice} key={e}>
            No data: {e}
          </p>
        ))}
        <label htmlFor="miner-search">Find an address in the recording</label>
        <motion.input
          id="miner-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(8);
          }}
          whileFocus={focus}
          transition={{ duration: reduced ? 0 : 0.16 }}
        />
        <div className={styles.actions}>
          {[
            ["all", "All miners"],
            ["calibrated", "With indexed capacity"],
            ["missing", "Missing capacity"],
          ].map(([id, label]) => (
            <MotionButton
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id!);
                setShown(8);
              }}
            >
              {label}
            </MotionButton>
          ))}
        </div>
        <p role="status" className="muted">
          Showing {Math.min(shown, miners.length)} of {miners.length} matching miners.
        </p>
        <motion.div className={styles.minerList} layout={!reduced}>
          <AnimatePresence initial={false} mode="popLayout">
            {miners.slice(0, shown).map((m) => (
              <motion.article
                key={m.address}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <p className={styles.address}>{m.address}</p>
                <div className={styles.row}>
                  <span>{m.capacityGflop ?? "Unknown"} GFLOP/s</span>
                  <strong>{m.selfOnly}</strong>
                </div>
                <Disclosure title="Inspect indexed balance">
                  <dl className={styles.details}>
                    <dt>Self-stake</dt>
                    <dd>{m.selfFlop} FLOP</dd>
                    <dt>Sponsored</dt>
                    <dd>{m.sponsoredFlop} FLOP</dd>
                    <dt>Model requirement</dt>
                    <dd>{m.requiredFlop === null ? "Unverifiable without capacity" : `${m.requiredFlop} FLOP`}</dd>
                    <dt>With sponsored principal</dt>
                    <dd>{m.withSponsored} (conditional)</dd>
                    <dt>Commission</dt>
                    <dd>{m.legacyCommission}</dd>
                  </dl>
                </Disclosure>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
        {!miners.length && <p className={styles.notice}>No miners match. Missing data is not a zero-stake claim.</p>}
        {shown < miners.length && <MotionButton onClick={() => setShown(shown + 8)}>Show more miners</MotionButton>}
        <Disclosure title="Inspect sponsor positions">
          <p className="muted">
            Showing {Math.min(positionsShown, report.positions.length)} of {report.positions.length} sampled positions.
            The interval uses the last indexed update, not an authenticated unbond request.
          </p>
          {report.positions.slice(0, positionsShown).map((pos) => (
            <motion.article
              layout={!reduced}
              key={pos.id}
              className={styles.position}
              transition={{ duration: reduced ? 0 : 0.2 }}
            >
              <h3>
                {pos.id} · {pos.status}
              </h3>
              <p className={styles.address}>{pos.operator}</p>
              <p>
                {pos.principalFlop} FLOP remaining · {pos.principalCheck}
              </p>
              <p className="muted">
                Unlock block: {pos.unlockBlock ?? "Not reported"} · {pos.unbondingCheck}
              </p>
            </motion.article>
          ))}
          {!report.positions.length && <p>No sponsor positions in this response.</p>}
          {positionsShown < report.positions.length && (
            <MotionButton onClick={() => setPositionsShown(positionsShown + 8)}>Show more positions</MotionButton>
          )}
        </Disclosure>
        {report.totals && (
          <div className={styles.notice}>
            <h3>The aggregate is a separate field</h3>
            <p>
              Indexer miner total: {report.totals.reportedFlop} FLOP. Self plus sponsored components:{" "}
              {report.totals.selfPlusSponsoredFlop} FLOP. Legacy delegated component: {report.totals.delegatedFlop}{" "}
              FLOP, kept separate.
            </p>
            <p>
              Indexed validator current minimum: {report.totals.validatorCurrentMinimumFlop} FLOP.{" "}
              {report.totals.validatorFloorCheck}.
            </p>
          </div>
        )}
        <p>
          <MotionLink href={report.issue75.source}>Network #75 ↗</MotionLink> · <strong>{report.issue75.status}</strong>
          . {report.issue75.reason}
        </p>
        <Disclosure title="Sources, quotes and limits">
          {report.sources.map((s) => (
            <p key={s.source}>
              <MotionLink href={s.source}>{s.source}</MotionLink>
              <br />
              <time>{s.measuredAt}</time>
            </p>
          ))}
          {Object.entries(p.citations).map(([key, citation]) => (
            <Quote key={key} citation={citation} />
          ))}
          {report.limitations.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            {scenario?.rounding} Target-cadence seconds are estimates. Governance can change defaults and devnet can
            reset.
          </p>
        </Disclosure>
      </section>
      <footer className={styles.limit}>
        <h2>What this does not verify</h2>
        <p>
          Runtime storage, current calibration leases, finality, withdrawal eligibility and actual slashable balances
          are not verified. This is a read-only model. It does not stake funds or promise returns.
        </p>
        <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/staking">
          Read the model and run the CLI ↗
        </MotionLink>
      </footer>
    </div>
  );
}
