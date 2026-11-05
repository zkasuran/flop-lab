// SPDX-License-Identifier: Apache-2.0
"use client";
import { motion, useReducedMotion } from "motion/react";
import { sections, tools } from "@/content/tools";
import { CopyButton } from "./controls";
import { MotionLink, ReadingReveal } from "./motion";
import { sectionHref, toolCommand, toolSource } from "./suite/catalogue";
import styles from "./suite/suite.module.css";

/** Keep the full name readable while the small route marker travels. @example <ToolName slug="verify">Settlement verifier</ToolName> */
export function ToolName({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <span className={styles.toolName} data-tool-name={slug}>
      {children}
    </span>
  );
}

/** A same-size shared marker avoids stretching wrapped titles. @example <ToolMark slug="verify" /> */
export function ToolMark({ slug }: { slug: string }) {
  const reduced = useReducedMotion() !== false;
  return (
    <motion.span
      className={styles.mark}
      data-suite-tool={slug}
      layoutId={reduced ? undefined : `suite-tool-${slug}`}
      transition={{ duration: reduced ? 0 : 0.3 }}
    >
      {slug}
    </motion.span>
  );
}

/** Registry-backed tool heading. Place inside the existing page hero. @example <ToolHeader slug="verify" /> */
export function ToolHeader({ slug, titleId }: { slug: string; titleId?: string }) {
  const tool = tools.find((entry) => entry.slug === slug);
  if (!tool) return null;
  const section = sections.find((entry) => entry.id === tool.section)!;
  const command = toolCommand(tool);
  return (
    <div className={styles.header} data-suite-header>
      <ReadingReveal>
        <div className={styles.crumbs}>
          <MotionLink href={sectionHref(section.id)}>{section.title}</MotionLink>
          <span aria-hidden="true">/</span>
          <span className={`badge ${tool.status}`}>{tool.status}</span>
          <ToolMark slug={slug} />
        </div>
        <h1 id={titleId}>
          <ToolName slug={slug}>{tool.name}</ToolName>
        </h1>
      </ReadingReveal>
      <ReadingReveal order={1}>
        <p className={styles.question}>{tool.tagline}</p>
      </ReadingReveal>
      <ReadingReveal order={2}>
        <div className={styles.headerActions}>
          <MotionLink href={toolSource(tool)}>Source and guide ↗</MotionLink>
          {command ? (
            <div className={styles.command}>
              <code>{command}</code>
              <CopyButton text={command} label="Copy command" />
            </div>
          ) : (
            <span className="muted">No flop subcommand registered</span>
          )}
        </div>
      </ReadingReveal>
    </div>
  );
}
