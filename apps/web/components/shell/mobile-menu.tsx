// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { repository, sections, toolHref, toolsIn, type Section } from "@/content/tools";
import { ArrowRight, ArrowUpRight, ChevronDown, GitHubIcon, SectionIcon } from "../icons";
import { EASE_OUT } from "../motion";
import { sectionHref } from "../suite/catalogue";
import { LiveBlock } from "./live-block";
import { availability } from "./mega-menu";
import styles from "./header.module.css";

const links = [
  { href: "/network", label: "Network" },
  { href: "/findings", label: "Findings" },
  { href: "/about", label: "How it was made" },
  { href: "/provenance", label: "Provenance" },
];

/**
 * Full-screen navigation for small screens. Sections expand in place to list their tools. Page scroll is locked
 * while it is open. Example: <MobileMenu open={open} onClose={close} current="verify" path="/verify" />.
 */
export function MobileMenu({
  open,
  onClose,
  current,
  path,
}: {
  open: boolean;
  onClose: () => void;
  current: Section | null;
  path: string;
}) {
  const reduced = useReducedMotion() !== false;
  const [expanded, setExpanded] = useState<Section | null>(current);
  const panel = useRef<HTMLDivElement>(null);
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
          aria-label="Site menu"
          role="region"
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
              Tools by section
            </motion.p>
            <ul className={styles.mobileSections}>
              {sections.map((section, index) => {
                const isOpen = expanded === section.id;
                const counts = availability(section.id);
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
                      <span className={styles.mobileSectionTitle}>{section.title}</span>
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
                            <Link className={styles.mobileTool} href={sectionHref(section.id)} onClick={onClose}>
                              <span>{section.title} overview</span>
                              <ArrowRight size={14} />
                            </Link>
                          </li>
                          {toolsIn(section.id).map((tool) => (
                            <li key={tool.slug}>
                              <Link
                                className={styles.mobileTool}
                                href={toolHref(tool)}
                                data-status={tool.status}
                                aria-current={tool.href === path ? "page" : undefined}
                                onClick={onClose}
                              >
                                <span>{tool.name}</span>
                                {tool.status === "planned" ? (
                                  <span className="badge planned">planned</span>
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
            <motion.div className={styles.mobileFoot} {...item(14)}>
              <Link className="button" href="/verify" onClick={onClose}>
                Run a check <ArrowRight />
              </Link>
              <a className="quiet-button" href={repository}>
                <GitHubIcon /> Source <ArrowUpRight size={13} />
              </a>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
