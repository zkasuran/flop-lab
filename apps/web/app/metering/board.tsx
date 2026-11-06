// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { accountWork, decayWeight, leasePhase, type Parameters } from "../../../../packages/metering/src/model";
import type { auditSnapshot } from "../../../../packages/metering/src/observed";
import { filterMiners, ratio } from "./view";
import styles from "./metering.module.css";

type Report = ReturnType<typeof auditSnapshot>;
type Rule = { source: string; measuredAt: string; pin: string; quote: string };
function Input({
  id,
  label,
  value,
  onChange,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const reduced = useReducedMotion() !== false;
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <motion.input
        id={id}
        value={value}
        inputMode="numeric"
        maxLength={80}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
        transition={{ duration: reduced ? 0 : 0.16 }}
      />
    </label>
  );
}
function Bar({ value, total, label }: { value: string; total: string; label: string }) {
  const reduced = useReducedMotion() !== false;
  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={styles.track} aria-hidden="true">
        <motion.div
          data-meter-bar={label}
          initial={false}
          animate={{ scaleX: ratio(value, total) }}
          transition={{ duration: reduced ? 0 : 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
function WorkCalculator({ p }: { p: Parameters }) {
  const reduced = useReducedMotion() !== false;
  const [a, setA] = useState("600000000"),
    [b, setB] = useState("600000000"),
    [c, setC] = useState("0");
  const [factor, setFactor] = useState(p.decayPpb),
    [delta, setDelta] = useState("0"),
    [bits, setBits] = useState<64 | 128>(128);
  let work: ReturnType<typeof accountWork> | null = null,
    decay: ReturnType<typeof decayWeight> | null = null,
    error = "";
  try {
    work = accountWork([a, b, c], bits);
    decay = decayWeight(work.gn, factor, delta);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const command =
    work && decay
      ? `flop metering work --components ${a},${b},${c} --bits ${bits} --factor-ppb ${factor} --blocks ${delta}`
      : "flop metering --help";
  return (
    <section className={styles.section} aria-labelledby="work-heading">
      <ReadingReveal>
        <p className="eyebrow">01 / Declare reference work</p>
        <h2 id="work-heading">One floor. Exact units.</h2>
        <p className={styles.lead}>
          Add non-overlapping reference-work components from your chosen meter profile. These inputs are a declared
          workload, not a token-count measurement.
        </p>
      </ReadingReveal>
      <div className={styles.twoColumns}>
        <ReadingReveal>
          <div className={styles.panel}>
            <Input id="component-a" label="Reference-work component A (F_eff)" value={a} onChange={setA} />
            <Input id="component-b" label="Reference-work component B (F_eff)" value={b} onChange={setB} />
            <Input id="component-c" label="Reference-work component C (F_eff)" value={c} onChange={setC} />
            <p className="muted">
              For example: independently accounted prompt, generation and attention terms. Do not count a term twice.
            </p>
            <label className={styles.field} htmlFor="width">
              <span>Destination</span>
              <motion.select
                id="width"
                value={bits}
                onChange={(e) => setBits(e.target.value === "64" ? 64 : 128)}
                whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
                transition={{ duration: reduced ? 0 : 0.16 }}
              >
                <option value="128">Session work (u128)</option>
                <option value="64">Direct rail (u64)</option>
              </motion.select>
            </label>
            <Disclosure title="Why no tokens-to-G_n shortcut?">
              <p>
                R4.2 requires the versioned execution primitive. Bare 2·P·N is a sanity check only. The public paper
                does not expose the complete executable formula. This calculator begins with declared reference work.
                Cache reuse does not discount the v1 prompt term.
              </p>
            </Disclosure>
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={`${styles.panel} ${styles.result}`}>
            <p className="eyebrow">Declared accounting result / G_n</p>
            <motion.p
              data-work-result
              className={styles.total}
              key={work?.gn ?? "invalid"}
              initial={{ y: reduced ? 0 : 6 }}
              animate={{ y: 0 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
            >
              {work?.gn ?? "Invalid input"}
            </motion.p>
            <p className={styles.formula}>floor((A + B + C) / 1,000,000,000)</p>
            <p>
              {work
                ? `${work.fEff} declared F_eff. ${work.remainder} below the whole-unit boundary.`
                : "Enter valid whole unsigned integers."}
            </p>
            <hr />
            <h3>Reward decay scenario</h3>
            <p className="muted">Settled G_n stays unchanged. The quoted absent-key default has no decay.</p>
            <Input id="decay-factor" label="Reward factor (parts per billion)" value={factor} onChange={setFactor} />
            <Input id="period-blocks" label="Blocks since reward-period start" value={delta} onChange={setDelta} />
            <div className={styles.actions}>
              <MotionButton onClick={() => setFactor(p.decayPpb)}>Quoted default</MotionButton>
              <MotionButton
                onClick={() => {
                  setFactor("990000000");
                  setDelta("100");
                }}
              >
                99% factor scenario
              </MotionButton>
            </div>
            {work && decay && <Bar label="Reward-weighted G_n" value={decay.weightedGn} total={work.gn} />}
            <p data-work-error role="status" className={styles.status}>
              {error || `Exponent ${decay?.exponent ?? "unknown"}. Floored once after exponentiation.`}
            </p>
            <div className={styles.command}>
              <code>{command}</code>
              <CopyButton text={command} label="Copy work command" />
            </div>
          </div>
        </ReadingReveal>
      </div>
    </section>
  );
}
function LeaseCalculator({ p }: { p: Parameters }) {
  const reduced = useReducedMotion() !== false;
  const [accepted, setAccepted] = useState("1000"),
    [at, setAt] = useState("605800");
  let lease: ReturnType<typeof leasePhase> | null = null,
    error = "";
  try {
    lease = leasePhase(accepted, at, p);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const elapsed = lease && BigInt(at) > BigInt(accepted) ? (BigInt(at) - BigInt(accepted)).toString() : "0";
  return (
    <section className={styles.section} aria-labelledby="lease-heading">
      <ReadingReveal>
        <p className="eyebrow">02 / Place a declared lease on the chain</p>
        <h2 id="lease-heading">The expiry block is a hard boundary.</h2>
        <p className={styles.lead}>
          Enter the latest successful acceptance or renewal block. These are scenario inputs. The recorded explorer does
          not supply this anchor for a miner.
        </p>
      </ReadingReveal>
      <div className={styles.twoColumns}>
        <div className={styles.panel}>
          <Input
            id="accepted-block"
            label="Latest acceptance or renewal block (A)"
            value={accepted}
            onChange={setAccepted}
            invalid={Boolean(error)}
          />
          <Input id="at-block" label="Inspect at block (N)" value={at} onChange={setAt} invalid={Boolean(error)} />
          <p>
            Quoted lease: <strong>{p.lease} blocks</strong>. Reminder: one day remains at the paper's block timebase.
          </p>
          {lease && (
            <div className={styles.actions}>
              <MotionButton onClick={() => setAt(lease!.acceptedAt)}>At acceptance</MotionButton>
              <MotionButton onClick={() => setAt(lease!.renewalDue)}>Renewal due</MotionButton>
              <MotionButton onClick={() => setAt(lease!.expiresAt)}>Exact expiry</MotionButton>
              <MotionButton onClick={() => setAt(lease!.prunableAt)}>Prunable</MotionButton>
            </div>
          )}
          <p className="muted">
            Time eligibility assumes an accepted cap and unchanged host. Restart or reconnect requires renewal.
            Inventory or fingerprint changes require a new burst.
          </p>
        </div>
        <div className={`${styles.panel} ${styles.result}`}>
          <p className="eyebrow">Declared lifecycle state</p>
          <motion.h3
            data-lease-phase
            key={lease?.phase ?? "invalid"}
            initial={{ y: reduced ? 0 : 5 }}
            animate={{ y: 0 }}
            transition={{ duration: reduced ? 0 : 0.24 }}
          >
            {lease?.phase ?? "Invalid input"}
          </motion.h3>
          <p role="status" data-lease-status>
            {error ||
              (lease?.serviceEligibleByTime
                ? "Within the lease by time only. Runtime authorization is not verified."
                : "Outside the serving window. Renewal grace does not permit serving.")}
          </p>
          {lease && (
            <>
              <div className={styles.track} aria-hidden="true">
                <motion.div
                  data-lease-progress
                  initial={false}
                  animate={{ scaleX: ratio(elapsed, (BigInt(p.lease) * 2n).toString()) }}
                  transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
                />
              </div>
              <p className="muted">Elapsed blocks from acceptance to the pruning boundary.</p>
              <dl className={styles.windows}>
                {[
                  ["Acceptance", lease.acceptedAt],
                  ["Renewal due", lease.renewalDue],
                  ["Serving stops", lease.expiresAt],
                  ["Storage prunable", lease.prunableAt],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.command}>
                <code>
                  flop metering phase --accepted {accepted} --at {at}
                </code>
                <CopyButton text={`flop metering phase --accepted ${accepted} --at ${at}`} label="Copy phase command" />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
function MinerEvidence({ report }: { report: Report }) {
  const reduced = useReducedMotion() !== false;
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [shown, setShown] = useState(6),
    [selected, setSelected] = useState(report.miners[0]?.address ?? "");
  const rows = filterMiners(report.miners, filter, query),
    miner = rows.find((m) => m.address === selected) ?? rows[0];
  return (
    <section className={styles.section} aria-labelledby="miner-heading">
      <ReadingReveal>
        <p className="eyebrow">03 / Inspect the public boundary</p>
        <h2 id="miner-heading">A lifecycle with missing anchors.</h2>
        <p className={styles.lead}>
          Choose a recorded miner. Its timeline distinguishes returned fields from events the public response does not
          expose.
        </p>
      </ReadingReveal>
      <div className={styles.sources}>
        <p>Separately recorded indexer head: {report.head ?? "No data"}. This is not a same-head storage comparison.</p>
        {report.sources.map((s) => (
          <p key={s.source}>
            <MotionLink href={s.source}>Raw source ↗</MotionLink> · Recorded <time>{s.measuredAt}</time>
          </p>
        ))}
      </div>
      <div className={styles.toolbar}>
        <label htmlFor="miner-search">
          Search miner address
          <motion.input
            id="miner-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(6);
            }}
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          />
        </label>
        <div className={styles.actions}>
          {[
            ["all", "All rows"],
            ["present", "Has calibration"],
            ["missing", "No calibration"],
          ].map(([id, label]) => (
            <MotionButton
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id!);
                setShown(6);
              }}
            >
              {label}
            </MotionButton>
          ))}
        </div>
      </div>
      <p role="status">
        {rows.length} matching rows.{" "}
        {report.complete ? "Complete recorded miner page." : "Bounded or unavailable miner page."}
      </p>
      <div className={styles.evidenceGrid}>
        <div className={styles.minerList}>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.slice(0, shown).map((row) => (
              <motion.div
                key={row.address}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <MotionButton
                  className={styles.minerButton}
                  aria-pressed={miner?.address === row.address}
                  onClick={() => setSelected(row.address)}
                >
                  <span>{row.address}</span>
                  <small>
                    {row.gnMax === null ? "Calibration not returned" : `${row.gnMax} G_n/s · ${row.phase} (indexed)`}
                  </small>
                </MotionButton>
              </motion.div>
            ))}
          </AnimatePresence>
          {!rows.length && <p className={styles.empty}>No matching miner. Clear the search or change the filter.</p>}
          {rows.length > shown && <MotionButton onClick={() => setShown((n) => n + 6)}>Show more miners</MotionButton>}
        </div>
        <div className={styles.panel}>
          {miner ? (
            <>
              <p className="eyebrow">Selected miner / dated evidence</p>
              <p className={styles.address}>{miner.address}</p>
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={miner.address}
                  layout={!reduced}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.28 }}
                >
                  <ol className={styles.minerTimeline}>
                    <li>
                      <span className={styles.node} />
                      <h3>Benchmark burst</h3>
                      <p>
                        Issue blocks, verified jobs and acceptance block: <strong>not returned</strong>.
                      </p>
                    </li>
                    <li>
                      <span className={`${styles.node} ${miner.gnMax !== null ? styles.observedNode : ""}`} />
                      <h3>Indexed cap</h3>
                      <p data-indexed-phase>
                        {miner.phase ?? "No calibration returned"}
                        {miner.phase ? " (reported phase)" : ""}
                      </p>
                      <dl className={styles.windows}>
                        <div>
                          <dt>gnMax / G_n per second</dt>
                          <dd>{miner.gnMax ?? "No data"}</dd>
                        </div>
                        <div>
                          <dt>pledgeBaseline / G_n per day</dt>
                          <dd>{miner.pledgeBaseline ?? "No data"}</dd>
                        </div>
                        <div>
                          <dt>Daily conversion check</dt>
                          <dd>{miner.baselineCheck}</dd>
                        </div>
                        <div>
                          <dt>efficiencyCoeff / uninterpreted</dt>
                          <dd>{miner.efficiencyCoeff ?? "No data"}</dd>
                        </div>
                      </dl>
                    </li>
                    <li>
                      <span className={styles.node} />
                      <h3>Lease validity: unobservable</h3>
                      <p>
                        Latest acceptance, version and expiry are missing. An indexed Active label cannot place this
                        miner within a serving window.
                      </p>
                    </li>
                  </ol>
                  <Disclosure title="Inspect returned calibration fields">
                    <p className={styles.formula}>{miner.fields.join(", ") || "No calibration object."}</p>
                    <p>Registration and self-declared inventory blocks are not calibration acceptance blocks.</p>
                  </Disclosure>
                </motion.div>
              </AnimatePresence>
              <CopyButton text={miner.address} label="Copy miner address" />
            </>
          ) : (
            <p className={styles.empty}>No miner selected. No timeline can be inferred.</p>
          )}
        </div>
      </div>
      <aside className={styles.notice}>
        <h3>Network #76: {report.issue76.status}</h3>
        <p>{report.issue76.reason}</p>
        <p>
          The historical report found Active labels past cap expiry. This recording still lacks the current acceptance
          block needed to check that claim.
        </p>
        <MotionLink href={report.issue76.source}>Read the existing report ↗</MotionLink>
      </aside>
      <MotionLink href="/metering/recording" download="metering-recording.json" className="quiet-button">
        Download the raw recording
      </MotionLink>
    </section>
  );
}
function LifecycleGuide({ p }: { p: Parameters }) {
  const ref = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const steps = [
    [
      "Earn the initial cap",
      `At least ${p.minJobs} independently verified jobs over ${p.minBurst} blocks. Work must cover floor(C_emp × blocks × ${p.utilizationPpm} / 1000000). Credentials and stake remain separate gates.`,
    ],
    [
      "Apply the tier ceiling",
      `SOFT uses the empirical host cap. HARD takes the smaller of that cap and the attested inventory ceiling multiplied by ${p.discountPpm} ppm, floored. Never multiply the host cap by GPU count again.`,
    ],
    [
      "Freeze it for the lease",
      `An accepted cap remains frozen for ${p.lease} blocks. At exact expiry all serving consumers fail closed. The fixed three-phase Dyno has been removed from the current paper.`,
    ],
    [
      "Renew without increasing capacity",
      `Renewal needs ${p.renewalJobs} fresh one-shot jobs, a trigger no older than ${p.renewalAge} blocks and enough verified work. Neither empirical nor effective cap may increase. HARD ceilings can tighten it.`,
    ],
    [
      "Revalidate after changes",
      "Restart or chain reconnect requires renewal. Inventory or fingerprint changes invalidate the cap and require a new burst. Statistical drift detection remains open specification work.",
    ],
  ];
  return (
    <section className={styles.section} aria-labelledby="guide-heading">
      <p className="eyebrow">04 / Follow the pinned model</p>
      <h2 id="guide-heading">A burst, a lease, fresh work.</h2>
      <p className="muted">The line tracks reading progress. It does not track a miner's verification.</p>
      <div ref={ref} className={styles.guide}>
        <div className={styles.readingTrack} aria-hidden="true">
          <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        {steps.map(([title, text], i) => (
          <ReadingReveal key={title} order={i}>
            <article>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          </ReadingReveal>
        ))}
      </div>
    </section>
  );
}
export function MeteringBoard({
  report,
  parameters: p,
  rules,
}: {
  report: Report;
  parameters: Parameters;
  rules: Rule[];
}) {
  const calibrated = report.miners.filter((m) => m.gnMax !== null).length;
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.hero}>
        <ToolHeader slug="metering" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            Convert reference work. Follow a declared lease. See where public calibration evidence ends.
          </p>
        </ReadingReveal>
        <ReadingReveal order={4}>
          <p className={styles.notice}>
            The current paper uses renewable caps. The explorer's phase field does not include the blocks needed to
            verify a live lease.
          </p>
        </ReadingReveal>
      </header>
      <div className={styles.facts}>
        {[
          ["Recorded miners", report.miners.length],
          ["Calibration objects", calibrated],
          ["Confirmed live leases", undefined],
        ].map(([label, value], i) => (
          <ReadingReveal key={String(label)} order={i}>
            <article>
              <p>{label}</p>
              <strong>
                <ObservedNumber value={typeof value === "number" ? value : undefined} />
              </strong>
              <p className="muted">
                {i === 2
                  ? "Missing acceptance and expiry evidence."
                  : `Explorer recording: ${report.sources[0]?.measuredAt ?? "No timestamp"}`}
              </p>
            </article>
          </ReadingReveal>
        ))}
      </div>
      {report.errors.length > 0 && <p role="status">{report.errors.join("; ")}</p>}
      <WorkCalculator p={p} />
      <LeaseCalculator p={p} />
      <MinerEvidence report={report} />
      <LifecycleGuide p={p} />
      <section className={styles.section} aria-labelledby="source-heading">
        <h2 id="source-heading">Read the rules behind the model.</h2>
        <p>
          These are pinned specification defaults. They are not deployed storage reads. Dash typography in quotations is
          normalized.
        </p>
        {rules.map((rule, i) => (
          <Disclosure
            key={rule.source + i}
            title={
              [
                "Section 4: reference-work accounting",
                "Section 7: calibration and drift",
                "Parameter definitions: calibration and decay",
              ][i]!
            }
          >
            <p>
              <MotionLink href={rule.source}>Pinned source ↗</MotionLink> · Recorded <time>{rule.measuredAt}</time>
            </p>
            <pre className={styles.quote}>{rule.quote}</pre>
          </Disclosure>
        ))}
      </section>
      <section className={styles.limitations}>
        <h2>What this does not verify</h2>
        <p>
          Execution metering, physical operations, inference correctness, credentials, inventory, stake and runtime
          storage are not verified. Calculator inputs are declared scenarios. Recorded public fields do not prove
          finality or serving authorization.
        </p>
        <p>
          Reward decay defaults are quoted. Renewal work conservatively uses the currently accepted cap. Tightening
          operation order remains unspecified in the public text. Drift statistics and latency reward adjustments remain
          open work.
        </p>
        <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/metering">
          Read the library and CLI documentation ↗
        </MotionLink>
      </section>
    </div>
  );
}
