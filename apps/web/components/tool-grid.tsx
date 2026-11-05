// SPDX-License-Identifier: Apache-2.0
"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { sections, toolHref, toolsIn, type Tool } from "@/content/tools";
import { EASE_OUT, ReadingReveal } from "./motion";
import { ArrowRight, ArrowUpRight } from "./icons";
import { sectionHref } from "./suite/catalogue";
import { ToolMark } from "./tool-header";
import styles from "./home/home.module.css";

const STATUS: Record<Tool["status"], string> = { live: "Live", alpha: "Alpha", planned: "Planned" };

/** Release counts for one section, using registry labels only. Example: tally(toolsIn("verify")). */
function tally(list: readonly Tool[]): string {
  return (["live", "alpha", "planned"] as const)
    .map((status) => ({ status, count: list.filter((tool) => tool.status === status).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.status}`)
    .join(" / ");
}

/**
 * The suite index: six sections, one question per tool. A shared highlight follows the pointer within a section.
 * Available rows carry the shared ToolMark, so the route marker travels into the tool header on navigation.
 * The highlight layout IDs are unique per section, so no nested LayoutGroup ID is needed. A nested ID would
 * namespace the ToolMark and break that travel.
 */
export function ToolGrid() {
  const reduced = useReducedMotion() !== false;
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className={styles.index}>
      {sections.map((section, sectionIndex) => {
        const list = toolsIn(section.id);
        if (!list.length) return null;
        return (
          <section key={section.id} className={styles.indexSection} aria-labelledby={`section-${section.id}`}>
            <ReadingReveal className={styles.indexHead}>
              <span className={styles.indexNumber} aria-hidden="true">
                {String(sectionIndex + 1).padStart(2, "0")}
              </span>
              <h3 id={`section-${section.id}`}>
                <Link className={styles.indexTitle} href={sectionHref(section.id)}>
                  {section.title}
                  <ArrowRight size={16} />
                </Link>
              </h3>
              <p className="muted">{section.question}</p>
              <p className={styles.indexCount}>{tally(list)}</p>
            </ReadingReveal>
            <ul className={styles.indexList} onPointerLeave={() => setHovered(null)}>
              {list.map((tool) => {
                const planned = tool.status === "planned";
                return (
                  <li key={tool.slug}>
                    <Link
                      href={toolHref(tool)}
                      className={styles.toolRow}
                      data-status={tool.status}
                      onPointerEnter={() => setHovered(tool.slug)}
                      onFocus={() => setHovered(tool.slug)}
                      onBlur={() => setHovered((current) => (current === tool.slug ? null : current))}
                    >
                      {hovered === tool.slug && (
                        <motion.span
                          layoutId={`index-highlight-${section.id}`}
                          className={styles.rowHighlight}
                          transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
                        />
                      )}
                      <span className={styles.toolName}>{tool.name}</span>
                      <span className={styles.toolQuestion}>{tool.tagline}</span>
                      <span className={styles.toolStatus} data-status={tool.status}>
                        {STATUS[tool.status]}
                      </span>
                      <span className={styles.toolGo}>
                        {planned ? <code>{tool.repoPath}</code> : <ToolMark slug={tool.slug} />}
                        {planned ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
