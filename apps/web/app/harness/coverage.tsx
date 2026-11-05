// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { coverageTotals, parseSourcePage, type CoveragePage } from "./coverage-model";
import type { InventoryPage } from "../../../../packages/harness/src/inventory";
import type { ClaimHistory } from "../../../../packages/harness/src/history";
import type { ClaimResult } from "./model";
import { utc } from "./model";
import styles from "./coverage.module.css";

const build = process.env.NEXT_PUBLIC_BUILD_COMMIT;
const revision = build && /^[a-f0-9]{40}$/.test(build) ? build : "main";

function SourceDetails({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const [page, setPage] = useState<InventoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(12);
  const reduced = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/harness/sources/${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
        const raw = await response.text();
        if (raw.length > 500_000) throw new Error("Source response too large");
        return parseSourcePage(JSON.parse(raw), id);
      })
      .then(setPage)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [id]);
  if (error)
    return (
      <p role="alert">Source details unavailable: {error}. Use the source link or the offline coverage command.</p>
    );
  if (!page) return <p role="status">Loading quoted source blocks...</p>;
  return (
    <div className={styles.details}>
      <p>
        Captured <time dateTime={page.measuredAt}>{utc(page.measuredAt)}</time>. Lines refer to the recorded source. A
        block can contain more than one assertion.
      </p>
      <a href={page.url}>Read source ↗</a>
      {" · "}
      <a href={`https://github.com/zkasuran/flop-lab/blob/${revision}/packages/harness/fixtures/sources/${id}.json`}>
        Raw captured source ↗
      </a>
      {" · "}
      <a href={`/harness/sources/${id}`} download={`${id}.json`}>
        Download quoted inventory ↗
      </a>
      <ol className={styles.units}>
        {page.units.slice(0, limit).map((unit) => (
          <motion.li key={unit.id} layout={reduced ? false : "position"}>
            <div className={styles.unitHeading}>
              <span>
                Lines {unit.line}
                {unit.endLine !== unit.line ? ` to ${unit.endLine}` : ""} / {unit.kind}
              </span>
              <strong>{unit.checks.length ? "Named check" : "Evidence gap"}</strong>
            </div>
            <blockquote>{unit.quote}</blockquote>
            <p>{unit.boundary}</p>
            {unit.checks.map((check) => (
              <motion.button
                key={check}
                onClick={() => onSelect(check)}
                whileHover={{ borderColor: "var(--accent)" }}
                whileTap={reduced ? {} : { scale: 0.98 }}
              >
                Inspect {check} ↗
              </motion.button>
            ))}
          </motion.li>
        ))}
      </ol>
      {limit < page.units.length && (
        <motion.button
          onClick={() => setLimit((value) => value + 12)}
          whileHover={{ borderColor: "var(--accent)" }}
          whileTap={reduced ? {} : { scale: 0.98 }}
        >
          Show more source blocks ({limit} of {page.units.length})
        </motion.button>
      )}
    </div>
  );
}

