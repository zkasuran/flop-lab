// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sections, tools, toolsIn, type Tool } from "@/content/tools";
import { common } from "@/app/zh/translations/common";
import { ArrowLeft, ArrowRight, SectionIcon } from "../icons";
import { EASE_OUT } from "../motion";
import { sectionHref } from "../suite/catalogue";
import { pathLocale } from "./locale";
import { sectionLink, sectionText } from "./mega-menu";
import { ToolMark } from "../tool-header";
import styles from "./tool-context.module.css";

/** The available tool behind a route, if any. Example: currentTool("/verify")?.section is "verify". */
function currentTool(path: string): Tool | null {
  return tools.find((tool) => tool.status !== "planned" && tool.href === path) ?? null;
}

/** Available tools that share a section, in registry order. Example: siblings(tool). */
function siblings(tool: Tool): readonly Tool[] {
  return toolsIn(tool.section).filter((entry) => entry.status !== "planned");
}

/**
 * Keep the current item in view in a horizontally scrolling list and report whether the list overflows, so the
 * fade mask only appears when there is more to scroll. Example: const { ref, overflow } = useCenteredList(path);
 */
function useCenteredList(path: string) {
  const ref = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const measure = () => setOverflow(list.scrollWidth > list.clientWidth + 1);
    measure();
    const active = list.querySelector<HTMLElement>("[aria-current='page']");
    if (active) {
      const offset = active.getBoundingClientRect().left - list.getBoundingClientRect().left;
      list.scrollLeft += offset - (list.clientWidth - active.offsetWidth) / 2;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [path]);
  return { ref, overflow };
}

/**
 * Context navigation under the header. On a tool page it lists the other available tools in the same section,
 * with previous and next. On a section page it switches between the six sections. Other pages render nothing.
 * Example: <ToolContext />.
 */
export function ToolContext() {
  const { locale, base } = pathLocale(usePathname());
  const path = base;
  const reduced = useReducedMotion() !== false;
  const { ref, overflow } = useCenteredList(path);
  const tool = currentTool(path);
  const sectionPage = sections.find((section) => path === sectionHref(section.id));
  const pill = (
    <motion.span
      layoutId="context-pill"
      className={styles.pill}
      transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
    />
  );
  if (sectionPage) {
    return (
      <nav className={styles.context} aria-label={common[locale].sections} lang={locale === "zh" ? "zh-Hans" : "en"}>
        <LayoutGroup id="context">
          <ul ref={ref} className={styles.list} data-overflow={overflow}>
            {sections.map((section, index) => {
              const active = section.id === sectionPage.id;
              return (
                <li key={section.id}>
                  <Link
                    className={styles.item}
                    href={sectionLink(section.id, locale)}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                  >
                    {active && pill}
                    <span className={styles.itemText}>
                      <span className={styles.index} aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span lang={sectionText(section.id, locale).translated ? undefined : "en"}>
                        {sectionText(section.id, locale).title}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
      </nav>
    );
  }
  if (!tool) return null;
  const section = sections.find((entry) => entry.id === tool.section)!;
  const list = siblings(tool);
  const at = list.findIndex((entry) => entry.slug === tool.slug);
  const previous = list[(at - 1 + list.length) % list.length];
  const next = list[(at + 1) % list.length];
  return (
    <nav className={styles.context} aria-label={`${section.title} tools`}>
      <Link prefetch={false} className={styles.section} href={sectionHref(section.id)}>
        <SectionIcon section={section.id} size={15} />
        {section.title}
      </Link>
      <span className={styles.divider} aria-hidden="true" />
      <LayoutGroup id="context">
        <ul ref={ref} className={styles.list} data-overflow={overflow}>
          {list.map((entry) => {
            const active = entry.slug === tool.slug;
            return (
              <li key={entry.slug}>
                <Link
                  prefetch={false}
                  className={styles.item}
                  href={entry.href}
                  aria-current={active ? "page" : undefined}
                >
                  {active && pill}
                  <span className={styles.itemText}>{entry.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
      {list.length > 1 && previous && next && (
        <div className={styles.step}>
          <Link
            prefetch={false}
            className="icon-button"
            href={previous.href}
            aria-label={`Previous tool: ${previous.name}`}
          >
            <ArrowLeft size={14} />
          </Link>
          <Link prefetch={false} className="icon-button" href={next.href} aria-label={`Next tool: ${next.name}`}>
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </nav>
  );
}

/**
 * A tool card whose slug marker morphs into the tool header when the card is followed. The marker is named only
 * while the card is hovered or focused. Example: <ToolCard tool={tool} hint="Next" />.
 */
export function ToolCard({ tool, hint }: { tool: Tool; hint: string }) {
  const [active, setActive] = useState(false);
  return (
    <Link
      prefetch={false}
      className={styles.card}
      href={tool.href}
      data-spotlight
      data-cursor="open"
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <span className={styles.cardTop}>
        <ToolMark slug={tool.slug} travel={active} />
        <span className={styles.cardHint}>{hint}</span>
      </span>
      <span className={styles.cardName}>{tool.name}</span>
      <span className={styles.cardTag}>{tool.tagline}</span>
      <span className={styles.cardGo} aria-hidden="true">
        <ArrowRight />
      </span>
    </Link>
  );
}

/**
 * Related tools at the end of a tool page: the next tools in its section. The marker on the followed card morphs
 * into that tool's header. Example: <ToolRelated />.
 */
export function ToolRelated() {
  const path = usePathname();
  const tool = currentTool(path);
  if (!tool) return null;
  const section = sections.find((entry) => entry.id === tool.section)!;
  const list = siblings(tool);
  const at = list.findIndex((entry) => entry.slug === tool.slug);
  const related = [1, 2, 3]
    .map((step) => list[(at + step) % list.length])
    .filter((entry): entry is Tool => entry !== undefined && entry.slug !== tool.slug)
    .filter((entry, index, all) => all.findIndex((other) => other.slug === entry.slug) === index);
  const others = sections.filter((entry) => entry.id !== section.id).slice(0, 3);
  return (
    <section className={styles.related} aria-labelledby="related-title">
      <div className={styles.relatedHead}>
        <p className="eyebrow">Keep checking</p>
        <h2 id="related-title">{related.length ? `More in ${section.title}` : `Explore the other sections`}</h2>
      </div>
      <ul className={styles.relatedGrid}>
        {related.map((entry, index) => (
          <li key={entry.slug}>
            <ToolCard tool={entry} hint={index === 0 ? "Next" : "Also in this section"} />
          </li>
        ))}
        {!related.length &&
          others.map((entry) => (
            <li key={entry.id}>
              <Link prefetch={false} className={styles.card} href={sectionHref(entry.id)} data-spotlight>
                <span className={styles.cardTop}>
                  <SectionIcon section={entry.id} size={16} />
                </span>
                <span className={styles.cardName}>{entry.title}</span>
                <span className={styles.cardTag}>{entry.question}</span>
                <span className={styles.cardGo} aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
