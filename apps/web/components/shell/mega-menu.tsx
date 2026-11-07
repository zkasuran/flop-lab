// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CONTRIBUTOR_DID } from "@/lib/constants";
import { repository, sections, toolHref, toolsIn, type Section, type Tool } from "@/content/tools";
import { common } from "@/app/zh/translations/common";
import { sectionCopy } from "@/app/zh/translations/sections";
import { fill, shell } from "@/app/zh/translations/shell";
import type { Locale } from "@/app/zh/translations/types";
import { CopyButton } from "../controls";
import { ArrowRight, ArrowUpRight, SectionIcon } from "../icons";
import { EASE_OUT } from "../motion";
import { sectionHref } from "../suite/catalogue";
import styles from "./header.module.css";

/** Release counts read from the registry. Example: availability("verify"). */
export function availability(section: Section) {
  const list = toolsIn(section);
  return { total: list.length, available: list.filter((tool) => tool.status !== "planned").length };
}

/** Section copy in one language. Sections without a translation keep their English text. Example: sectionText("verify", "zh"). */
export function sectionText(id: Section, locale: Locale) {
  const section = sections.find((entry) => entry.id === id)!;
  const copy = sectionCopy[id]?.[locale];
  return {
    title: copy?.title ?? section.title,
    question: copy?.question ?? section.question,
    translated: locale === "en" || copy !== undefined,
    tagline: (tool: Tool) => sectionCopy[id]?.[locale]?.[tool.slug] ?? tool.tagline,
  };
}

/** A section route in the reader's language. Example: sectionLink("verify", "zh") is "/zh/sections/verify". */
export function sectionLink(id: Section, locale: Locale): string {
  return `${locale === "zh" ? "/zh" : ""}${sectionHref(id)}`;
}

function usePanelMotion() {
  const reduced = useReducedMotion() !== false;
  return {
    initial: { opacity: 0, y: reduced ? 0 : -10, scale: reduced ? 1 : 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: reduced ? 0 : -6, transition: { duration: reduced ? 0 : 0.14 } },
    transition: { duration: reduced ? 0 : 0.28, ease: EASE_OUT },
  };
}

/**
 * The Tools mega menu. A rail lists the six sections. Hovering or focusing one shows its tools beside it.
 * Planned tools link to their source. Example: <ToolsMenu id="menu-tools" current="verify" locale="en" onNavigate={close} />.
 */
export function ToolsMenu({
  id,
  current,
  locale,
  onNavigate,
}: {
  id: string;
  current: Section | null;
  locale: Locale;
  onNavigate: () => void;
}) {
  const reduced = useReducedMotion() !== false;
  const panel = usePanelMotion();
  const t = shell[locale];
  const [active, setActive] = useState<Section>(current ?? "observe");
  const text = sectionText(active, locale);
  const list = toolsIn(active);
  const paneId = `${id}-pane`;
  return (
    <motion.div id={id} className={styles.mega} data-lenis-prevent {...panel}>
      <div className={styles.rail} role="group" aria-label={t.sectionsLabel}>
        {sections.map((entry, index) => {
          const counts = availability(entry.id);
          const copy = sectionText(entry.id, locale);
          return (
            <button
              key={entry.id}
              type="button"
              className={styles.railItem}
              aria-pressed={active === entry.id}
              aria-controls={paneId}
              onPointerEnter={() => setActive(entry.id)}
              onFocus={() => setActive(entry.id)}
              onClick={() => setActive(entry.id)}
            >
              {active === entry.id && (
                <motion.span
                  layoutId="mega-rail"
                  className={styles.railPill}
                  transition={{ duration: reduced ? 0 : 0.26, ease: EASE_OUT }}
                />
              )}
              <span className={styles.railIcon} aria-hidden="true">
                <SectionIcon section={entry.id} size={16} />
              </span>
              <span className={styles.railText}>
                <span className={styles.railTitle} lang={copy.translated ? undefined : "en"}>
                  {copy.title}
                </span>
                <span className={styles.railMeta}>
                  {String(index + 1).padStart(2, "0")} / {fill(t.counts, { a: counts.available, b: counts.total })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.pane} id={paneId}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={active}
            className={styles.paneInner}
            initial={{ opacity: 0, x: reduced ? 0 : 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : -10 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
          >
            <div className={styles.paneHead}>
              <p className={styles.paneQuestion} lang={text.translated ? undefined : "en"}>
                {text.question}
              </p>
              <Link className="text-link" href={sectionLink(active, locale)} prefetch={false} onClick={onNavigate}>
                {fill(t.overview, { section: text.title })} <ArrowRight size={14} />
              </Link>
            </div>
            <ul className={styles.paneList}>
              {list.map((tool) => {
                const planned = tool.status === "planned";
                return (
                  <li key={tool.slug}>
                    <Link
                      className={styles.paneLink}
                      href={toolHref(tool)}
                      prefetch={false}
                      data-status={tool.status}
                      onClick={onNavigate}
                    >
                      <span className={styles.paneName} lang="en">
                        {tool.name}
                        {planned ? <ArrowUpRight size={12} /> : null}
                      </span>
                      <span className={styles.paneTag} lang={text.translated ? undefined : "en"}>
                        {text.tagline(tool)}
                      </span>
                      <span className={`badge ${tool.status}`}>
                        {locale === "zh" && planned ? common.zh.planned : tool.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
      <aside className={styles.feature} aria-label={t.startHere}>
        <p className="eyebrow">{t.startHere}</p>
        <p className={styles.featureTitle}>{t.startTitle}</p>
        <p className={styles.featureText}>{t.startText}</p>
        <Link className="button" href="/verify" prefetch={false} onClick={onNavigate}>
          {t.startAction} <ArrowRight />
        </Link>
        <p className={styles.featureHint}>
          {t.hintBefore} <span className="kbd">/</span> {t.hintAfter}
        </p>
      </aside>
    </motion.div>
  );
}

/** The Trust dropdown: how the project is built and how to check its signatures. Example: <TrustMenu id="menu-trust" locale="en" onNavigate={close} />. */
export function TrustMenu({ id, locale, onNavigate }: { id: string; locale: Locale; onNavigate: () => void }) {
  const panel = usePanelMotion();
  const t = shell[locale];
  const trust = [
    { href: "/about", title: t.howMade, text: t.howMadeText },
    { href: "/provenance", title: t.provenance, text: t.provenanceText },
    { href: "/did", title: t.didTrail, text: t.didTrailText },
    { href: `${repository}/blob/main/LICENSE`, title: t.licence, text: t.licenceText },
  ];
  return (
    <motion.div id={id} className={styles.dropdown} data-lenis-prevent {...panel}>
      <ul className={styles.dropList}>
        {trust.map((item) => {
          const external = item.href.startsWith("http");
          return (
            <li key={item.href}>
              <Link className={styles.dropLink} href={item.href} prefetch={false} onClick={onNavigate}>
                <span className={styles.dropTitle}>
                  {item.title}
                  {external ? <ArrowUpRight size={12} /> : null}
                </span>
                <span className={styles.dropText}>{item.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className={styles.dropKey}>
        <p className="eyebrow">{t.signingKey}</p>
        <code title={CONTRIBUTOR_DID}>{`${CONTRIBUTOR_DID.slice(0, 18)}...${CONTRIBUTOR_DID.slice(-6)}`}</code>
        <CopyButton text={CONTRIBUTOR_DID} label={t.copyDid} />
      </div>
    </motion.div>
  );
}
