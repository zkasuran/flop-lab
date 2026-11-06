// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import type { Reader, OpenItem, PublicIssue, SearchEntry } from "../../../../packages/yellowpaper/src/model";
import { searchIndex } from "../../../../packages/yellowpaper/src/search";
import styles from "./reader.module.css";

type Props = {
  reader: Pick<Reader, "sha" | "measuredAt" | "source" | "search" | "warnings"> & {
    headingCount: number;
    glossaryCount: number;
    openItemCount: number;
    parameters: (Pick<Reader["parameters"][number], "id" | "name" | "result" | "reason" | "runtime"> & {
      spec: { value: string; unit: string; evidence: { source: string; measuredAt: string } } | null;
    })[];
  };
  issues: (Pick<OpenItem, "id" | "title" | "status" | "internalReferences"> & {
    links: { issue: PublicIssue; relation: "cited" | "related" }[];
  })[];
  issuesMeasuredAt: string;
  children: ReactNode;
};
const labels = {
  MATCH: "Catalog agrees",
  DRIFT: "Catalog differs",
  SPEC_ONLY: "No catalog row",
  UNOBSERVABLE: "No catalog evidence",
  RUNTIME_ONLY: "Catalog only",
};
const filters = [
  { id: "all", label: "All" },
  { id: "heading", label: "Sections" },
  { id: "glossary", label: "Terms" },
  { id: "parameter", label: "Parameters" },
  { id: "open-item", label: "Open items" },
] as const;
const shown = (value: string) => value.replace(/[\u2013\u2014]/g, "-");

