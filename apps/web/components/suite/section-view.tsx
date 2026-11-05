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

/** A registry section with explicitly dated evidence. @example <SectionView id="verify" evidence={evidence} /> */
export function SectionView({ id, evidence }: { id: Section; evidence: Record<string, SuiteMetric | null> }) {
  const section = sections.find((entry) => entry.id === id)!;
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
          <p className="eyebrow">The FLOP devnet suite / {section.title}</p>
          <h1>{section.title}</h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h2>{section.question}</h2>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="muted">{sectionNotes[id]}</p>
        </ReadingReveal>
        <div className={styles.summary}>
          <ObservedNumber value={available.length} /> available / {list.length} registered tools
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
        <p className="muted">
          Alpha is a release label. Every value below is a dated recording, not a current health claim.
        </p>
        {id === "identity" && (
          <p>
            <MotionLink href="/provenance">Check contribution and build signatures ↗</MotionLink>
          </p>
        )}
      </header>
      <section aria-label={`${section.title} tools`}>
        <div className={styles.filters} aria-label="Filter tool status">
          {["All", "Available", "Planned"].map((value) => (
            <MotionButton
              key={value}
              className="quiet-button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
            </MotionButton>
          ))}
        </div>
        <p className="muted" role="status">
          {shown.length} {shown.length === 1 ? "tool" : "tools"} shown
        </p>
        <div className={styles.cards}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((tool, index) => {
              const metric = evidence[tool.slug];
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
                        <ToolName slug={tool.slug}>{tool.name}</ToolName>
                      </MotionLink>
                    </h3>
                  </ReadingReveal>
                  <p>{tool.tagline}</p>
                  {tool.status === "planned" ? (
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
                        <MotionLink href={metric.source}>{metric.sourceLabel} ↗</MotionLink>
                        <MotionLink href={metric.recording}>Recording ↗</MotionLink>
                      </div>
                      <p>{metric.note}</p>
                    </div>
                  ) : (
                    <p className={styles.metric}>
                      No data. A dated section summary is unavailable. Open the tool to inspect its evidence.
                    </p>
                  )}
                  <MotionLink href={toolHref(tool)}>
                    {tool.status === "planned" ? "View source location" : "Open tool"} ↗
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
