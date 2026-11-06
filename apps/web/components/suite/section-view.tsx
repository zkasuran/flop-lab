// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { sections, toolsIn, toolHref, type Section } from "@/content/tools";
import { EASE_OUT, MotionButton, MotionLink, ObservedNumber, ReadingPath } from "../motion";
import { ArrowRight, ArrowUpRight, SectionIcon } from "../icons";
import { ToolMark, ToolName } from "../tool-header";
import { sectionNotes } from "./catalogue";
import type { SuiteMetric } from "./metric";
import styles from "./suite.module.css";

/** A registry section with explicitly dated evidence. @example <SectionView id="verify" evidence={evidence} /> */
export function SectionView({ id, evidence }: { id: Section; evidence: Record<string, SuiteMetric | null> }) {
  const section = sections.find((entry) => entry.id === id)!;
  const index = sections.findIndex((entry) => entry.id === id);
  const list = toolsIn(id);
  const [filter, setFilter] = useState("All");
  const [hovered, setHovered] = useState<string | null>(null);
  const reduced = useReducedMotion() !== false;
  const available = list.filter((tool) => tool.status !== "planned");
  const shown = list.filter(
    (tool) => filter === "All" || (filter === "Available" ? tool.status !== "planned" : tool.status === "planned"),
  );
  const ratio = list.length ? available.length / list.length : 0;
  return (
    <>
      <header className={`page-heading page-hero ${styles.hero}`}>
        <p className="eyebrow page-hero-eyebrow">
          <span aria-hidden="true" />
          The FLOP devnet suite / Section {String(index + 1).padStart(2, "0")}
        </p>
        <div className={styles.heroTitle}>
          <span className={styles.heroIcon} aria-hidden="true">
            <SectionIcon section={id} size={30} />
          </span>
          <h1>
            <span className="split-word">
              <span>{section.title}</span>
            </span>
          </h1>
        </div>
        <h2 className={styles.heroQuestion}>{section.question}</h2>
        <p className="intro">{sectionNotes[id]}</p>
        <div className={styles.summary}>
          <span className={styles.summaryCount}>
            <ObservedNumber value={available.length} />
            <span className="muted"> available / {list.length} registered tools</span>
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
          <p className="muted">Alpha is a release label. Every value below is a dated recording, not a health claim.</p>
        </div>
        {id === "identity" && (
          <p>
            <MotionLink className="text-link" href="/provenance">
              Check contribution and build signatures <ArrowUpRight size={14} />
            </MotionLink>
          </p>
        )}
      </header>
      <section aria-label={`${section.title} tools`}>
        <div className={styles.toolbar}>
          <LayoutGroup id="section-filter">
            <div className={styles.filters} role="group" aria-label="Filter tool status">
              {["All", "Available", "Planned"].map((value) => (
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
                  <span className={styles.filterText}>{value}</span>
                </MotionButton>
              ))}
            </div>
          </LayoutGroup>
          <p className="muted" role="status">
            {shown.length} {shown.length === 1 ? "tool" : "tools"} shown
          </p>
        </div>
        <div className={styles.cards}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((tool, order) => {
              const metric = evidence[tool.slug];
              const planned = tool.status === "planned";
              return (
                <motion.article
                  key={tool.slug}
                  className={styles.card}
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
                    <span className={`badge ${tool.status}`}>{tool.status}</span>
                  </div>
                  <h3>
                    <MotionLink href={toolHref(tool)}>
                      <ToolName slug={tool.slug}>{tool.name}</ToolName>
                    </MotionLink>
                  </h3>
                  <p>{tool.tagline}</p>
                  {planned ? (
                    <p className={styles.metric}>Planned. No observation is claimed.</p>
                  ) : metric ? (
                    <div className={styles.metric}>
                      <strong>
                        <ObservedNumber value={metric.value} />
                      </strong>
                      <p>{metric.label}</p>
                      <small>Recorded / last known</small>
                      <time dateTime={metric.measuredAt}>{metric.measuredAt}</time>
                      <div className={styles.evidenceLinks}>
                        <MotionLink href={metric.source}>
                          {metric.sourceLabel} <ArrowUpRight size={12} />
                        </MotionLink>
                        <MotionLink href={metric.recording}>
                          Recording <ArrowUpRight size={12} />
                        </MotionLink>
                      </div>
                      <p>{metric.note}</p>
                    </div>
                  ) : (
                    <p className={styles.metric}>
                      No data. A dated section summary is unavailable. Open the tool to inspect its evidence.
                    </p>
                  )}
                  <MotionLink className={styles.open} href={toolHref(tool)}>
                    {planned ? "View source location" : "Open tool"}
                    {planned ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}
                  </MotionLink>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
        {!shown.length && (
          <p className={styles.empty}>No tools in this view. Choose another status to explore this section.</p>
        )}
      </section>
      <ReadingPath
        title="From a question to evidence"
        steps={[
          {
            title: "Choose a tool",
            text: "Start with the question it answers. Planned tools link to their source location.",
          },
          {
            title: "Read the date and source",
            text: "A recorded value describes its capture. Public devnet data can change or disappear after a reset.",
          },
          {
            title: "Inspect the boundary",
            text: "Open the tool for its full evidence and reproduction command. A passing check covers only the stated claim.",
          },
        ]}
      />
    </>
  );
}
