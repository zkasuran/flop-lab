// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useState, type PointerEvent } from "react";
import { sections, toolHref, tools, toolsIn, type Section, type Tool } from "@/content/tools";
import { ArrowRight, ArrowUpRight, SectionIcon } from "../icons";
import { EASE_OUT } from "../motion";
import { toolCommand } from "../suite/catalogue";
import { ToolMark } from "../tool-header";
import { common } from "@/app/zh/translations/common";
import { sectionCopy } from "@/app/zh/translations/sections";
import type { Locale } from "@/app/zh/translations/types";
import { BlockHeading } from "./block-heading";
import styles from "./landing.module.css";

type Filter = Section | "all";

/**
 * The tool index: tabs filter by section. On a mouse, a preview card follows the pointer with the tool's command
 * and source path. Available rows carry the shared ToolMark, which morphs into the tool header on navigation.
 * The Chinese pages reuse it with translated section names and questions. Tool names stay in English.
 * Example: <ToolIndex locale="zh" />.
 */
export function ToolIndex({ locale = "en" }: { locale?: Locale }) {
  const reduced = useReducedMotion() !== false;
  const c = common[locale];
  const [filter, setFilter] = useState<Filter>("observe");
  const [hovered, setHovered] = useState<Tool | null>(null);
  const [pointer, setPointer] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 380, damping: 34, mass: 0.6 };
  const px = useSpring(x, spring);
  const py = useSpring(y, spring);
  const list = filter === "all" ? tools : toolsIn(filter);
  const sectionTitle = (id: Section) => sectionCopy[id]?.[locale]?.title ?? sections.find((s) => s.id === id)?.title;
  const question = (tool: Tool) => sectionCopy[tool.section]?.[locale]?.[tool.slug];
  const status = (tool: Tool) => (locale === "zh" && tool.status === "planned" ? c.planned : tool.status);
  const options: { id: Filter; label: string; count: number }[] = [
    ...sections.map((section) => ({
      id: section.id,
      label: sectionTitle(section.id) ?? section.title,
      count: toolsIn(section.id).length,
    })),
    { id: "all", label: c.all, count: tools.length },
  ];
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const nextX = event.clientX - box.left + 28;
    const nextY = event.clientY - box.top - 24;
    if (!pointer) {
      px.jump(nextX);
      py.jump(nextY);
      setPointer(true);
    }
    x.set(nextX);
    y.set(nextY);
  };
  const command = hovered ? toolCommand(hovered) : null;
  return (
    <>
      <LayoutGroup id="universe">
        <div
          className={styles.filters}
          role="group"
          aria-label={locale === "zh" ? c.sections : "Filter tools by section"}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={styles.filter}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {filter === option.id && (
                <motion.span
                  layoutId="universe-filter"
                  className={styles.filterPill}
                  transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
                />
              )}
              <span className={styles.filterText}>
                {option.id !== "all" && <SectionIcon section={option.id} size={14} />}
                {option.label}
                <span className={styles.filterCount}>{option.count}</span>
              </span>
            </button>
          ))}
        </div>
      </LayoutGroup>
      <div
        className={styles.universe}
        onPointerMove={move}
        onPointerLeave={() => {
          setHovered(null);
          setPointer(false);
        }}
      >
        <p className="sr-only" role="status">
          {locale === "zh"
            ? `${c.shown}: ${list.length} ${c.tools}`
            : `${list.length} ${list.length === 1 ? "tool" : "tools"} shown`}
        </p>
        <ul className={styles.rows}>
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((tool, index) => {
              const planned = tool.status === "planned";
              return (
                <motion.li
                  key={tool.slug}
                  layout={!reduced}
                  initial={{ opacity: 0, y: reduced ? 0 : 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.12 } }}
                  transition={{ duration: reduced ? 0 : 0.34, ease: EASE_OUT, delay: reduced ? 0 : index * 0.025 }}
                >
                  <Link
                    prefetch={false}
                    href={toolHref(tool)}
                    className={styles.row}
                    data-status={tool.status}
                    onPointerEnter={() => setHovered(tool)}
                    onFocus={() => setHovered(tool)}
                    onBlur={() => setHovered((current) => (current?.slug === tool.slug ? null : current))}
                  >
                    <span className={styles.rowIndex} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.rowName} lang="en">
                      {tool.name}
                    </span>
                    <span className={styles.rowQuestion} lang={locale === "zh" && !question(tool) ? "en" : undefined}>
                      {question(tool) ?? tool.tagline}
                    </span>
                    <span className={`badge ${tool.status}`}>{status(tool)}</span>
                    <span className={styles.rowGo}>
                      {planned ? (
                        <code title={tool.repoPath}>{tool.repoPath}</code>
                      ) : (
                        <ToolMark slug={tool.slug} travel={hovered?.slug === tool.slug} />
                      )}
                      {planned ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        <AnimatePresence>
          {hovered && pointer && !reduced && (
            <motion.div
              key="preview"
              className={styles.preview}
              style={{ x: px, y: py }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              aria-hidden="true"
            >
              <span className={styles.previewTop}>
                <SectionIcon section={hovered.section} size={14} />
                {sectionTitle(hovered.section)}
                <span className={`badge ${hovered.status}`}>{status(hovered)}</span>
              </span>
              <span className={styles.previewName}>{hovered.name}</span>
              <span className={styles.previewCommand}>
                {hovered.status === "planned" ? (
                  "Planned. Opens the source location."
                ) : command ? (
                  <>
                    <span className={styles.previewPrompt}>$</span> {command}
                  </>
                ) : (
                  "No flop subcommand registered"
                )}
              </span>
              <span className={`mono ${styles.previewPath}`}>{hovered.repoPath}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** The landing section: a heading, then the tool index. Example: <ToolUniverse />. */
export function ToolUniverse() {
  const available = tools.filter((tool) => tool.status !== "planned").length;
  return (
    <section className={styles.block} id="tools" aria-labelledby="tools-title">
      <BlockHeading
        id="tools-title"
        eyebrow="The workbench"
        title="One suite. One question per tool."
        lede={
          <>
            {available} tools run today on real devnet data. {tools.length - available} more are planned and link to
            their source. Search the{" "}
            <Link href="/docs" prefetch={false}>
              package guides
            </Link>{" "}
            for a command and its limits.
          </>
        }
      />
      <ToolIndex />
    </section>
  );
}
