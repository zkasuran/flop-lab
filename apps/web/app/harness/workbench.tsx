// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  counts,
  excerpt,
  filterResults,
  reproduceCommand,
  statuses,
  utc,
  type ClaimResult,
  type Filter,
  type RunReport,
} from "./model";
import styles from "./workbench.module.css";

const build = process.env.NEXT_PUBLIC_BUILD_COMMIT;
const revision = build && /^[a-f0-9]{40}$/.test(build) ? build : "main";
const source = `https://github.com/zkasuran/flop-lab/tree/${revision}/packages/harness`;
const rawRun = `https://github.com/zkasuran/flop-lab/blob/${revision}/packages/harness/last-run.json`;
const MotionLink = motion.create(Link);
const runCommand = "pnpm --filter @flop-lab/harness start run --class read-only --max-requests 100 --max-flop 0";
const labels = {
  PASS: "Pass",
  FAIL: "Confirmed fail",
  UNVERIFIABLE: "Unverifiable",
  SKIPPED: "Skipped",
  FLAKY: "Flaky",
};

function Control({
  children,
  onClick,
  pressed,
  label,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  label?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={`${styles.control} ${className}`}
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      whileHover={reduced ? {} : { y: -1 }}
      whileTap={reduced ? {} : { scale: 0.98 }}
      whileFocus={{ borderColor: "var(--accent)" }}
      transition={{ duration: reduced ? 0 : 0.12 }}
    >
      {children}
    </motion.button>
  );
}

function Copy({ text, label = "Copy command" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <span className={styles.copy}>
      <Control
        label={label}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => setStatus("Copied"),
            () => setStatus("Select command text to copy"),
          );
        }}
      >
        {status === "Copied" ? "Copied ✓" : "Copy ↗"}
      </Control>
      <span className={styles.srOnly} role="status">
        {status}
      </span>
    </span>
  );
}

function Badge({ result }: { result: Pick<ClaimResult, "status" | "flaky"> }) {
  return (
    <span className={styles.badge} data-status={result.status}>
      <span aria-hidden="true">
        {result.status === "PASS" ? "✓" : result.status === "FAIL" ? "×" : result.status === "SKIPPED" ? "·" : "?"}
      </span>
      {result.flaky ? "FLAKY" : result.status}
    </span>
  );
}

function Timeline({ report }: { report: RunReport }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 35%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const peak = Math.max(0, ...report.evidence.map((item) => item.durationMs));
  const failed = report.results.find((result) => result.status === "FAIL");
  return (
    <section className={styles.timeline} ref={ref} aria-labelledby="timeline-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className="eyebrow">02 / The recorded run</p>
          <h2 id="timeline-title">From request to evidence.</h2>
        </div>
        <p className="muted">Reading progress follows this section. The bars below show recorded request durations.</p>
      </div>
      <div className={styles.timelineLine} aria-hidden="true">
        <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
      </div>
      <ol className={styles.events}>
        <li>
          <span className="eyebrow">Started</span>
          <strong>{report.budget.maxRequests} request ceiling</strong>
          <time dateTime={report.measuredAt}>{utc(report.measuredAt)}</time>
        </li>
        <li>
          <span className="eyebrow">Observation</span>
          <strong>{report.evidence.length} recorded requests</strong>
          <span>Responses retain their source and timestamp.</span>
        </li>
        <li>
          <span className="eyebrow">Confirmation</span>
          <strong>{failed ? "Failures re-run once" : "No confirmed failures"}</strong>
          <span>
            {failed ? `${failed.claim.id}: ${failed.attempts.length} attempts` : "See each claim for its outcome."}
          </span>
        </li>
        <li>
          <span className="eyebrow">Finished</span>
          <strong>{report.durationMs.toLocaleString("en-US")} ms elapsed</strong>
          <time dateTime={report.finishedAt}>{utc(report.finishedAt)}</time>
        </li>
      </ol>
      <div
        className={styles.requestTape}
        role="img"
        aria-label={`Recorded request durations in order. Maximum ${peak} milliseconds. Each bar is one request.`}
      >
        {report.evidence.map((item, index) => (
          <motion.div
            key={item.id}
            className={styles.requestBar}
            style={{ height: `${Math.max(2, (item.durationMs / Math.max(1, peak)) * 100)}%` }}
            initial={false}
            whileInView={{ scaleY: [reduced ? 1 : 0, 1] }}
            viewport={{ once: true }}
            transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : Math.min(index * 0.004, 0.2) }}
            title={`Request ${item.id}: ${item.durationMs} ms; HTTP ${item.status ?? "unavailable"}`}
          />
        ))}
      </div>
      <div className={styles.tapeLegend}>
        <span>First request → last request</span>
        <span>
          {report.evidence.length
            ? `Relative duration / peak ${peak.toLocaleString("en-US")} ms`
            : "No request durations recorded"}
        </span>
      </div>
    </section>
  );
}

