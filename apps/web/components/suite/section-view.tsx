// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { sections, toolsIn, toolHref, type Section } from "@/content/tools";
import { MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "../motion";
import { ToolMark, ToolName } from "../tool-header";
import { sectionNotes } from "./catalogue";
import type { SuiteMetric } from "./metric";
import styles from "./suite.module.css";
import { common } from "@/app/zh/translations/common";
import { sectionCopy } from "@/app/zh/translations/sections";
import type { Locale } from "@/app/zh/translations/types";

/** A registry section with explicitly dated evidence. @example <SectionView id="verify" evidence={evidence} /> */
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
  const c = common[locale];
  const copy = sectionCopy[id]?.[locale];
  const title = copy?.title ?? section.title;
  const list = toolsIn(id);
  const [filter, setFilter] = useState("All");
  const reduced = useReducedMotion() !== false;
  const available = list.filter((tool) => tool.status !== "planned");
  const shown = list.filter(
    (tool) => filter === "All" || (filter === "Available" ? tool.status !== "planned" : tool.status === "planned"),
  );
  const ratio = list.length ? available.length / list.length : 0;
  return (
    <>
      <header className={styles.hero}>
        <ReadingReveal>
          <p className="eyebrow">
            {c.suite} / {title}
          </p>
          <h1 lang={copy ? undefined : "en"}>{title}</h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h2 lang={copy ? undefined : "en"}>{copy?.question ?? section.question}</h2>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="muted" lang={copy ? undefined : "en"}>
            {copy?.note ?? sectionNotes[id]}
          </p>
          {locale === "zh" && !copy && <p className="muted">{c.partial}</p>}
        </ReadingReveal>
        <div className={styles.summary}>
          <ObservedNumber value={available.length} /> {c.available} / {list.length} {c.registered}
          <div className={styles.track} aria-hidden="true">
            <motion.div
              className={styles.fill}
              initial={{ scaleX: reduced ? ratio : 0 }}
              whileInView={{ scaleX: ratio }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 0.4 }}
            />
          </div>
        </div>
        <p className="muted">{c.release}</p>
        {id === "identity" && (
          <p>
            <MotionLink href="/provenance">{c.signatures} ↗</MotionLink>
          </p>
        )}
      </header>
      <section aria-label={`${title} ${c.tools}`}>
        <div className={styles.filters} aria-label={c.statusFilter}>
          {(["All", "Available", "Planned"] as const).map((value) => (
            <MotionButton
              key={value}
              className="quiet-button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {{ All: c.all, Available: c.available, Planned: c.planned }[value]}
            </MotionButton>
          ))}
        </div>
        <p className="muted" role="status">
          {locale === "zh"
            ? `${c.shown}: ${shown.length} ${c.tools}`
            : `${shown.length} ${shown.length === 1 ? "tool" : "tools"} shown`}
        </p>
        <div className={styles.cards}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((tool, index) => {
              const metric = evidence[tool.slug];
              const translatedMetric = locale === "zh" ? sectionCopy[id]?.metrics?.[tool.slug] : undefined;
              return (
                <motion.article
                  key={tool.slug}
                  className={styles.card}
                  layout={!reduced}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <ReadingReveal order={index}>
                    <div className={styles.cardTop}>
                      <ToolMark slug={tool.slug} />
                      <span className={`badge ${tool.status}`}>{tool.status}</span>
                    </div>
                    <h3>
                      <MotionLink href={toolHref(tool)}>
                        <ToolName slug={tool.slug}>
                          <span lang="en">{tool.name}</span>
                        </ToolName>
                      </MotionLink>
                    </h3>
                  </ReadingReveal>
                  <p lang={copy?.[tool.slug] ? undefined : "en"}>{copy?.[tool.slug] ?? tool.tagline}</p>
                  {tool.status === "planned" ? (
                    <p className={styles.metric}>{c.plannedNote}</p>
                  ) : metric ? (
                    <div className={styles.metric}>
                      <strong>
                        <ObservedNumber value={metric.value} />
                      </strong>
                      <p lang={translatedMetric ? undefined : "en"}>{translatedMetric?.label ?? metric.label}</p>
                      <small>{c.recorded}</small>
                      <time dateTime={metric.measuredAt}>{metric.measuredAt}</time>
                      <div className={styles.evidenceLinks}>
                        <MotionLink href={metric.source}>
                          {locale === "zh" ? c.source : metric.sourceLabel} ↗
                        </MotionLink>
                        <MotionLink href={metric.recording}>{c.recording} ↗</MotionLink>
                      </div>
                      {locale === "zh" && !translatedMetric && <small>{c.english}</small>}
                      <p lang={translatedMetric ? undefined : "en"}>{translatedMetric?.note ?? metric.note}</p>
                    </div>
                  ) : (
                    <p className={styles.metric}>{c.noData}</p>
                  )}
                  <MotionLink href={toolHref(tool)}>
                    {tool.status === "planned" ? c.sourceLocation : c.open} ↗
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
          {
            title: c.choose,
            text: c.chooseText,
          },
          {
            title: c.date,
            text: c.dateText,
          },
          {
            title: c.boundary,
            text: c.boundaryText,
          },
        ]}
      />
    </>
  );
}
