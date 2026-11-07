// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { sections, toolsIn, toolHref, type Section } from "@/content/tools";
import { common } from "@/app/zh/translations/common";
import { sectionCopy } from "@/app/zh/translations/sections";
import type { Locale } from "@/app/zh/translations/types";
import { EASE_OUT, MotionButton, MotionLink, ObservedNumber, ReadingPath } from "../motion";
import { ArrowRight, ArrowUpRight, SectionIcon } from "../icons";
import { ToolMark, ToolName } from "../tool-header";
import { sectionNotes } from "./catalogue";
import type { SuiteMetric } from "./metric";
import styles from "./suite.module.css";

/**
 * A registry section with explicitly dated evidence. The Chinese version translates the page copy and keeps tool
 * names, recorded values, times and source links as they were captured.
 * @example <SectionView id="verify" evidence={evidence} locale="zh" />
 */
export function SectionView({
  id,
  evidence,
  locale = "en",
}: {
  id: Section;
  evidence: Record<string, SuiteMetric | null>;
  locale?: Locale;
}) {
  const section = sections.find((entry) => entry.id === id)!;
  const index = sections.findIndex((entry) => entry.id === id);
  const c = common[locale];
  const copy = sectionCopy[id]?.[locale];
  const title = copy?.title ?? section.title;
  const untranslated = locale === "zh" && !copy;
  const list = toolsIn(id);
  const [filter, setFilter] = useState<"All" | "Available" | "Planned">("All");
  const [hovered, setHovered] = useState<string | null>(null);
  const reduced = useReducedMotion() !== false;
  const available = list.filter((tool) => tool.status !== "planned");
  const shown = list.filter(
    (tool) => filter === "All" || (filter === "Available" ? tool.status !== "planned" : tool.status === "planned"),
  );
  const ratio = list.length ? available.length / list.length : 0;
  const number = String(index + 1).padStart(2, "0");
  return (
    <>
      <header className={`page-heading page-hero ${styles.hero}`}>
        <p className="eyebrow page-hero-eyebrow">
          <span aria-hidden="true" />
          {c.suite} / {locale === "zh" ? number : `Section ${number}`}
        </p>
        <div className={styles.heroTitle}>
          <span className={styles.heroIcon} aria-hidden="true">
            <SectionIcon section={id} size={30} />
          </span>
          <h1 lang={untranslated ? "en" : undefined}>
            <span className="split-word">
              <span>{title}</span>
            </span>
          </h1>
        </div>
        <h2 className={styles.heroQuestion} lang={untranslated ? "en" : undefined}>
          {copy?.question ?? section.question}
        </h2>
        <p className="intro" lang={untranslated ? "en" : undefined}>
          {copy?.note ?? sectionNotes[id]}
        </p>
        {untranslated && <p className="muted">{c.partial}</p>}
        <div className={styles.summary}>
          <span className={styles.summaryCount}>
            <ObservedNumber value={available.length} />
            <span className="muted">
              {" "}
              {c.available} / {list.length} {c.registered}
            </span>
          </span>
          <div className={styles.track} aria-hidden="true">
            <motion.div
              className={styles.fill}
              initial={{ scaleX: reduced ? ratio : 0 }}
              whileInView={{ scaleX: ratio }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 0.6, ease: EASE_OUT }}
            />
          </div>
          <p className="muted">{c.release}</p>
        </div>
        {id === "identity" && (
          <p>
            <MotionLink className="text-link" href="/provenance">
              {c.signatures} <ArrowUpRight size={14} />
            </MotionLink>
          </p>
        )}
      </header>
      <section aria-label={`${title} ${c.tools}`}>
        <div className={styles.toolbar}>
          <LayoutGroup id="section-filter">
            <div className={styles.filters} role="group" aria-label={c.statusFilter}>
              {(["All", "Available", "Planned"] as const).map((value) => (
                <MotionButton
                  key={value}
                  className={styles.filter}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {filter === value && (
                    <motion.span
                      layoutId="section-filter-pill"
                      className={styles.filterPill}
                      transition={{ duration: reduced ? 0 : 0.28, ease: EASE_OUT }}
                    />
                  )}
                  <span className={styles.filterText}>
                    {{ All: c.all, Available: c.available, Planned: c.planned }[value]}
                  </span>
                </MotionButton>
              ))}
            </div>
          </LayoutGroup>
          <p className="muted" role="status">
            {locale === "zh"
              ? `${c.shown}: ${shown.length} ${c.tools}`
              : `${shown.length} ${shown.length === 1 ? "tool" : "tools"} shown`}
          </p>
        </div>
        <div className={styles.cards}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((tool, order) => {
              const metric = evidence[tool.slug];
              const translatedMetric = locale === "zh" ? sectionCopy[id]?.metrics?.[tool.slug] : undefined;
              const question = copy?.[tool.slug];
              const planned = tool.status === "planned";
              return (
                <motion.article
                  key={tool.slug}
                  className={`${styles.card} reveal`}
                  data-spotlight
                  data-status={tool.status}
                  layout={!reduced}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT, delay: reduced ? 0 : order * 0.03 }}
                  onPointerEnter={() => setHovered(tool.slug)}
                  onFocus={() => setHovered(tool.slug)}
                >
                  <div className={styles.cardTop}>
                    {planned ? (
                      <code className={styles.path}>{tool.repoPath}</code>
                    ) : (
                      <ToolMark slug={tool.slug} travel={hovered === tool.slug} />
                    )}
                    <span className={`badge ${tool.status}`}>
                      {locale === "zh" && planned ? c.planned : tool.status}
                    </span>
                  </div>
                  <h3>
                    <MotionLink href={toolHref(tool)}>
                      <ToolName slug={tool.slug}>
                        <span lang="en">{tool.name}</span>
                      </ToolName>
                    </MotionLink>
                  </h3>
                  <p lang={locale === "zh" && !question ? "en" : undefined}>{question ?? tool.tagline}</p>
                  {planned ? (
                    <p className={styles.metric}>{c.plannedNote}</p>
                  ) : metric ? (
                    <div className={styles.metric}>
                      <strong>
                        <ObservedNumber value={metric.value} />
                      </strong>
                      <p lang={locale === "zh" && !translatedMetric ? "en" : undefined}>
                        {translatedMetric?.label ?? metric.label}
                      </p>
                      <small>{c.recorded}</small>
                      <time dateTime={metric.measuredAt}>{metric.measuredAt}</time>
                      <div className={styles.evidenceLinks}>
                        <MotionLink href={metric.source}>
                          {locale === "zh" ? c.source : metric.sourceLabel} <ArrowUpRight size={12} />
                        </MotionLink>
                        <MotionLink href={metric.recording}>
                          {c.recording} <ArrowUpRight size={12} />
                        </MotionLink>
                      </div>
                      {locale === "zh" && !translatedMetric && <small>{c.english}</small>}
                      <p lang={locale === "zh" && !translatedMetric ? "en" : undefined}>
                        {translatedMetric?.note ?? metric.note}
                      </p>
                    </div>
                  ) : (
                    <p className={styles.metric}>{c.noData}</p>
                  )}
                  <MotionLink className={styles.open} href={toolHref(tool)}>
                    {planned ? c.sourceLocation : c.open}
                    {planned ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}
                  </MotionLink>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
        {!shown.length && <p className={styles.empty}>{c.empty}</p>}
      </section>
      <ReadingPath
        title={c.guide}
        label={c.guideLabel}
        note={c.guideNote}
        steps={[
          { title: c.choose, text: c.chooseText },
          { title: c.date, text: c.dateText },
          { title: c.boundary, text: c.boundaryText },
        ]}
      />
    </>
  );
}
