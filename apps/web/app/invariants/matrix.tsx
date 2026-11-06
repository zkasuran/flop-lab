// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/controls";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import type { Entry, Report, Signal, Suite } from "../../../../packages/invariants/src/types";
import { displayText, labels, parseReplayEvent, suites, visibleEntries } from "./view";
import styles from "./matrix.module.css";

const explains: Record<Signal, string> = {
  OBSERVED: "Some public fields agree. Read the remaining gaps.",
  MISMATCH: "A scoped check found a disagreement.",
  NO_DATA: "A mapped check lacks usable evidence.",
  UNOBSERVABLE: "No current check can establish this rule.",
};
const suiteLinks: Record<Suite, string> = {
  verifier: "/verify",
  indexer: "/indexer",
  harness: "/harness",
  spec: "/spec",
};
const groupName = (entry: Entry) =>
  entry.kind === "failure"
    ? entry.actor
    : entry.kind === "policy"
      ? "Degraded-state policy"
      : entry.kind === "penalty"
        ? "Validator penalties"
        : "Security invariants";

function Detail({ entry, close }: { entry: Entry | null; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    if (entry && !ref.current?.open) ref.current?.showModal();
    if (!entry && ref.current?.open) ref.current.close();
  }, [entry]);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      id="invariant-detail"
      aria-labelledby="detail-title"
      onCancel={close}
      onClose={close}
    >
      <AnimatePresence initial={false} mode="wait">
        {entry && (
          <motion.div
            key={entry.id}
            className={styles.detail}
            initial={{ opacity: 1, y: reduced ? 0 : 12 }}
            animate={{ y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.24 }}
          >
            <div className={styles.detailTop}>
              <span className="eyebrow">
                {entry.id} / {displayText(entry.section)}
              </span>
              <MotionButton onClick={close} className={styles.button}>
                Close
              </MotionButton>
            </div>
            <h2 id="detail-title">{displayText(entry.title)}</h2>
            <p className={styles.signal} data-signal={entry.signal}>
              {labels[entry.signal]}
              {entry.flags.length ? ` / ${entry.flags.join(" / ")}` : ""}
            </p>
            <section>
              <h3>What would show a violation?</h3>
              <p>{entry.violation}</p>
            </section>
            <section className={styles.boundary}>
              <h3>What the public evidence leaves open</h3>
              <p>{entry.boundary}</p>
            </section>
            <section>
              <h3>Quoted rule</h3>
              <blockquote>{displayText(entry.quote.text)}</blockquote>
              <p className={styles.date}>
                Display typography uses plain hyphens. Downloads retain the original source text.
              </p>
              <MotionLink href={`${entry.quote.source}#L${entry.quote.line}-L${entry.quote.endLine}`}>
                Yellowpaper lines {entry.quote.line} to {entry.quote.endLine} ↗
              </MotionLink>
              <p className={styles.date}>
                Source captured <time dateTime={entry.quote.measuredAt}>{entry.quote.measuredAt}</time>
              </p>
              {entry.cells.length > 0 && (
                <dl className={styles.cells}>
                  {entry.cells.map((cell) => (
                    <div key={cell.column}>
                      <dt>{cell.column}</dt>
                      <dd>{displayText(cell.quote)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
            <section>
              <h3>Checks this suite runs</h3>
              {entry.results.length ? (
                entry.results.map((check) => (
                  <article className={styles.check} key={check.id}>
                    <div className={styles.checkHeading}>
                      <code>{check.id}</code>
                      <strong>{check.status}</strong>
                    </div>
                    <p>{displayText(check.reason)}</p>
                    <MotionLink href={suiteLinks[check.suite]}>Open {check.suite} ↗</MotionLink>
                    {check.evidence.map((evidence, index) => (
                      <div className={styles.evidence} key={index}>
                        <MotionLink href={evidence.source}>{evidence.source}</MotionLink>
                        <time dateTime={evidence.measuredAt}>{evidence.measuredAt}</time>
                        <pre>{displayText(evidence.detail)}</pre>
                      </div>
                    ))}
                  </article>
                ))
              ) : (
                <p>Not observable from outside with the current suite. The evidence needed is described above.</p>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

export function Matrix({ initial }: { initial: Report }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Signal | "ALL">("ALL");
  const [kind, setKind] = useState<Entry["kind"] | "ALL">("failure");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<Suite[]>(suites);
  const [message, setMessage] = useState("Recorded evidence. No devnet requests on this page.");
  const lock = useRef(false);
  const guide = useRef<HTMLElement>(null);
  const board = useRef<HTMLElement>(null);
  const boardVisible = useInView(board, { once: true, margin: "100px" });
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 85%", "end 45%"] });
  const reading = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const matching = visibleEntries(initial.entries, query, filter, kind);
  const pageCount = Math.max(1, Math.ceil(matching.length / 16));
  const entries = matching.slice(page * 16, (page + 1) * 16);
  const groups = [...new Set(entries.map(groupName))];
  const duration = reduced ? 0 : 0.32;
  const observations = initial.entries
    .flatMap((e) => e.results.flatMap((c) => c.evidence.map((v) => v.measuredAt)))
    .sort();

  async function replay() {
    if (lock.current) return;
    lock.current = true;
    setRunning(true);
    setCompleted([]);
    setMessage("Rechecking recorded inputs. The source times stay unchanged.");
    const seen = new Set<Suite>();
    let done = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/invariants/replay", { method: "POST", signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Replay unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let bytes = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 10_000) {
          await reader.cancel();
          throw new Error("Replay response too large");
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const event = parseReplayEvent(JSON.parse(line));
          if ("error" in event) throw new Error(event.error);
          if ("suite" in event) {
            seen.add(event.suite);
            setCompleted([...seen]);
          } else {
            done = true;
            setMessage(`Replay completed at ${event.evaluatedAt}. The devnet was not queried.`);
          }
        }
      }
      if (!done || seen.size !== suites.length || buffer.trim()) throw new Error("Incomplete replay");
    } catch {
      setMessage("Recorded replay could not complete. The displayed recording is retained.");
    } finally {
      clearTimeout(timeout);
      setRunning(false);
      lock.current = false;
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(initial, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "invariant-report.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.hero}>
        <ToolHeader slug="invariants" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            A security rule is broader than a passing API check. Explore the failure matrix, see the exact rule and find
            the evidence still missing.
          </p>
        </ReadingReveal>
      </header>

      <section className={styles.overview} aria-label="Recorded coverage">
        <div className={styles.overviewHeading}>
          <div>
            <span className="eyebrow">Yellowpaper / sections 11 and 13</span>
            <h2>Where the evidence stops</h2>
          </div>
          <span className={styles.recorded}>Recorded, not live</span>
        </div>
        <div className={styles.metrics}>
          {(Object.keys(labels) as Signal[]).map((signal) => (
            <div key={signal} className={styles.metric} data-signal={signal}>
              <span>{labels[signal]}</span>
              <strong>
                <ObservedNumber value={initial.counts[signal]} />
              </strong>
              <p>{explains[signal]}</p>
              <div className={styles.track}>
                <motion.div
                  initial={false}
                  whileInView={{ scaleX: initial.counts[signal] / initial.entries.length }}
                  viewport={{ once: true }}
                  transition={{ duration }}
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.caption}>
          Counts are source rows, not a security score. A scoped match leaves the rest of that rule open.
          <br />
          Evidence captured from <time>{observations[0]}</time> to <time>{observations.at(-1)}</time>. Individual source
          times are inside each cell.
        </div>
      </section>

      <section ref={board} className={styles.board} aria-labelledby="matrix-title">
        <div className={styles.boardHeading}>
          <div>
            <span className="eyebrow">Actor by failure</span>
            <h2 id="matrix-title">Find the rule. Open the gap.</h2>
          </div>
          <MotionButton className={styles.button} onClick={replay} disabled={running}>
            {running ? "Rechecking..." : "Recheck recorded inputs"}
          </MotionButton>
        </div>
        <div className={styles.pipeline} aria-label="Suite replay progress">
          {suites.map((suite) => (
            <div key={suite} data-complete={completed.includes(suite)}>
              <span>{suite}</span>
              <span>
                {running && !completed.includes(suite)
                  ? "Pending"
                  : completed.includes(suite)
                    ? "Complete"
                    : "Incomplete"}
              </span>
              <motion.div
                className={styles.progress}
                animate={{ scaleX: completed.includes(suite) ? 1 : 0 }}
                transition={{ duration }}
              />
            </div>
          ))}
        </div>
        <p className={styles.runMessage} role="status">
          {message}
        </p>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            Search rules
            <motion.input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Model swap, M1, replay..."
              whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
          </label>
          <label className={styles.select}>
            Source group
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setPage(0);
              }}
            >
              <option value="ALL">All source rows</option>
              <option value="failure">Actor failures</option>
              <option value="invariant">Security invariants</option>
              <option value="policy">Degraded-state policy</option>
              <option value="penalty">Validator penalties</option>
            </select>
          </label>
        </div>
        <div className={styles.filters} aria-label="Filter by coverage">
          {(["ALL", ...Object.keys(labels)] as const).map((value) => (
            <MotionButton
              key={value}
              className={styles.filter}
              onClick={() => {
                setFilter(value as typeof filter);
                setPage(0);
              }}
              aria-pressed={filter === value}
            >
              {filter === value && (
                <motion.span
                  className={styles.filterMark}
                  layoutId={reduced ? undefined : "invariant-filter"}
                  transition={{ duration }}
                />
              )}
              <span>{value === "ALL" ? "All coverage" : labels[value as Signal]}</span>
            </MotionButton>
          ))}
        </div>
        <p className={styles.resultCount} aria-live="polite">
          {matching.length} of {initial.entries.length} source rows match. Open a cell for its quote and checks.
        </p>
        {matching.length > 0 && (
          <div className={styles.pagination} aria-label="Matrix pages">
            <MotionButton className={styles.button} disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous cases
            </MotionButton>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <MotionButton className={styles.button} disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
              Next cases
            </MotionButton>
          </div>
        )}
        {!entries.length && (
          <div className={styles.empty}>
            <h3>No rules match these filters.</h3>
            <MotionButton
              className={styles.button}
              onClick={() => {
                setFilter("ALL");
                setKind("ALL");
                setQuery("");
                setPage(0);
              }}
            >
              Clear filters
            </MotionButton>
          </div>
        )}
        <div className={styles.matrix}>
          {groups.map((group) => (
            <section key={group} className={styles.actor} aria-label={group}>
              <h3>{displayText(group)}</h3>
              <div className={styles.grid}>
                <AnimatePresence initial={false} mode="popLayout">
                  {entries
                    .filter((e) => groupName(e) === group)
                    .map((entry) => {
                      const pending = running && entry.results.some((r) => !completed.includes(r.suite));
                      return (
                        <motion.div
                          key={entry.id}
                          layout={reduced || !boardVisible ? false : "position"}
                          initial={{ opacity: 1, y: reduced ? 0 : 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration }}
                        >
                          <button
                            className={styles.cell}
                            data-rule={entry.id}
                            data-signal={pending ? "PENDING" : entry.signal}
                            onClick={() => setSelected(entry)}
                            aria-expanded={selected?.id === entry.id}
                            aria-controls="invariant-detail"
                          >
                            <span className={styles.cellId}>
                              {entry.id}
                              <span aria-hidden="true">↗</span>
                            </span>
                            <strong>{displayText(entry.title)}</strong>
                            <span className={styles.cellState}>{pending ? "Checking" : labels[entry.signal]}</span>
                            {entry.flags.length > 0 && <span className={styles.flags}>{entry.flags.join(" / ")}</span>}
                          </button>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      </section>

      <section ref={guide} className={styles.guide} aria-labelledby="guide-title">
        <span className="eyebrow">Read the evidence in order</span>
        <h2 id="guide-title">Quote. Observe. Bound the claim.</h2>
        <div className={styles.readTrack}>
          <motion.div data-reading-progress style={{ scaleX: reduced ? 1 : reading }} />
        </div>
        <div className={styles.steps}>
          <ReadingReveal>
            <h3>Start with the rule</h3>
            <p>The pinned paper describes requirements. Every row keeps its quote, source lines and explicit gaps.</p>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <h3>Inspect the observation</h3>
            <p>
              The verifier, indexer audit, harness and spec differ run their existing checks against raw recordings.
            </p>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <h3>Keep the boundary</h3>
            <p>Agreement in public fields cannot prove runtime enforcement, honest execution or consensus finality.</p>
          </ReadingReveal>
        </div>
        <div className={styles.actions}>
          <MotionButton className={styles.button} onClick={download}>
            Download report
          </MotionButton>
          <MotionLink className={styles.button} href="/invariants/replay" download>
            Download raw inputs
          </MotionLink>
          <CopyButton
            text="node packages/cli/dist/cli.js invariants run --input invariant-inputs.json --json"
            label="Copy replay command"
          />
        </div>
        <p className={styles.caption}>
          The page rechecks immutable recordings. It does not run attacks, submit transactions or refresh public
          endpoints. The report download preserves the original page evaluation time.
        </p>
      </section>
      <Detail entry={selected} close={() => setSelected(null)} />
    </div>
  );
}
