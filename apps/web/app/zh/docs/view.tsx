// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import type { SearchEntry } from "@/components/suite/catalogue";
import { common } from "../translations/common";
import { docs } from "../translations/docs";
import type { Locale } from "../translations/types";
import { searchDocuments } from "./model";
import styles from "../zh.module.css";

/** A bilingual index over the shared README heading catalogue. @example <DocsView locale="zh" entries={entries} /> */
export function DocsView({ locale, entries }: { locale: Locale; entries: readonly SearchEntry[] }) {
  const c = docs[locale];
  const shared = common[locale];
  const reduced = useReducedMotion() !== false;
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const found = searchDocuments(entries, query);
  const total = entries.filter((entry) => entry.kind === "Docs").length;
  return (
    <>
      <header className={styles.hero}>
        <ReadingReveal>
          <p className="eyebrow">{c.title}</p>
          <h1>{c.question}</h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <p>{c.intro}</p>
          <div className={styles.actions}>
            <MotionLink href="https://docs.flop.network">{c.protocol} ↗</MotionLink>
            <MotionLink href="/knowledge">{c.catalog} →</MotionLink>
          </div>
        </ReadingReveal>
      </header>
      <section aria-label={c.title}>
        <label htmlFor="docs-search">{c.search}</label>
        <input
          id="docs-search"
          className={styles.search}
          type="search"
          value={query}
          placeholder={c.placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(24);
          }}
        />
        <MotionButton
          className="quiet-button"
          onClick={() => {
            setQuery("");
            setLimit(24);
          }}
        >
          {c.clear}
        </MotionButton>
        <p role="status">
          <ObservedNumber value={found.length} /> {c.count} / {total} {c.total}
        </p>
        <p className="muted">{c.english}</p>
        <ul className={styles.list}>
          <AnimatePresence initial={false} mode="popLayout">
            {found.slice(0, limit).map((entry) => (
              <motion.li
                key={entry.id}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
              >
                <MotionLink href={entry.href} lang="en">
                  {entry.title} ↗
                </MotionLink>
                <span className={styles.meta} lang="en">
                  {entry.detail}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {!found.length && <p>{c.empty}</p>}
        {limit < found.length && (
          <MotionButton className="quiet-button" onClick={() => setLimit(limit + 24)}>
            {c.more}
          </MotionButton>
        )}
      </section>
      <ReadingPath
        title={c.guide}
        label={shared.guideLabel}
        note={shared.guideNote}
        steps={[
          { title: c.step1, text: c.text1 },
          { title: c.step2, text: c.text2 },
          { title: c.step3, text: c.text3 },
        ]}
      />
      <p className="muted">{c.sourceNote}</p>
    </>
  );
}
