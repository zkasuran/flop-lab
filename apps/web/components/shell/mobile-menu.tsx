// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { repository, sections, toolHref, toolsIn, type Section } from "@/content/tools";
import { common } from "@/app/zh/translations/common";
import { fill, shell } from "@/app/zh/translations/shell";
import type { Locale } from "@/app/zh/translations/types";
import { ArrowRight, ArrowUpRight, ChevronDown, GitHubIcon, SectionIcon } from "../icons";
import { EASE_OUT } from "../motion";
import { LiveBlock } from "./live-block";
import { availability, sectionLink, sectionText } from "./mega-menu";
import styles from "./header.module.css";

/**
 * Full-screen navigation for small screens. Sections expand in place to list their tools. Page scroll is locked
 * while it is open, and the page behind it leaves the tab order. Example: <MobileMenu open onClose={close} current="verify" path="/verify" locale="en" />.
 */
export function MobileMenu({
  open,
  onClose,
  current,
  path,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  current: Section | null;
  path: string;
  locale: Locale;
}) {
  const reduced = useReducedMotion() !== false;
  const c = common[locale];
  const t = shell[locale];
  const [expanded, setExpanded] = useState<Section | null>(current);
  const panel = useRef<HTMLDivElement>(null);
  const links = [
    { href: "/network", label: t.network },
    { href: "/findings", label: c.findings },
    { href: locale === "zh" ? "/zh/docs" : "/docs", label: c.docs },
    { href: "/about", label: t.howMade },
    { href: "/provenance", label: t.provenance },
  ];
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    // The page behind the menu leaves the tab order until the menu closes.
    const behind = [document.getElementById("main"), document.querySelector<HTMLElement>(".site-footer")].filter(
      (node): node is HTMLElement => node !== null,
    );
    for (const node of behind) node.inert = true;
    panel.current?.focus();
    return () => {
      root.style.overflow = previous;
      for (const node of behind) node.inert = false;
    };
  }, [open]);
  const item = (index: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.32, ease: EASE_OUT, delay: reduced ? 0 : 0.04 + index * 0.035 },
  });
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-menu"
          ref={panel}
          className={styles.mobile}
          tabIndex={-1}
          aria-label={t.menuLabel}
          role="region"
          lang={locale === "zh" ? "zh-Hans" : "en"}
          data-lenis-prevent
          initial={{ opacity: 0, clipPath: reduced ? "inset(0 0 0 0)" : "inset(0 0 100% 0)" }}
          animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.18 } }}
          transition={{ duration: reduced ? 0 : 0.42, ease: EASE_OUT }}
        >
          <div className={`container ${styles.mobileInner}`}>
            <motion.div {...item(0)}>
              <LiveBlock />
            </motion.div>
            <motion.p className={`eyebrow ${styles.mobileLabel}`} {...item(1)}>
              {t.toolsBySection}
            </motion.p>
            <ul className={styles.mobileSections}>
              {sections.map((section, index) => {
                const isOpen = expanded === section.id;
                const counts = availability(section.id);
                const text = sectionText(section.id, locale);
                const listId = `mobile-section-${section.id}`;
                return (
                  <motion.li key={section.id} {...item(index + 2)}>
                    <button
                      type="button"
                      className={styles.mobileSection}
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      onClick={() => setExpanded(isOpen ? null : section.id)}
                    >
                      <span className={styles.railIcon} aria-hidden="true">
                        <SectionIcon section={section.id} size={16} />
                      </span>
                      <span className={styles.mobileSectionTitle} lang={text.translated ? undefined : "en"}>
                        {text.title}
                      </span>
                      <span className={styles.mobileCount}>
                        {counts.available}/{counts.total}
                      </span>
                      <motion.span
                        className={styles.mobileChevron}
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
                        aria-hidden="true"
                      >
                        <ChevronDown />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.ul
                          id={listId}
                          className={styles.mobileTools}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: reduced ? 0 : 0.28, ease: EASE_OUT }}
                        >
                          <li>
                            <Link
                              className={styles.mobileTool}
                              href={sectionLink(section.id, locale)}
                              prefetch={false}
                              onClick={onClose}
                            >
                              <span>{fill(t.overview, { section: text.title })}</span>
                              <ArrowRight size={14} />
                            </Link>
                          </li>
                          {toolsIn(section.id).map((tool) => (
                            <li key={tool.slug}>
                              <Link
                                className={styles.mobileTool}
                                href={toolHref(tool)}
                                prefetch={false}
                                data-status={tool.status}
                                aria-current={tool.href === path ? "page" : undefined}
                                onClick={onClose}
                              >
                                <span lang="en">{tool.name}</span>
                                {tool.status === "planned" ? (
                                  <span className="badge planned">{locale === "zh" ? c.planned : "planned"}</span>
                                ) : (
                                  <ArrowRight size={14} />
                                )}
                              </Link>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
            <ul className={styles.mobileLinks}>
              {links.map((link, index) => (
                <motion.li key={link.href} {...item(index + 9)}>
                  <Link
                    href={link.href}
                    prefetch={false}
                    aria-current={path === link.href ? "page" : undefined}
                    className={styles.mobileLink}
                    onClick={onClose}
                  >
                    {link.label}
                    <ArrowRight />
                  </Link>
                </motion.li>
              ))}
            </ul>
            <motion.div className={styles.mobileFoot} {...item(15)}>
              <Link className="button" href="/verify" prefetch={false} onClick={onClose}>
                {t.runCheck} <ArrowRight />
              </Link>
              <a className="quiet-button" href={repository}>
                <GitHubIcon /> {t.source} <ArrowUpRight size={13} />
              </a>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
