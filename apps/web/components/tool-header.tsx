// SPDX-License-Identifier: Apache-2.0
"use client";
import { ViewTransition } from "react";
import { sections, tools } from "@/content/tools";
import { CopyButton } from "./controls";
import { ArrowUpRight, SectionIcon } from "./icons";
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

/**
 * A same-size slug marker avoids stretching wrapped titles. With `travel`, a named view transition carries it from
 * a card into the tool header on navigation. The header always travels. A card travels only while it is hovered or
 * focused, so other cards never fly to unrelated positions. @example <ToolMark slug="verify" travel={hovered} />
 */
export function ToolMark({ slug, travel = false }: { slug: string; travel?: boolean }) {
  const mark = (
    <span className={styles.mark} data-suite-tool={slug}>
      {slug}
    </span>
  );
  if (!travel) return mark;
  return (
    <ViewTransition name={`tool-mark-${slug}`} share="tool-morph" default="none">
      {mark}
    </ViewTransition>
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
          <MotionLink className={styles.sectionChip} href={sectionHref(section.id)}>
            <SectionIcon section={section.id} size={14} />
            {section.title}
          </MotionLink>
          <span className={`badge ${tool.status}`}>{tool.status}</span>
          <ToolMark slug={slug} travel />
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
          {command ? (
            <div className={styles.command}>
              <span className={styles.prompt} aria-hidden="true">
                $
              </span>
              <code>{command}</code>
              <CopyButton text={command} label="Copy command" />
            </div>
          ) : (
            <span className="muted">No flop subcommand registered</span>
          )}
          <MotionLink className="text-link" href={toolSource(tool)}>
            Source and guide <ArrowUpRight size={14} />
          </MotionLink>
        </div>
      </ReadingReveal>
    </div>
  );
}