function Detail({ result, report, onClose }: { result: ClaimResult; report: RunReport; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const evidenceIds = new Set(result.attempts.flatMap((attempt) => attempt.evidence));
  const evidence = report.evidence.filter((item) => evidenceIds.has(item.id));
  return (
    <motion.dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby="claim-title"
      initial={{ opacity: 1, x: reduced ? 0 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 24 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.drawerInner}>
        <div className={styles.drawerTop}>
          <Badge result={result} />
          <Control onClick={onClose} label="Close claim details">
            Close ×
          </Control>
        </div>
        <p className="eyebrow">
          {result.claim.kind} / {result.claim.risk}
        </p>
        <h2 id="claim-title">{result.claim.title}</h2>
        <code className="muted">{result.claim.id}</code>
        <p className={styles.reason}>{result.reason}</p>
        <div className={styles.diff} aria-label="Expected versus observed">
          <section>
            <h3>− Expected from the claim</h3>
            <p>{result.claim.expected}</p>
          </section>
          <section>
            <h3>+ Observed by the runner</h3>
            {result.attempts.length ? (
              result.attempts.map((attempt, index) => (
                <div className={styles.attempt} key={index}>
                  <p className="eyebrow">
                    Attempt {index + 1} / {attempt.status} / {attempt.durationMs} ms
                  </p>
                  <time dateTime={attempt.measuredAt}>{utc(attempt.measuredAt)}</time>
                  <pre>{excerpt(attempt.observed)}</pre>
                </div>
              ))
            ) : (
              <p>No attempt was made. {result.reason}</p>
            )}
          </section>
        </div>
        <p className="muted">
          This is a semantic comparison of a predicate with its observation. Excerpts marked truncated are incomplete.
        </p>
        <section className={styles.detailSection}>
          <h3>Claim source</h3>
          <blockquote>{result.claim.source.quote}</blockquote>
          <a href={result.claim.source.url}>Open the quoted source ↗</a>
          <p className="muted">Recorded {utc(result.claim.source.measuredAt)}</p>
          {result.claim.source.path && <code>{result.claim.source.path}</code>}
        </section>
        <section className={styles.detailSection}>
          <h3>Reproduce after checkout</h3>
          <div className={styles.command}>
            <code>{reproduceCommand(result.claim.id)}</code>
            <Copy text={reproduceCommand(result.claim.id)} />
          </div>
          <p className="muted">
            Runs against the current devnet. Results can differ from this recording. Spend scenarios remain gated.
          </p>
        </section>
        <section className={styles.detailSection}>
          <h3>Request evidence</h3>
          {evidence.length ? (
            evidence.map((item) => (
              <details key={item.id} className={styles.evidence}>
                <summary>
                  Request {item.id} / HTTP {item.status ?? "unavailable"} / {item.durationMs} ms
                </summary>
                <time dateTime={item.measuredAt}>{utc(item.measuredAt)}</time>
                <pre>{excerpt(item.request)}</pre>
                <pre>{item.response}</pre>
                {item.responseTruncated && <p className="muted">Response excerpt is truncated.</p>}
                {item.rawFixture && /^fixtures\/run-\d+\.json$/.test(item.rawFixture) && (
                  <a href={`${source}/${item.rawFixture}`}>Raw recorded request and response ↗</a>
                )}
              </details>
            ))
          ) : (
            <p className="muted">No network request is attached to this result.</p>
          )}
        </section>
      </div>
    </motion.dialog>
  );
}

export function HarnessWorkbench({ report }: { report: RunReport | null }) {
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [selected, setSelected] = useState<ClaimResult | null>(null);
  const matrix = useRef<HTMLElement>(null);
  const results = report?.results ?? [];
  const total = counts(results);
  const filtered = filterResults(results, filter, kind, query);
  const selectFilter = (next: Filter) => {
    setFilter(next);
    setVisibleCount(12);
  };
  const enter = (order: number) => ({
    initial: { opacity: 1, y: 0 },
    whileInView: { opacity: 1, y: reduced ? 0 : [10, 0] },
    viewport: { once: true },
    transition: { duration: reduced ? 0 : 0.3, delay: reduced ? 0 : order * 0.055 },
  });
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={styles.workbench}
        initial={false}
        animate={{ x: reduced ? 0 : [8, 0] }}
        transition={{ duration: reduced ? 0 : 0.2 }}
      >
        <MotionLink
          className={styles.back}
          href="/#tools"
          whileHover={reduced ? {} : { x: -3 }}
          whileTap={reduced ? {} : { scale: 0.98 }}
        >
          ← All tools
        </MotionLink>
        <header className={styles.hero}>
          <div>
            <motion.p className="eyebrow" {...enter(0)}>
              Devnet workbench / Conformance harness
            </motion.p>
            <motion.h1 {...enter(1)}>
              Claims meet
              <br />
              <span>observations.</span>
            </motion.h1>
            <motion.p className={styles.intro} {...enter(2)}>
              Inspect repeatable protocol checks. Trace a result to its source. Copy the command and test it yourself.
            </motion.p>
            <motion.div className={styles.heroActions} {...enter(3)}>
              <Control
                className={styles.primary}
                onClick={() => matrix.current?.scrollIntoView({ behavior: "instant", block: "start" })}
              >
                Inspect the claims ↓
              </Control>
              <a href={`${source}#readme`}>Runner guide ↗</a>
            </motion.div>
          </div>
          <motion.aside className={styles.runCard} {...enter(4)} aria-label="Recorded run summary">
            <div className={styles.cardTop}>
              <span className="eyebrow">Last-known run</span>
              <span className={styles.recorded}>Recorded / not live</span>
            </div>
            {report ? (
              <>
                <div className={styles.runNumber}>
                  <motion.strong
                    initial={false}
                    animate={{ scale: reduced ? 1 : [0.94, 1] }}
                    transition={{ duration: reduced ? 0 : 0.4 }}
                  >
                    {results.length}
                  </motion.strong>
                  <span>
                    claims in the catalogue
                    <br />
                    {report.budget.requests} requests made
                  </span>
                </div>
                <div className={styles.statusTrack} aria-hidden="true">
                  {statuses.map((status) => (
                    <motion.span
                      key={status}
                      data-status={status}
                      style={{ flex: total[status] }}
                      initial={false}
                      animate={{ scaleX: reduced ? 1 : [0, 1] }}
                      transition={{ duration: reduced ? 0 : 0.45 }}
                    />
                  ))}
                </div>
                <div className={styles.cardLegend}>
                  {statuses.map((status) => (
                    <span key={status}>
                      <i data-status={status} />
                      {total[status]} {labels[status].toLowerCase()}
                    </span>
                  ))}
                </div>
                <time dateTime={report.measuredAt}>{utc(report.measuredAt)}</time>
                <a href={rawRun}>Inspect the committed recording ↗</a>
              </>
            ) : (
              <p>No validated run is available. Generate a recording with the runner before interpreting any claim.</p>
            )}
          </motion.aside>
        </header>

        {report && (
          <section className={styles.provenance} aria-label="Run provenance">
            <div>
              <span className="eyebrow">Network label</span>
              <strong>{report.network.name ?? "Unavailable"}</strong>
            </div>
            <div>
              <span className="eyebrow">Genesis hash</span>
              <strong>{report.network.genesisHash ?? "Unavailable"}</strong>
            </div>
            <div>
              <span className="eyebrow">Spec version</span>
              <strong>{report.network.specVersion ?? "Unavailable"}</strong>
            </div>
            <div>
              <span className="eyebrow">Reported spend</span>
              <strong>{report.budget.spentFlop} FLOP</strong>
            </div>
            <p>
              {report.network.reason} Read from{" "}
              {report.source.map((url, index) => (
                <span key={url}>
                  {index > 0 && " and "}
                  <a href={url}>{new URL(url).hostname}</a>
                </span>
              ))}
              .
            </p>
          </section>
        )}

        <section className={styles.matrix} ref={matrix} aria-labelledby="matrix-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">01 / Claim catalogue</p>
              <h2 id="matrix-title">Every result has a reason.</h2>
            </div>
            <p className="muted">
              A pass checks the named predicate. An unavailable check establishes nothing. Select a claim to compare its
              evidence.
            </p>
          </div>
          <div className={styles.filters} role="group" aria-label="Filter by result">
            <Control pressed={filter === "ALL"} onClick={() => selectFilter("ALL")}>
              All <span>{results.length}</span>
            </Control>
            {statuses.map((status) => (
              <Control key={status} pressed={filter === status} onClick={() => selectFilter(status)}>
                {labels[status]} <span>{total[status]}</span>
              </Control>
            ))}
            {total.FLAKY > 0 && (
              <Control pressed={filter === "FLAKY"} onClick={() => selectFilter("FLAKY")}>
                Flaky <span>{total.FLAKY}</span>
              </Control>
            )}
          </div>
          <div className={styles.searchRow}>
            <label>
              Search claims
              <motion.input
                type="search"
                placeholder="ID, expected value or reason"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(12);
                }}
                whileFocus={{ borderColor: "var(--accent)" }}
              />
            </label>
            <label>
              Boundary
              <motion.select
                aria-label="Boundary"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setVisibleCount(12);
                }}
                whileFocus={{ borderColor: "var(--accent)" }}
              >
                <option value="all">All boundaries</option>
                {["http", "mcp", "graphql", "chain", "sdk"].map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </motion.select>
            </label>
            <p className="muted" role="status">
              {filtered.length} of {results.length} claims
            </p>
          </div>
          <div className={styles.matrixHeader} aria-hidden="true">
            <span>Claim / boundary</span>
            <span>Last result</span>
            <span>Evidence</span>
          </div>
          <motion.ul className={styles.rows} layout={reduced ? false : "position"}>
            <AnimatePresence initial={false} mode="popLayout">
              {filtered.slice(0, visibleCount).map((result) => (
                <motion.li
                  key={result.claim.id}
                  className={styles.row}
                  layout={reduced ? false : "position"}
                  initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: reduced ? 1 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                >
                  <motion.button
                    className={styles.claimButton}
                    onClick={() => setSelected(result)}
                    aria-haspopup="dialog"
                    whileHover={{ backgroundColor: "var(--surface-raised)" }}
                    whileTap={reduced ? {} : { scale: 0.995 }}
                  >
                    <span>
                      <strong>{result.claim.title}</strong>
                      <code>
                        {result.claim.id} <span>/ {result.claim.kind}</span>
                      </code>
                    </span>
                    <Badge result={result} />
                    <span className={styles.rowReason}>
                      {result.reason}
                      <span aria-hidden="true"> ↗</span>
                    </span>
                  </motion.button>
                  <Copy text={reproduceCommand(result.claim.id)} label={`Copy command for ${result.claim.id}`} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {!filtered.length && (
            <div className={styles.empty}>
              <h3>{report ? "No claims match." : "No run yet."}</h3>
              <p className="muted">
                {report
                  ? "Try a different result, boundary or search."
                  : "The site only displays validated runner output."}
              </p>
              {report && (
                <Control
                  onClick={() => {
                    selectFilter("ALL");
                    setKind("all");
                    setQuery("");
                  }}
                >
                  Clear filters
                </Control>
              )}
            </div>
          )}
          {filtered.length > visibleCount && (
            <div className={styles.loadMore}>
              <Control onClick={() => setVisibleCount((value) => value + 12)}>Show more claims ↓</Control>
              <span className="muted">
                Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
              </span>
            </div>
          )}
        </section>

        {report && <Timeline report={report} />}
        <section className={styles.reproduce} aria-labelledby="reproduce-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">03 / Reproduce it</p>
              <h2 id="reproduce-title">Bring your own observation.</h2>
            </div>
            <p className="muted">
              From a checkout with Node 22 and pnpm installed. These commands read public devnet surfaces.
            </p>
          </div>
          <div className={styles.command}>
            <code>git clone https://github.com/zkasuran/flop-lab.git</code>
            <Copy text="git clone https://github.com/zkasuran/flop-lab.git" label="Copy clone command" />
          </div>
          <div className={styles.command}>
            <code>cd flop-lab &amp;&amp; pnpm install --frozen-lockfile</code>
            <Copy text="cd flop-lab && pnpm install --frozen-lockfile" label="Copy install command" />
          </div>
          <div className={styles.command}>
            <code>{runCommand}</code>
            <Copy text={runCommand} label="Copy full run command" />
          </div>
          <p className="muted">
            The CLI writes JSON and Markdown. The page reads the committed package recording. To refresh it, run{" "}
            <code>pnpm --filter @flop-lab/harness record</code> and review the recorded files before committing.
          </p>
        </section>
        <section className={styles.limits} aria-labelledby="limits-title">
          <h2 id="limits-title">What this does not verify</h2>
          <p>
            No consensus finality, miner inference or cryptographic proof is established here. Missing genesis and
            runtime identifiers are left unavailable. Spend scenarios need prerequisites and are not executed by this
            page.
          </p>
          <p>
            Separate public API reads are not an atomic snapshot. The devnet can reset. Schema agreement is not proof of
            service correctness. See the <a href={`${source}#what-this-does-not-verify`}>runner limits</a>.
          </p>
        </section>
        <AnimatePresence>
          {selected && report && (
            <Detail key={selected.claim.id} result={selected} report={report} onClose={() => setSelected(null)} />
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}