export function SourceCoverage({
  pages,
  results,
  onSelect,
  history,
}: {
  pages: CoveragePage[];
  results: ClaimResult[];
  onSelect: (id: string) => void;
  history: ClaimHistory;
}) {
  const [kind, setKind] = useState("html");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 35%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const total = coverageTotals(pages, results);
  const filtered = pages
    .filter(
      (page) => page.format === kind && `${page.title} ${page.id}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((left, right) => right.mapped - left.mapped);
  return (
    <section ref={ref} id="source-coverage" className={styles.coverage} aria-labelledby="coverage-title">
      <motion.div
        initial={false}
        whileInView={{ y: reduced ? 0 : [12, 0] }}
        viewport={{ once: true }}
        transition={{ duration: reduced ? 0 : 0.35 }}
      >
        <p className="eyebrow">01 / Source coverage</p>
        <h2 id="coverage-title">What did we actually check?</h2>
        <p className={styles.lede}>
          Browse every recorded docs page and paper section. Read the quoted statements, their named checks and the
          evidence still missing.
        </p>
      </motion.div>
      <div className={styles.progress} aria-hidden="true">
        <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
      </div>
      <div className={styles.totals}>
        {[
          [total.blocks, "source blocks"],
          [total.mapped, "blocks with a named check"],
          [total.checks, "linked predicates"],
          [total.passed, "passing predicates"],
        ].map(([value, label], index) => (
          <motion.div
            key={label}
            initial={false}
            whileInView={{ y: reduced ? 0 : [8, 0] }}
            viewport={{ once: true }}
            transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : index * 0.04 }}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </motion.div>
        ))}
      </div>
      <p className={styles.note}>
        Coverage is mapped blocks / retained blocks. It is not a correctness score. Parameter matches compare sources,
        not runtime enforcement. Unmapped blocks include context, examples and claims that need external evidence.
      </p>
      <div className={styles.controls}>
        <div role="group" aria-label="Source collection">
          {[
            ["html", "Docs pages"],
            ["markdown", "Yellowpaper sections"],
          ].map(([value, label]) => (
            <motion.button
              key={value}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value!);
                setSelected(null);
                setVisibleCount(12);
              }}
              whileHover={{ borderColor: "var(--accent)" }}
              whileTap={reduced ? {} : { scale: 0.98 }}
            >
              {label} <span>{pages.filter((page) => page.format === value).length}</span>
            </motion.button>
          ))}
        </div>
        <label>
          Find a source page
          <motion.input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setVisibleCount(12);
            }}
            whileFocus={{ borderColor: "var(--accent)" }}
            placeholder="Page title or slug"
          />
        </label>
      </div>
      <p role="status" className={styles.note}>
        Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} source documents. Mapped pages first.
      </p>
      <motion.ul className={styles.pages} layout={reduced ? false : "position"}>
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.slice(0, visibleCount).map((page) => (
            <motion.li
              key={page.id}
              layout={reduced ? false : "position"}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: reduced ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
            >
              <motion.button
                className={styles.pageButton}
                aria-expanded={selected === page.id}
                aria-controls={`source-${page.id}`}
                onClick={() => setSelected(selected === page.id ? null : page.id)}
                whileHover={{ backgroundColor: "var(--surface-raised)" }}
                whileTap={reduced ? {} : { scale: 0.998 }}
              >
                <span>
                  <strong>{page.id === "paper-1" ? "Yellowpaper preamble" : page.title}</strong>
                  <small>
                    {page.mapped} of {page.blocks} blocks mapped / {page.checks.length} checks
                  </small>
                </span>
                <span className={styles.bar} aria-hidden="true">
                  <motion.i
                    style={{ scaleX: page.blocks ? page.mapped / page.blocks : 0 }}
                    initial={false}
                    whileInView={{ opacity: [0.55, 1] }}
                    viewport={{ once: true }}
                    transition={{ duration: reduced ? 0 : 0.3 }}
                  />
                </span>
                <span aria-hidden="true">{selected === page.id ? "−" : "+"}</span>
              </motion.button>
              <AnimatePresence initial={false}>
                {selected === page.id && (
                  <motion.div
                    id={`source-${page.id}`}
                    initial={{ opacity: 0, y: reduced ? 0 : 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                  >
                    <SourceDetails id={page.id} onSelect={onSelect} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
      {filtered.length > visibleCount && (
        <motion.button
          className={styles.more}
          onClick={() => setVisibleCount((value) => value + 12)}
          whileHover={{ borderColor: "var(--accent)" }}
          whileTap={reduced ? {} : { scale: 0.98 }}
        >
          Show more source pages ↓
        </motion.button>
      )}
      {!filtered.length && <p>No source pages match. Clear the search to see the inventory.</p>}
      <aside className={styles.history} aria-label="Recorder history availability">
        <h3>Claim history</h3>
        <p>
          {history.state === "recorded"
            ? `${history.runs.length} recorder runs are available. Open a claim to inspect its status in every run.`
            : history.state === "empty"
              ? "No public recorder history yet. The data branch has no recorded runs. The current result matrix is a separate dated recording."
              : `Recorder history unavailable: ${history.error}. The current result matrix is a separate dated recording.`}
        </p>
        <p>
          Checked <time dateTime={history.checkedAt}>{utc(history.checkedAt)}</time>.{" "}
          <a href={history.source}>Recorder index ↗</a>. Cached for five minutes. Missing claims remain gaps.
        </p>
      </aside>
    </section>
  );
}
