// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useId, useRef, useState } from "react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import type { Appendix, Difference, Item, Report, Result } from "../../../../packages/spec/src/model";
import styles from "./spec.module.css";

const results: Result[] = ["MATCH", "DRIFT", "SPEC_ONLY", "RUNTIME_ONLY", "UNOBSERVABLE"];
const labels: Record<Result, string> = {
  MATCH: "Match",
  DRIFT: "Drift",
  SPEC_ONLY: "Spec only",
  RUNTIME_ONLY: "Runtime only",
  UNOBSERVABLE: "Unobservable",
};
const explanations: Record<Result, string> = {
  MATCH: "Exact agreement with the catalog or an observed name. Not runtime certification.",
  DRIFT: "Both sides known, with different values in comparable units.",
  SPEC_ONLY: "A spec identifier absent from the catalog, or a vector with no replay.",
  RUNTIME_ONLY: "An observed identifier with no parsed spec entry.",
  UNOBSERVABLE: "Public evidence cannot settle this clause. Inspect what is needed.",
};
const appendices: { id: Appendix; name: string; note: string }[] = [
  {
    id: "A",
    name: "Parameters",
    note: "Enforced values, reference values and summary clauses against the public catalog.",
  },
  {
    id: "G",
    name: "Extrinsic index",
    note: "A bounded top-level call sample. Positional values do not reveal argument names.",
  },
  {
    id: "H",
    name: "Implementation status",
    note: "Informative claims from the paper. An empty activity count cannot verify a mechanism.",
  },
  { id: "V", name: "Located vectors", note: "Public cases, pending drafts and wire families. Located, not executed." },
];
const command = "pnpm --filter @flop-lab/spec build && node packages/spec/dist/cli.js diff --section A";

function utc(time: string) {
  return `${time
    .replace("T", " ")
    .replace(/\.\d+Z$/, "")
    .replace(/Z$/, "")} UTC`;
}

function Side({ item, title }: { item: Item | null; title: string }) {
  return (
    <div className={styles.side}>
      <p className="eyebrow">{title}</p>
      {item ? (
        <>
          <p className={styles.value}>
            {item.kind === "vector" ? (
              "Vector or pending draft"
            ) : (
              <>
                <code>{item.value}</code> {item.unit}
              </>
            )}
          </p>
          <MotionLink className={styles.source} href={item.evidence.source} target="_blank" rel="noreferrer">
            {item.evidence.sha
              ? `Yellowpaper ${item.evidence.sha.slice(0, 8)}${item.evidence.line ? ` : line ${item.evidence.line}` : " : vector file"}`
              : "Public MCP observation"}{" "}
            ↗
          </MotionLink>
          <time className={styles.time} dateTime={item.evidence.measuredAt}>
            {utc(item.evidence.measuredAt)}
          </time>
          <pre className={styles.quote}>{item.evidence.quote}</pre>
        </>
      ) : (
        <p className="muted">No quoted side is available in this comparison.</p>
      )}
    </div>
  );
}

