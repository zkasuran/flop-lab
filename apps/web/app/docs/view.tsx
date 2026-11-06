// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "../../components/motion";
import { sections } from "../../content/tools";
import { searchDocs, type SearchDoc } from "./model";
import styles from "./docs.module.css";

/** Search the generated package index without a request. Example: <DocsSearch docs={index} />. */
export function DocsSearch({ docs }: { docs: SearchDoc[] }) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const reduced = useReducedMotion() !== false;
  const matches = searchDocs(docs, query, section);
  return (
    <>
      <div className={styles.search}>
        <label htmlFor="docs-search">Search titles, questions and README headings</label>
        <motion.input
          id="docs-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try escrow, budget or Python"
          whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
          transition={{ duration: reduced ? 0 : 0.15 }}
        />
        <div className={styles.filters} aria-label="Filter documentation by section">
          {[{ id: "all", title: "All sections" }, ...sections].map((item) => (
            <MotionButton key={item.id} aria-pressed={section === item.id} onClick={() => setSection(item.id)}>
              {item.title}
            </MotionButton>
          ))}
          {(query || section !== "all") && (
            <MotionButton
              onClick={() => {
                setQuery("");
                setSection("all");
              }}
            >
              Clear filters
            </MotionButton>
          )}
        </div>
      </div>
      <p role="status">
        <ObservedNumber value={matches.length} /> of {docs.length} package READMEs match this search.
      </p>
      <div className={styles.meter} aria-hidden="true">
        <motion.div
          animate={{ scaleX: docs.length ? matches.length / docs.length : 0 }}
          transition={{ duration: reduced ? 0 : 0.25 }}
        />
      </div>
      {matches.length === 0 && (
        <div className="panel">
          <h2>No matching README</h2>
          <p>Try a shorter term or clear the section filter. Planned tools appear below.</p>
        </div>
      )}
      {sections.map((group) => {
        const entries = matches.filter((doc) => doc.section === group.id);
        if (!entries.length) return null;
        return (
          <section className="section" key={group.id} aria-labelledby={`docs-${group.id}`}>
            <ReadingReveal>
              <h2 id={`docs-${group.id}`}>{group.title}</h2>
              <p className="muted">{group.question}</p>
            </ReadingReveal>
            <div className={styles.results}>
              {entries.map((doc, index) => (
                <motion.article
                  className={styles.card}
                  key={doc.slug}
                  layout={!reduced}
                  initial={false}
                  whileInView={{ y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.24 }}
                >
                  <ReadingReveal order={index % 2}>
                    <small>{doc.packageName}</small>
                    <h3>
                      <MotionLink href={`/docs/${doc.slug}`}>{doc.title} →</MotionLink>
                    </h3>
                    <p>{doc.question.split(/(?<=\?)\s/)[0]}</p>
                  </ReadingReveal>
                  <code>{doc.command ?? "Importable library"}</code>
                </motion.article>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** The rail tracks reading position, not verification. Example: <ReadingRail>README content</ReadingRail>. */
export function ReadingRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <div ref={ref}>
      <p className="muted">Reading progress</p>
      <div className={styles.meter} aria-hidden="true">
        <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
      </div>
      {children}
    </div>
  );
}