export function ReaderView({ reader, issues, issuesMeasuredAt, children }: Props) {
  const reduced = useReducedMotion() !== false;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | SearchEntry["kind"]>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const article = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: article, offset: ["start start", "end end"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const percent = useTransform(scrollYProgress, (value) => `${Math.round(value * 100)}%`);
  const matches = useMemo(
    () =>
      searchIndex(
        reader.search.filter((entry) => kind === "all" || entry.kind === kind),
        query,
        500,
      ),
    [reader.search, kind, query],
  );
  const parameter = reader.parameters.find((row) => row.name === selected);
  const known = reader.parameters.filter((row) => row.runtime !== null).length;

  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  useEffect(() => {
    const document = article.current;
    if (!document) return;
    if (location.hash) document.dataset.expanded = "true";
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        document.dataset.expanded = "true";
        observer.disconnect();
      }
    });
    observer.observe(document);
    return () => observer.disconnect();
  }, []);
  function openParameter(name: string, element: HTMLElement) {
    trigger.current = element;
    setSelected(name);
  }
  function closeParameter() {
    dialog.current?.close();
  }
  function jumpToParameter(id: string) {
    trigger.current = null;
    dialog.current?.close();
    history.pushState(history.state, "", `#${id}`);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "center" }));
  }
  function handleResult(entry: SearchEntry, element: HTMLElement) {
    if (entry.kind === "parameter" && reader.parameters.some((row) => row.name === entry.title)) {
      openParameter(entry.title, element);
      return true;
    }
    return false;
  }

  return (
    <div
      className={styles.page}
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('a[href^="#"]') && article.current)
          article.current.dataset.expanded = "true";
      }}
    >
      <section className={styles.hero}>
        <ToolHeader slug="yellowpaper" />
        <ReadingReveal order={2} className={styles.pin}>
          <p className="eyebrow">Pinned document · dated observations</p>
          <a href={reader.source}>
            Pinned at commit <code>{reader.sha.slice(0, 12)}</code> ↗
          </a>
          <p>
            Paper recorded <time dateTime={reader.measuredAt}>{reader.measuredAt}</time>
          </p>
          <div className={styles.counts}>
            <span>
              <ObservedNumber value={reader.headingCount} /> headings
            </span>
            <span>
              <ObservedNumber value={reader.glossaryCount} /> glossary entries
            </span>
            <span>
              <ObservedNumber value={reader.parameters.length} /> parameters
            </span>
          </div>
          <p className="muted">
            {known} of {reader.parameters.length} paper parameters have a catalog row. Catalog text is not a runtime
            storage read.
          </p>
          <div className={styles.coverage} aria-hidden="true">
            <motion.div
              initial={{ scaleX: reduced ? known / reader.parameters.length : 0 }}
              whileInView={{ scaleX: known / reader.parameters.length }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 0.4 }}
            />
          </div>
        </ReadingReveal>
      </section>

      <ReadingReveal order={3} className={styles.guide}>
        <p>
          <strong>Read, then inspect.</strong> Search a term or open a parameter link to see its pinned value beside the
          dated catalog observation. Section links move through the full paper.
        </p>
        <div className={styles.command}>
          <code>node packages/yellowpaper/dist/cli.js search dispute window</code>
          <CopyButton text="node packages/yellowpaper/dist/cli.js search dispute window" label="Copy reader command" />
        </div>
        <MotionButton
          className={styles.issueToggle}
          aria-expanded={showIssues}
          aria-controls="reader-issues"
          onClick={() => setShowIssues(!showIssues)}
        >
          {showIssues ? "Hide" : "Inspect"} public issue states <span>{reader.openItemCount} paper items</span>
        </MotionButton>
      </ReadingReveal>

      <AnimatePresence initial={false}>
        {showIssues && (
          <motion.section
            id="reader-issues"
            className={styles.issues}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            <h2>Open items and public discussions</h2>
            <p>
              Issue states recorded <time dateTime={issuesMeasuredAt}>{issuesMeasuredAt}</time>. Bare #NNN references
              belong to the internal tracker. Only explicit public citations and exact item mentions in recorded titles
              are linked below.
            </p>
            <p>
              The paper's status and an issue's state are separate. Related discussions do not establish a blocking
              issue.{" "}
              <MotionLink href="https://github.com/flop-labs/yellowpaper/issues/235">
                Appendix E erratum #235 ↗
              </MotionLink>
            </p>
            <div className={styles.issueGrid}>
              {issues.map((item) => (
                <article key={item.id}>
                  <a href={`#open-${item.id.toLowerCase()}`}>
                    <strong>{item.id}</strong> {shown(item.title)}
                  </a>
                  <p className={styles.status}>Paper status: {item.status}</p>
                  {item.links.length ? (
                    <ul>
                      {item.links.map(({ issue, relation }) => (
                        <li key={issue.number}>
                          <a href={issue.url}>
                            {relation === "cited" ? "Cited" : "Related"} #{issue.number}: {issue.state.toLowerCase()} ↗
                          </a>
                          <p className="muted">{shown(issue.title)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">
                      No public issue mapping in this recording. State unavailable.{" "}
                      <a
                        href={`https://github.com/flop-labs/yellowpaper/issues?q=${encodeURIComponent(`is:issue "${item.id}"`)}`}
                      >
                        Search public discussions ↗
                      </a>
                    </p>
                  )}
                  <p className="muted">
                    Internal references:{" "}
                    {item.internalReferences.length
                      ? item.internalReferences.map((number) => `#${number}`).join(", ")
                      : "none in this item"}
                  </p>
                </article>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className={styles.workspace}>
        <aside className={styles.index} aria-label="Paper index">
          <label htmlFor="paper-search">Find in the paper</label>
          <input
            id="paper-search"
            type="search"
            value={query}
            placeholder="Try dispute window"
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
          />
          <div className={styles.filters} role="group" aria-label="Search category">
            {filters.map((filter) => (
              <MotionButton key={filter.id} aria-pressed={kind === filter.id} onClick={() => setKind(filter.id)}>
                {kind === filter.id && (
                  <motion.span
                    className={styles.activeFilter}
                    layoutId={reduced ? undefined : "paper-filter"}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                  />
                )}
                <span>{filter.label}</span>
              </MotionButton>
            ))}
          </div>
          <p className={styles.matchCount} role="status">
            {Math.min(30, matches.length)} of {matches.length} matches
            {matches.length > 30 ? ". Narrow the search." : ""}
          </p>
          <nav className={styles.results} aria-label="Search results">
            <AnimatePresence initial={false} mode="popLayout">
              {matches.slice(0, 30).map((entry) => (
                <motion.a
                  layout={!reduced}
                  key={`${entry.kind}:${entry.title}`}
                  href={`#${entry.id}`}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.16 }}
                  whileHover={{ x: reduced ? 0 : 2 }}
                  whileTap={{ scale: reduced ? 1 : 0.99 }}
                  onClick={(event) => {
                    if (handleResult(entry, event.currentTarget)) event.preventDefault();
                  }}
                >
                  <span>{entry.kind === "open-item" ? "Open item" : entry.kind}</span>
                  {entry.title}
                </motion.a>
              ))}
            </AnimatePresence>
            {!matches.length && <p>No matching names. Try a shorter term.</p>}
          </nav>
          <MotionButton
            className={styles.reset}
            onClick={() => {
              setQuery("");
              setKind("all");
            }}
          >
            Reset search
          </MotionButton>
        </aside>

        <article
          ref={article}
          className={styles.document}
          aria-label="Full pinned yellowpaper"
          onClick={(event) => {
            if (!(event.target instanceof Element)) return;
            const link = event.target.closest<HTMLAnchorElement>('a[href^="#param-"]');
            if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const name = link.hash.slice("#param-".length);
            if (reader.parameters.some((row) => row.name === name)) {
              event.preventDefault();
              openParameter(name, link);
            }
          }}
        >
          <div className={styles.progress}>
            <span>
              Reading position <motion.span>{percent}</motion.span>
            </span>
            <a href="#paper-search">Back to search ↑</a>
            <div className={styles.progressTrack}>
              <motion.div data-reading-progress style={{ scaleX }} />
            </div>
          </div>
          {children}
        </article>
      </div>

      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          Catalog agreement does not verify deployed storage. The paper is a pinned draft and issue states are dated
          snapshots. Internal engineering tracker states, private code, inference correctness and proof execution are
          not checked. Equations and diagrams retain source notation. Display punctuation uses short hyphens.
        </p>
        <MotionLink href="/spec">Compare the paper with public evidence ↗</MotionLink>
      </section>

      <dialog
        ref={dialog}
        className={styles.drawer}
        aria-labelledby="parameter-heading"
        onClose={() => {
          setSelected(null);
          trigger.current?.focus();
        }}
      >
        <AnimatePresence initial={false} mode="wait">
          {parameter && (
            <motion.div
              key={parameter.id}
              className={styles.drawerBody}
              initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.24 }}
            >
              <div className={styles.drawerTop}>
                <span className="eyebrow">Parameter evidence</span>
                <MotionButton onClick={closeParameter} aria-label="Close parameter drawer">
                  Close ×
                </MotionButton>
              </div>
              <h2 id="parameter-heading">{shown(parameter.name)}</h2>
              <p className={styles.verdict}>{labels[parameter.result]}</p>
              <section>
                <h3>Pinned paper</h3>
                <p className={styles.value}>
                  {shown(`${parameter.spec?.value ?? "Unavailable"} ${parameter.spec?.unit ?? ""}`)}
                </p>
                <p>Recorded {parameter.spec?.evidence.measuredAt}</p>
                <a href={parameter.spec?.evidence.source}>Exact paper line ↗</a>
              </section>
              <section>
                <h3>Knowledge catalog observation</h3>
                <p className={styles.value}>
                  {parameter.runtime
                    ? shown(`${parameter.runtime.value} ${parameter.runtime.unit}`)
                    : "No observed value"}
                </p>
                {parameter.runtime && (
                  <>
                    <p>Recorded {parameter.runtime.evidence.measuredAt}</p>
                    <a href={parameter.runtime.evidence.source}>Source: flop_knowledge_get ↗</a>
                  </>
                )}
                <p>{shown(parameter.reason)}</p>
              </section>
              <p className={styles.caveat}>
                The spec differ's runtime model reads catalog text here. It does not read deployed parameter storage.
              </p>
              {reader.warnings.map((warning) => (
                <p key={warning} className="muted">
                  {shown(warning)}
                </p>
              ))}
              {parameter.runtime && (
                <details>
                  <summary>Recorded catalog quote</summary>
                  <pre>{shown(parameter.runtime.evidence.quote)}</pre>
                </details>
              )}
              <div className={styles.drawerActions}>
                <a
                  href={`#${reader.search.find((entry) => entry.kind === "parameter" && entry.title === parameter.name)?.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    const id = reader.search.find(
                      (entry) => entry.kind === "parameter" && entry.title === parameter.name,
                    )?.id;
                    if (id) jumpToParameter(id);
                  }}
                >
                  Read in Appendix A ↓
                </a>
                <CopyButton
                  text={`node packages/yellowpaper/dist/cli.js parameter ${parameter.name} --json`}
                  label="Copy parameter command"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </dialog>
    </div>
  );
}