function Clause({ difference: d }: { difference: Difference }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion() !== false;
  const item = d.spec ?? d.runtime!;
  return (
    <motion.li
      layout={reduced ? false : "position"}
      className={styles.clause}
      initial={{ opacity: 1, y: reduced ? 0 : 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      <MotionButton className={styles.row} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className={styles.clauseName}>
          <span className="eyebrow">
            {d.spec?.section.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") ?? "Public observation"}
            {item.pallet ? ` / ${item.pallet}` : ""}
          </span>
          <strong>{d.name}</strong>
        </span>
        <span className={styles.badge} data-result={d.result}>
          {labels[d.result]}
        </span>
        <motion.span
          aria-hidden="true"
          className={styles.plus}
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
        >
          +
        </motion.span>
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            className={styles.detail}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            <p className={styles.reason}>{d.reason}</p>
            <div className={styles.sides}>
              <Side title="Pinned specification" item={d.spec} />
              <Side title="Public observation" item={d.runtime} />
            </div>
            {d.needed && (
              <p className={styles.needed}>
                <strong>To settle this:</strong> {d.needed}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function ClauseGroup({ appendix, rows }: { appendix: (typeof appendices)[number]; rows: Difference[] }) {
  const [limit, setLimit] = useState(8);
  const reduced = useReducedMotion() !== false;
  return (
    <motion.section
      layout={reduced ? false : "position"}
      className={styles.group}
      transition={{ duration: reduced ? 0 : 0.2 }}
      aria-labelledby={`appendix-${appendix.id}`}
    >
      <div className={styles.groupHeading}>
        <span className={styles.letter}>{appendix.id}</span>
        <div>
          <h3 id={`appendix-${appendix.id}`}>{appendix.name}</h3>
          <p className="muted">{appendix.note}</p>
        </div>
        <span className={styles.groupCount}>
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
      </div>
      <ul className={styles.rows}>
        <AnimatePresence initial={false} mode="popLayout">
          {rows.slice(0, limit).map((row) => (
            <Clause key={row.id} difference={row} />
          ))}
        </AnimatePresence>
      </ul>
      {rows.length > limit && (
        <MotionButton className={styles.more} onClick={() => setLimit(limit + 16)}>
          Show more {appendix.id} rows{" "}
          <span>
            {limit} of {rows.length} shown
          </span>
        </MotionButton>
      )}
    </motion.section>
  );
}

/** Explore the exact same dated report as the CLI. @example <SpecWorkbench report={recordedReport()} /> */
export function SpecWorkbench({ report }: { report: Report }) {
  const [filter, setFilter] = useState<Result | "ALL">("ALL");
  const [appendix, setAppendix] = useState<Appendix | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const reduced = useReducedMotion() !== false;
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 35%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const total = report.differences.length;
  const rows = report.differences.filter(
    (d) =>
      (filter === "ALL" || d.result === filter) &&
      (appendix === "ALL" || d.appendix === appendix) &&
      `${d.id} ${d.name}`.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const reset = () => {
    setFilter("ALL");
    setAppendix("ALL");
    setQuery("");
  };
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <ReadingReveal>
            <MotionLink href="/#tools" className={styles.back}>
              ← Verify / Spec differ
            </MotionLink>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <h1>Does the devnet match the paper?</h1>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <p className={styles.intro}>
              Compare each pinned clause with what the public devnet exposes. See agreement, missing evidence and the
              exact quoted sides.
            </p>
          </ReadingReveal>
          <ReadingReveal order={3}>
            <p className={styles.dated}>
              <span className={styles.recorded}>Recorded comparison</span>
              <br />
              Last compared <time dateTime={report.lastCompared}>{utc(report.lastCompared)}</time>
            </p>
          </ReadingReveal>
        </div>
        <ReadingReveal order={3}>
          <aside className={styles.verdict} aria-label="Comparison boundary">
            <p className="eyebrow">What the evidence supports</p>
            <div className={styles.verdictNumber}>
              <ObservedNumber
                value={report.differences.filter((d) => d.appendix === "A" && d.result === "MATCH").length}
              />
              <span>catalog matches</span>
            </div>
            <p>Agreement is narrower than proof.</p>
            <p className="muted">
              The catalog reports source values. It does not expose deployed storage. Indexed arguments are positional
              values, not a runtime signature.
            </p>
            <div className={styles.pin}>
              <span className="eyebrow">Pinned yellowpaper</span>
              <MotionLink
                href={`https://github.com/flop-labs/yellowpaper/blob/${report.sha}/yellowpaper.md`}
                target="_blank"
                rel="noreferrer"
              >
                <code>{report.sha}</code> ↗
              </MotionLink>
            </div>
          </aside>
        </ReadingReveal>
      </header>

      <section className={styles.summary} aria-labelledby="result-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">01 / Result map</p>
            <h2 id="result-title">Every result has a boundary.</h2>
          </div>
          <p className="muted">{total} compared rows. Select a result to inspect it.</p>
        </div>
        <div className={styles.counters}>
          {results.map((result, index) => (
            <MotionButton
              key={result}
              className={styles.counter}
              data-result={result}
              aria-pressed={filter === result}
              aria-label={`Filter ${labels[result]}`}
              onClick={() => {
                setFilter(filter === result ? "ALL" : result);
                setAppendix("ALL");
              }}
            >
              <span className="eyebrow">{labels[result]}</span>
              <strong>
                <ObservedNumber value={report.counts[result]} />
              </strong>
              <span className={styles.bar}>
                <motion.span
                  data-bar={result}
                  initial={{ scaleX: reduced ? (total ? report.counts[result] / total : 0) : 0 }}
                  whileInView={{ scaleX: total ? report.counts[result] / total : 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: reduced ? 0 : 0.48, delay: reduced ? 0 : index * 0.025 }}
                />
              </span>
              <span className={styles.counterNote}>{explanations[result]}</span>
            </MotionButton>
          ))}
        </div>
      </section>

      <section className={styles.guide} ref={guide} aria-labelledby="guide-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">02 / Evidence path</p>
            <h2 id="guide-title">Read the claim. Inspect its reach.</h2>
          </div>
          <span className="muted">The line tracks reading progress.</span>
        </div>
        <div className={styles.track} aria-hidden="true">
          <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
        </div>
        <div className={styles.steps}>
          <ReadingReveal>
            <h3>Pin the paper</h3>
            <p>
              Appendices A, G and H retain line anchors. Public vectors retain their declared status and expectations.
            </p>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <h3>Quote the observation</h3>
            <p>
              Catalog values and {report.transactionCount} sampled top-level transactions carry their own reception
              time.
            </p>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <h3>Keep the unknown</h3>
            <p>
              Missing activity does not prove missing code. Signature and implementation checks need independent runtime
              evidence.
            </p>
          </ReadingReveal>
        </div>
      </section>

      <section className={styles.explorer} aria-labelledby="clauses-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">03 / Clause explorer</p>
            <h2 id="clauses-title">Open the two sides.</h2>
          </div>
          <MotionButton className="quiet-button" onClick={reset}>
            Reset filters
          </MotionButton>
        </div>
        <div className={styles.filters}>
          <div className={styles.tabs} role="group" aria-label="Appendix filter">
            {[{ id: "ALL" as const, name: "All appendices" }, ...appendices].map((a) => (
              <MotionButton
                key={a.id}
                className={styles.tab}
                aria-pressed={appendix === a.id}
                onClick={() => setAppendix(a.id)}
              >
                {appendix === a.id && (
                  <motion.span
                    className={styles.activeTab}
                    layoutId={reduced ? undefined : "spec-appendix"}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                  />
                )}
                <span>{a.id === "ALL" ? a.name : `${a.id} / ${a.name}`}</span>
              </MotionButton>
            ))}
          </div>
          <motion.input
            aria-label="Search clauses"
            placeholder="Find an exact name or clause..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            whileHover={{ borderColor: "var(--muted)" }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          />
        </div>
        <p className={styles.showing} role="status">
          {rows.length} {rows.length === 1 ? "row matches" : "rows match"} these filters
          {filter !== "ALL" ? ` / ${labels[filter]}` : ""}. Expand any row for evidence.
        </p>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <h3>No rows in this view.</h3>
            <p>
              {filter === "DRIFT"
                ? "This dated comparison found no exact value differences in comparable units. That does not certify the runtime."
                : "Try another appendix, result or name."}
            </p>
            <MotionButton className="quiet-button" onClick={reset}>
              Show all rows
            </MotionButton>
          </div>
        ) : (
          appendices
            .filter((a) => rows.some((d) => d.appendix === a.id))
            .map((a) => (
              <ClauseGroup
                key={`${a.id}:${filter}:${query}`}
                appendix={a}
                rows={rows.filter((d) => d.appendix === a.id)}
              />
            ))
        )}
      </section>

      <section className={styles.reproduce} aria-labelledby="reproduce-title">
        <div>
          <p className="eyebrow">04 / Reproduce</p>
          <h2 id="reproduce-title">Take the evidence with you.</h2>
          <p className="muted">
            From a checkout of flop-lab with dependencies installed. The default replays the recorded data. Add{" "}
            <code>--live</code> for a bounded fresh MCP comparison against the same paper pin.
          </p>
        </div>
        <div className={styles.command}>
          <code>{command}</code>
          <CopyButton text={command} label="Copy comparison command" />
        </div>
        <div className={styles.links}>
          <MotionLink href="/spec/report" download>
            Download this report ↓
          </MotionLink>
          <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/spec">
            Package and raw fixtures ↗
          </MotionLink>
        </div>
        <Disclosure title="Observation sources and warnings">
          <div className={styles.notes}>
            <p>
              Hosted MCP: <MotionLink href="https://mcp.flop.network/mcp">https://mcp.flop.network/mcp</MotionLink>.
              Calls use JSON-RPC POST. Source links identify the service; the quoted tool result is the recorded
              evidence.
            </p>
            {report.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {report.stats && (
              <>
                <p>
                  Stats received <time dateTime={report.stats.measuredAt}>{utc(report.stats.measuredAt)}</time>. Context
                  only, not parameter evidence.
                </p>
                <pre className={styles.quote}>{report.stats.quote}</pre>
              </>
            )}
          </div>
        </Disclosure>
        <div className={styles.limitations}>
          <h3>What this does not verify</h3>
          <p>
            Deployed storage constants, runtime metadata, finalized inclusion, vector execution and
            implementation-status claims. Missing calls in a bounded sample are not absent from the chain. No write
            transactions are made.
          </p>
        </div>
      </section>
    </div>
  );
}
