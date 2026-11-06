// SPDX-License-Identifier: Apache-2.0
"use client";
import { ToolHeader } from "@/components/tool-header";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { formatFlop, SDK_CHAIN_SOURCE, WINDOW_MS } from "../../../../packages/challenger/src/core";
import type { Dossier } from "../../../../packages/challenger/src/types";
import { dossierMarkdown, replayDossier } from "../../../../packages/challenger/src/export";
import { WINDOW_PARAMETER, type WindowReport } from "../../../../packages/challenger/src/windows";
import { PAGE_SIZE, selectRows, type Filter, type PageData, type PageRow } from "./data";
import styles from "./challenger.module.css";

const command = "node packages/challenger/dist/cli.js windows --recorded";
const reportUrl = "https://github.com/zkasuran/flop-lab/blob/main/packages/challenger/FEASIBILITY.md";
const sdk = "https://unpkg.com/@flop-labs/sdk@0.4.0/dist/compute-channel/";
const states: Record<PageRow["window"]["status"], string> = {
  "estimated-open": "Estimated open",
  "estimated-expired": "Estimated expired",
  unknown: "Start unverified",
  "no-standard-window": "No standard window",
};
const utc = (time: string | number) =>
  new Date(time)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

/** A dated observation workbench. Example: <Challenger data={pageData(snapshot)} selected={null} dossier={null} dossierError={null} />. */
export function Challenger({
  data,
  selected,
  dossier,
  dossierError,
}: {
  data: PageData;
  selected: string | null;
  dossier: Dossier | null;
  dossierError: string | null;
}) {
  const reduced = useReducedMotion() !== false;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"urgency" | "priority" | "recent">("urgency");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(selected !== null);
  const [requested, setRequested] = useState(selected);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const counts = {
    open: data.windows?.rows.filter((row) => row.status === "open" || row.status === "closing").length ?? null,
    cooperative: data.rows.filter((row) => row.window.status === "no-standard-window").length,
    unknown: data.rows.filter((row) => row.window.status === "unknown").length,
  };
  const rows = selectRows(data.rows, filter, sort);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const visible = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) {
      dialog.current.close();
      const target = opener.current?.isConnected
        ? opener.current
        : document.querySelector<HTMLButtonElement>("button[data-channel]");
      target?.focus({ preventScroll: true });
    }
  }, [open]);
  const close = () => {
    setOpen(false);
    startTransition(() => router.replace("/challenger", { scroll: false }));
  };
  const inspect = (id: string) => {
    opener.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setRequested(id);
    setOpen(true);
    startTransition(() => router.replace(`/challenger?channel=${encodeURIComponent(id)}`, { scroll: false }));
  };
  const currentDossier = dossier?.channelId === requested ? dossier : null;
  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <MotionLink href="/#tools">Tools</MotionLink>
        <span>/</span>
        <span>Challenge watcher</span>
        <span className="badge alpha">alpha</span>
      </div>
      <section className={styles.hero} aria-labelledby="watcher-title">
        <div>
          <ReadingReveal>
            <ToolHeader slug="challenger" titleId="watcher-title" />
          </ReadingReveal>
          <ReadingReveal order={1}>
            <p className={styles.lead}>
              Find settlements worth a human look. Inspect their public evidence and prepare a dry-run dossier.
            </p>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <div className={styles.heroActions}>
              <MotionLink className="button primary" href="#windows">
                See closing windows <span aria-hidden="true">↓</span>
              </MotionLink>
              <MotionLink className="button" href="#feasibility">
                Can I re-check it?
              </MotionLink>
            </div>
            <p className={styles.small}>No dispute is submitted. A review score is not a fraud verdict.</p>
          </ReadingReveal>
        </div>
        <ReadingReveal order={3}>
          <aside className={styles.clock} aria-label="Observed challenge lanes">
            <div className={styles.clockTop}>
              <span className="eyebrow">Window watch</span>
              <span className={styles.dotLabel}>
                {data.windowState === "live" ? "Live window capture" : "Last-known window capture"}
              </span>
            </div>
            <div className={styles.clockNumber}>
              {counts.open === null ? <strong>?</strong> : <ObservedNumber value={counts.open} />}
              <span>
                observed open
                <br />
                forced claims
              </span>
            </div>
            <p className={styles.clockNote}>
              {counts.open
                ? "Indexed end blocks compared with the captured finalized head. Time estimates use measured cadence."
                : "No open forced claims established in the window capture. A payout is not a new challenge start."}
            </p>
            <div className={styles.lane}>
              <span>Cooperative payouts</span>
              <strong>{counts.cooperative}</strong>
            </div>
            <ObservedBar
              fraction={data.rows.length ? counts.cooperative / data.rows.length : 0}
              label="Cooperative share of observed rows"
            />
            <div className={styles.lane}>
              <span>Start unverified</span>
              <strong>{counts.unknown}</strong>
            </div>
            <ObservedBar
              fraction={data.rows.length ? counts.unknown / data.rows.length : 0}
              label="Unverified start share of observed rows"
            />
            <p className={styles.small}>
              Counts use separately dated captures. Runtime eligibility and finality are not verified.
            </p>
          </aside>
        </ReadingReveal>
      </section>

      <section className={styles.provenance} aria-label="Observation provenance">
        <div>
          <span className={styles.label}>Captured</span>
          <time dateTime={data.measuredAt}>{utc(data.measuredAt)}</time>
        </div>
        <div>
          <span className={styles.label}>Coverage</span>
          <strong>
            {data.rows.length} / {data.coverage.reportedTotal} rows
          </strong>
          <span>{data.coverage.complete ? "Complete reported tape" : "Partial tape"}</span>
        </div>
        <div>
          <span className={styles.label}>Public source</span>
          <MotionLink href={data.source}>Hosted FLOP MCP ↗</MotionLink>
          <span>{data.state === "last-known" ? "Retained evidence" : "Cached for 60 seconds"}</span>
        </div>
        <MotionButton
          className="quiet-button"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {pending ? "Reading…" : "Refresh observation"}
        </MotionButton>
      </section>
      {data.error && (
        <p className={styles.notice} role="status">
          {data.error} Last attempt: {utc(data.attemptedAt)}.
        </p>
      )}
      {data.coverage.notes.map((note) => (
        <p className={styles.notice} key={note}>
          {note}
        </p>
      ))}

      <WindowTimeline report={data.windows} state={data.windowState} inspect={inspect} />

      <section id="settlements" className={styles.tape} aria-labelledby="tape-title">
        <ReadingReveal>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">01 / Settlement tape</p>
              <h2 id="tape-title">A clock needs a start.</h2>
            </div>
            <p>
              Cooperative settlements pay immediately. Their payout timestamps do not start a challenge window. Forced
              claims appear in the block timeline above.
            </p>
          </div>
        </ReadingReveal>
        <SettlementTimeline rows={data.rows} />
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Filter settlement lanes">
            {(
              [
                ["all", "All observations"],
                ["no-standard-window", "Cooperative"],
                ["unknown", "Start unverified"],
              ] as const
            ).map(([value, label]) => (
              <MotionButton
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setPage(0);
                }}
                className={styles.filter}
              >
                {filter === value && (
                  <motion.span
                    className={styles.filterActive}
                    layoutId="challenger-filter"
                    transition={{ duration: reduced ? 0 : 0.2 }}
                  />
                )}
                <span>{label}</span>
              </MotionButton>
            ))}
          </div>
          <div className={styles.sort} aria-label="Sort observations">
            <span>Sort</span>
            {(["urgency", "priority", "recent"] as const).map((value) => (
              <MotionButton
                className="quiet-button"
                key={value}
                aria-pressed={sort === value}
                onClick={() => {
                  setSort(value);
                  setPage(0);
                }}
              >
                {value}
              </MotionButton>
            ))}
          </div>
        </div>
        <p className={styles.small} aria-live="polite">
          {rows.length} matching observations. Scores describe attention priority out of 100. Missing signals add no
          points.
        </p>
        <div className={styles.rowHeader} aria-hidden="true">
          <span>Payout / channel</span>
          <span>Challenge lane</span>
          <span>Review priority</span>
          <span>Evidence</span>
        </div>
        <motion.ol className={styles.rows} layout={!reduced} transition={{ duration: reduced ? 0 : 0.25 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((row) => (
              <motion.li
                className={styles.row}
                key={row.id}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.25 }}
              >
                <div className={styles.rowTime}>
                  <time dateTime={new Date(row.settledAt).toISOString()}>{utc(row.settledAt)}</time>
                  <code>{short(row.id)}</code>
                  <span>{formatFlop(row.paid)} FLOP paid</span>
                </div>
                <div>
                  <span className={row.window.status === "estimated-open" ? styles.openLane : styles.status}>
                    {states[row.window.status]}
                  </span>
                  {row.window.estimatedExpiry ? (
                    <>
                      <span className={styles.small}>Estimated expiry {utc(row.window.estimatedExpiry)}</span>
                      <ObservedBar
                        fraction={1 - (row.window.remainingMs ?? 0) / WINDOW_MS}
                        label="Elapsed share of assumed window"
                      />
                    </>
                  ) : (
                    <span className={styles.small}>
                      {row.window.status === "no-standard-window"
                        ? "Immediate cooperative payout"
                        : "No runtime deadline observed"}
                    </span>
                  )}
                </div>
                <div className={styles.priority}>
                  <strong>
                    {row.score.toFixed(2)}
                    <span> / 100</span>
                  </strong>
                  <ObservedBar fraction={row.score / 100} label={`Review priority ${row.score} out of 100`} />
                  <span>
                    {row.signals}/{row.totalSignals} signals available
                  </span>
                </div>
                <MotionButton
                  className={styles.inspect}
                  data-channel={row.id}
                  onClick={() => inspect(row.id)}
                  aria-label={`Inspect dossier for ${row.id}`}
                >
                  Inspect <span aria-hidden="true">↗</span>
                </MotionButton>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ol>
        {!visible.length && (
          <div className={styles.empty} role="status">
            <span aria-hidden="true">○</span>
            <h3>{!data.rows.length ? "No settlements returned." : "No observations in this lane."}</h3>
            <p>
              {filter === "estimated-open"
                ? "No explicit posting event supports an open-window estimate in this tape. Cooperative payouts do not start a standard window."
                : "The captured tape contains no matching rows. Change the filter or refresh after the cache expires."}
            </p>
          </div>
        )}
        {rows.length > PAGE_SIZE && (
          <div className={styles.pager}>
            <span>
              Showing {safePage * PAGE_SIZE + 1} to {Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <div>
              <MotionButton className="quiet-button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Previous
              </MotionButton>
              <MotionButton
                className="quiet-button"
                disabled={(safePage + 1) * PAGE_SIZE >= rows.length}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </MotionButton>
            </div>
          </div>
        )}
        <Disclosure title="Window assumptions, score formula and measurement details">
          <div className={styles.assumptions}>
            {data.assumptions.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <p>Evaluated at {utc(data.evaluatedAt)}. No client-side countdown is presented as a runtime deadline.</p>
            <p>
              {data.blockCadence
                ? `Observed block cadence: ${data.blockCadence.milliseconds} ms across ${data.blockCadence.intervals} block intervals.`
                : "Block cadence: no usable sample."}{" "}
              The measured cadence does not set the window.
            </p>
            {data.blockCadence?.samples.map((sample) => (
              <p key={sample.value.number}>
                Block {sample.value.number}: {utc(sample.value.timestamp)}. Captured {utc(sample.measuredAt)} from{" "}
                <MotionLink href={sample.source}>flop_get_block</MotionLink>.
              </p>
            ))}
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>
              Tape collection used {data.requests} HTTP attempts{" "}
              {data.state === "last-known" ? "when the retained observation was captured" : "for this snapshot"}. Cached
              reads add no upstream calls.
            </p>
            <MotionLink href="https://github.com/zkasuran/flop-lab/blob/main/packages/challenger/README.md#review-formula">
              Read the policy weights and exact formulas ↗
            </MotionLink>
          </div>
        </Disclosure>
      </section>

      <Feasibility />
      <section className={styles.run} aria-labelledby="run-title">
        <ReadingReveal>
          <p className="eyebrow">03 / Keep the evidence</p>
          <h2 id="run-title">Take the review with you.</h2>
          <p>
            Run from a clone of flop-lab after <code>pnpm install</code> and{" "}
            <code>pnpm --filter @flop-lab/challenger build</code>.
          </p>
          <div className={styles.command}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy command" />
          </div>
          <p className={styles.small}>
            The command replays dated public responses. Remove <code>--recorded</code> for a live observation. Dossiers
            stay dry-run only.
          </p>
          <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/challenger">
            Package, CLI and recorded fixtures ↗
          </MotionLink>
        </ReadingReveal>
      </section>

      <dialog
        className={styles.dialog}
        ref={dialog}
        aria-labelledby="dossier-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className={styles.dialogHead}>
          <div>
            <p className="eyebrow">Human review / dry run only</p>
            <h2 id="dossier-title">Settlement dossier</h2>
          </div>
          <MotionButton className="quiet-button" onClick={close}>
            Close
          </MotionButton>
        </div>
        <div className={styles.dialogBody} aria-busy={pending}>
          {pending || (!currentDossier && !dossierError) ? (
            <p role="status">Reading public evidence for {requested ? short(requested) : "the channel"}…</p>
          ) : dossierError ? (
            <p role="alert">{dossierError}</p>
          ) : (
            currentDossier && <DossierView dossier={currentDossier} />
          )}
        </div>
      </dialog>
    </div>
  );
}

function ObservedBar({ fraction, label }: { fraction: number; label: string }) {
  const reduced = useReducedMotion() !== false;
  return (
    <div className={styles.bar} role="img" aria-label={label}>
      <motion.span
        initial={{ scaleX: reduced ? fraction : 0 }}
        whileInView={{ scaleX: fraction }}
        viewport={{ once: true }}
        transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
      />
    </div>
  );
}

function WindowTimeline({
  report,
  state,
  inspect,
}: {
  report: WindowReport | null;
  state: "live" | "last-known";
  inspect: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const [filter, setFilter] = useState<"all" | "open" | "closing" | "closed" | "unknown">("all");
  const rows = report?.rows.filter((row) => filter === "all" || row.status === filter) ?? [];
  return (
    <section ref={ref} className={styles.tape} aria-labelledby="windows-title" id="windows">
      <ReadingReveal>
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Forced claims / closing order</p>
            <h2 id="windows-title">Which window closes next?</h2>
          </div>
          <p>
            These claims have no recorded payout yet. End blocks come from the indexer. A closed window does not
            establish payment or a fraud verdict.
          </p>
        </div>
        <p className={styles.small}>
          {state === "last-known" ? "Last-known window capture" : "Live window capture"}:{" "}
          {report ? utc(report.capturedAt) : "unavailable"}. Reported finalized head:{" "}
          {report?.head?.number ?? "unknown"}. {report?.rows.length ?? 0} / {report?.total ?? "unknown"} forced claims.{" "}
          {report?.complete ? "All reported claims retrieved." : "Partial or unavailable coverage."}
        </p>
        <p className={styles.small}>
          Block time:{" "}
          {report?.cadence
            ? `${report.cadence.milliseconds} ms measured across ${report.cadence.intervals} intervals (${report.cadence.firstBlock} to ${report.cadence.lastBlock})`
            : "unavailable"}
          . These are dated observations, not a running countdown.
        </p>
      </ReadingReveal>
      <div className={styles.filters} aria-label="Filter challenge windows">
        {(["all", "open", "closing", "closed", "unknown"] as const).map((value) => (
          <MotionButton
            key={value}
            aria-pressed={filter === value}
            className={styles.filter}
            onClick={() => setFilter(value)}
          >
            {filter === value && (
              <motion.span
                className={styles.filterActive}
                layoutId="window-filter"
                transition={{ duration: reduced ? 0 : 0.2 }}
              />
            )}
            <span>{value === "all" ? "All windows" : value}</span>
          </MotionButton>
        ))}
      </div>
      <p className={styles.small} aria-live="polite">
        {rows.length} matching windows. Closing means the final 7200 blocks under this tool's attention policy.
      </p>
      <div className={styles.windowBody}>
        <div className={styles.readingTrack} aria-hidden="true">
          <motion.div data-window-progress style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        <motion.ol className={styles.windowRows} layout={!reduced} transition={{ duration: reduced ? 0 : 0.25 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) => (
              <motion.li
                data-window={row.channelId}
                key={row.channelId}
                className={styles.windowRow}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.24 }}
              >
                <div>
                  <span className={row.status === "open" || row.status === "closing" ? styles.openLane : styles.status}>
                    {row.status}
                  </span>
                  <h3>Block {row.endBlock ?? "unknown"}</h3>
                  <code>{short(row.channelId)}</code>
                  <p>{formatFlop(row.escrow)} FLOP escrow, not payout</p>
                </div>
                <div>
                  <strong>{row.remainingBlocks ?? "Unknown"} blocks remaining</strong>
                  <p>
                    {row.estimatedRemainingMs === null
                      ? "Time estimate unavailable"
                      : `Estimated ${(row.estimatedRemainingMs / 3_600_000).toFixed(2)} hours remaining`}
                  </p>
                  <p>
                    {row.estimatedExpiry ? `Estimated end ${utc(row.estimatedExpiry)}` : "No future end time inferred"}
                  </p>
                  {row.remainingBlocks !== null && (
                    <ObservedBar
                      fraction={Math.min(1, row.remainingBlocks / WINDOW_PARAMETER.blocks)}
                      label={`Remaining ${row.remainingBlocks} blocks divided by the documented ${WINDOW_PARAMETER.blocks}-block window`}
                    />
                  )}
                  <span className={styles.small}>Captured {utc(row.measuredAt)}</span>
                </div>
                <MotionButton
                  data-channel={row.channelId}
                  className={styles.inspect}
                  onClick={() => inspect(row.channelId)}
                  aria-label={`Inspect forced claim ${row.channelId}`}
                >
                  Inspect claim ↗
                </MotionButton>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ol>
      </div>
      {!rows.length && <p className={styles.empty}>No matching window observations. No deadline is invented.</p>}
      <p className={styles.small}>
        The line tracks reading progress. Bars show remaining blocks divided by the documented window. At equality this
        tool conservatively marks closed; runtime endpoint inclusion remains unverified.
      </p>
      <Disclosure title="Exact parameter, head and window evidence">
        <p>
          <strong>
            {WINDOW_PARAMETER.name}: {WINDOW_PARAMETER.blocks} blocks.
          </strong>{" "}
          Recorded {utc(WINDOW_PARAMETER.measuredAt)}. The deployed runtime value is not independently verified.
        </p>
        <pre>{WINDOW_PARAMETER.quote}</pre>
        <MotionLink href={WINDOW_PARAMETER.source}>Pinned parameter source ↗</MotionLink>
        <p>
          Formula: max(0, challengeEnd - reported finalizedBlock). Time estimate: remaining blocks * measured
          milliseconds per block, anchored at the head observation time. The indexed end is authoritative for this
          calculation; statusBlockNumber is not treated as a posting event.
        </p>
        <p>
          Deadlines use the reported finalized head, never best head. Safe mode suppresses time extrapolation. Finality
          stalls and runtime standing still need independent review.
        </p>
        <p>
          Source:{" "}
          <MotionLink href="https://mcp.flop.network/mcp">
            Hosted MCP / flop_indexer_query and flop_get_block
          </MotionLink>
          . Window capture used {report?.requests ?? "unknown"} HTTP attempts when recorded.
        </p>
        {report?.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </Disclosure>
    </section>
  );
}

function SettlementTimeline({ rows }: { rows: PageRow[] }) {
  const reduced = useReducedMotion() !== false;
  const times = rows.map((row) => row.settledAt);
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (!rows.length) return null;
  return (
    <div className={styles.timeline}>
      <div className={styles.timelineLabel}>
        <span>Observed payouts in time</span>
        <span>Each mark is a settlement</span>
      </div>
      <svg
        viewBox="0 0 1000 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Settlement timestamps from ${utc(min)} to ${utc(max)}. This is payout history, not a challenge countdown.`}
      >
        <line x1="6" y1="20" x2="994" y2="20" stroke="var(--border)" />
        <motion.g
          initial={{ opacity: reduced ? 0.6 : 0.15, scaleY: reduced ? 1 : 0.2 }}
          whileInView={{ opacity: 0.6, scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: reduced ? 0 : 0.4 }}
        >
          {rows.map((row) => (
            <line
              key={row.id}
              x1={6 + ((row.settledAt - min) / (max - min || 1)) * 988}
              x2={6 + ((row.settledAt - min) / (max - min || 1)) * 988}
              y1="8"
              y2="32"
              stroke={row.window.status === "estimated-open" ? "var(--warning)" : "var(--accent)"}
              strokeWidth="2"
            />
          ))}
        </motion.g>
      </svg>
      <div className={styles.timelineDates}>
        <time>{utc(min)}</time>
        <time>{utc(max)}</time>
      </div>
    </div>
  );
}

function Feasibility() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const steps = [
    {
      title: "Fetch audit data",
      capability: "Canonical transcript encoding and DaSource.fetch exist in the SDK.",
      missing: "A channel-bound commitment, assigned-provider location and reconstruction inputs.",
      file: "da.d.ts",
    },
    {
      title: "Re-run one prefill",
      capability: "An independent executor interface is documented.",
      missing: "Authenticated prompt bytes, the exact model and engine setup, activation bindings and a GPU executor.",
      file: "toploc-checker.d.ts",
    },
    {
      title: "Compare TOPLOC fingerprints",
      capability: "The SDK defines commitment and distance checks.",
      missing: "Per-turn activation bytes, expected hashes and complete governed comparison pins.",
      file: "toploc-evidence.d.ts",
    },
    {
      title: "Bisect and assemble evidence",
      capability: "Bisection helpers and signed DisputeEvidence types exist.",
      missing: "An authenticated final root, leaf preimages, enclave signatures, Merkle paths and live round state.",
      file: "dispute.d.ts",
    },
  ];
  return (
    <section id="feasibility" ref={ref} className={styles.feasibility} aria-labelledby="feasibility-title">
      <ReadingReveal>
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">02 / Outside-audit feasibility</p>
            <h2 id="feasibility-title">
              The interfaces exist.
              <br />
              <span>The session inputs are missing.</span>
            </h2>
          </div>
          <p>Assessed from public observations and SDK 0.4.0 on 2026-11-05. No independent prefill was run.</p>
        </div>
      </ReadingReveal>
      <p className={styles.small}>
        The line below tracks your place in the report. It does not represent audit completion.
      </p>
      <div className={styles.feasibilityBody}>
        <div className={styles.readingTrack} aria-hidden="true">
          <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        <div className={styles.steps}>
          {steps.map((step, index) => (
            <ReadingReveal key={step.title} order={index}>
              <article className={styles.step}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.capability}</p>
                  <p className={styles.missing}>
                    <span>Missing in the inspected public evidence</span>
                    {step.missing}
                  </p>
                  <MotionLink href={`${sdk}${step.file}`}>Inspect SDK interface ↗</MotionLink>
                </div>
                <span className={styles.status}>Blocked by inputs</span>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </div>
      <div className={styles.feasibilityFoot}>
        <p>
          The documented discretionary bond is <strong>100 FLOP</strong>. The design says a frivolous challenge forfeits
          it. Runtime bond and eligibility are unverified.
        </p>
        <MotionLink href={reportUrl}>Full feasibility report and sources ↗</MotionLink>
      </div>
    </section>
  );
}

function DossierView({ dossier }: { dossier: Dossier }) {
  const reduced = useReducedMotion() !== false;
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [replay, setReplay] = useState<string | null>(null);
  const download = (kind: "json" | "md" | "bundle") => {
    try {
      const content =
        kind === "md"
          ? dossierMarkdown(dossier)
          : JSON.stringify(kind === "bundle" ? dossier.verifier.bundle : dossier, null, 2);
      const url = URL.createObjectURL(
        new Blob([content], { type: kind === "md" ? "text/markdown" : "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `challenger-${dossier.channelId}${kind === "bundle" ? "-bundle.json" : `.${kind}`}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("Download unavailable. Copy the dossier JSON below.");
    }
  };
  return (
    <motion.div
      key={dossier.channelId}
      initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.24 }}
    >
      <code className={styles.fullId}>{dossier.channelId}</code>
      <p>{dossier.purpose}</p>
      <div className={styles.dossierActions}>
        <CopyButton text={dossier.channelId} label="Copy channel ID" />
        <MotionButton className="quiet-button" onClick={() => download("json")}>
          Download dossier JSON
        </MotionButton>
        <MotionButton className="quiet-button" onClick={() => download("md")}>
          Download Markdown
        </MotionButton>
        <MotionButton className="quiet-button" onClick={() => download("bundle")}>
          Download verifier bundle
        </MotionButton>
        <MotionButton
          className="quiet-button"
          onClick={async () => {
            try {
              const result = await replayDossier(dossier);
              setReplay(
                `Content hash matches. ${result.verifier.checks.length} verifier checks replayed locally. No network requests. Incomplete proof remains unverifiable.`,
              );
            } catch (error) {
              setReplay(error instanceof Error ? error.message : "Replay failed");
            }
          }}
        >
          Verify offline
        </MotionButton>
        <MotionLink className="quiet-button" href="/verify">
          Verifier workbench ↗
        </MotionLink>
      </div>
      {downloadError && <p role="status">{downloadError}</p>}
      {replay && <p role="status">{replay}</p>}
      <p className={styles.small}>Canonical dossier SHA-256, not an author signature:</p>
      <code className={styles.fullId}>{dossier.sha256}</code>
      <div className={styles.dossierSummary}>
        <div>
          <span className={styles.label}>Window</span>
          <strong>{dossier.blockWindow?.status ?? states[dossier.window.status]}</strong>
          <p>{dossier.blockWindow?.reason ?? dossier.window.reason}</p>
          {dossier.blockWindow && (
            <p>
              End block {dossier.blockWindow.endBlock ?? "unknown"}. Captured finalized head{" "}
              {dossier.blockWindow.headBlock ?? "unknown"}. Remaining {dossier.blockWindow.remainingBlocks ?? "unknown"}{" "}
              blocks.
            </p>
          )}
        </div>
        <div>
          <span className={styles.label}>Documented discretionary bond</span>
          <strong>{dossier.bond.documentedFlop} FLOP</strong>
          <p>Runtime value unverified. Forfeited if frivolous.</p>
          <MotionLink href={dossier.bond.source}>Design source ↗</MotionLink>
        </div>
      </div>
      <h3>Public evidence checks</h3>
      <p className={styles.small}>
        Passing checks establish only their named claim. Unverifiable is not a failed proof.
      </p>
      <ul className={styles.checks}>
        {dossier.verifier.report.checks.map((check) => (
          <li key={check.id}>
            <div>
              <strong>{check.claim}</strong>
              <span className={check.status === "FAIL" ? styles.failed : styles.status}>
                {check.simulated ? "SIMULATED / " : ""}
                {check.status}
              </span>
            </div>
            <p>{check.detail}</p>
          </li>
        ))}
        {dossier.checks.map((check) => (
          <li key={check.name}>
            <div>
              <strong>{check.name}</strong>
              <span className={check.status === "fail" ? styles.failed : styles.status}>{check.status}</span>
            </div>
            <p>{check.detail}</p>
          </li>
        ))}
      </ul>
      {dossier.priority && (
        <Disclosure title={`Why this score? ${dossier.priority.score.toFixed(2)} / 100`}>
          <div className={styles.signals}>
            {dossier.priority.signals.map((signal) => (
              <div key={signal.name}>
                <div className={styles.lane}>
                  <strong>{signal.name}</strong>
                  <span>{signal.points === null ? "Unavailable" : `${signal.points} / ${signal.maximum}`}</span>
                </div>
                <ObservedBar fraction={(signal.points ?? 0) / signal.maximum} label={signal.name} />
                <p>{signal.reason}</p>
              </div>
            ))}
            <p>
              {dossier.priority.confidence.label} {dossier.priority.confidence.availableSignals}/
              {dossier.priority.confidence.totalSignals} fields available.{" "}
              {dossier.priority.confidence.tapeComplete ? "Complete reported tape." : "Partial tape."}
            </p>
          </div>
        </Disclosure>
      )}
      <h3>Submission stays unavailable</h3>
      <p>{dossier.eligibility}</p>
      <p>
        <strong>Executable extrinsic: null.</strong> No transaction is constructed or signed.
      </p>
      {dossier.submission.documentedCalls.map((call) => (
        <div className={styles.call} key={call.signature}>
          <code>{call.signature}</code>
          <p>{call.lane}</p>
          <p>Missing: {call.missingInputs.join("; ")}.</p>
          <MotionLink href={SDK_CHAIN_SOURCE}>SDK chain reference ↗</MotionLink>
        </div>
      ))}
      <ul>
        {dossier.submission.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Disclosure title="Evidence sources and raw dossier">
        <div className={styles.assumptions}>
          {Object.entries(dossier.evidence).map(([name, item]) => (
            <p key={name}>
              <strong>{name}</strong>:{" "}
              {item ? (
                <>
                  <time>{utc(item.measuredAt)}</time> from <MotionLink href={item.source}>{item.source}</MotionLink>
                </>
              ) : (
                "No observation available"
              )}
            </p>
          ))}
          <CopyButton text={JSON.stringify(dossier, null, 2)} label="Copy dossier JSON" />
          <pre>{JSON.stringify(dossier, null, 2)}</pre>
        </div>
      </Disclosure>
    </motion.div>
  );
}
