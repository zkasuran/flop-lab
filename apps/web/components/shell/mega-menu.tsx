// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CONTRIBUTOR_DID } from "@/lib/constants";
import { repository, sections, toolHref, toolsIn, type Section } from "@/content/tools";
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
 * Planned tools link to their source. Example: <ToolsMenu id="menu-tools" current="verify" onNavigate={close} />.
 */
export function ToolsMenu({
  id,
  current,
  onNavigate,
}: {
  id: string;
  current: Section | null;
  onNavigate: () => void;
}) {
  const reduced = useReducedMotion() !== false;
  const panel = usePanelMotion();
  const [active, setActive] = useState<Section>(current ?? "observe");
  const section = sections.find((entry) => entry.id === active) ?? sections[0]!;
  const list = toolsIn(section.id);
  const paneId = `${id}-pane`;
  return (
    <motion.div id={id} className={styles.mega} data-lenis-prevent {...panel}>
      <div className={styles.rail} aria-label="Sections">
        {sections.map((entry, index) => {
          const counts = availability(entry.id);
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
                <span className={styles.railTitle}>{entry.title}</span>
                <span className={styles.railMeta}>
                  {String(index + 1).padStart(2, "0")} / {counts.available} of {counts.total} available
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.pane} id={paneId}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={section.id}
            className={styles.paneInner}
            initial={{ opacity: 0, x: reduced ? 0 : 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : -10 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
          >
            <div className={styles.paneHead}>
              <p className={styles.paneQuestion}>{section.question}</p>
              <Link className="text-link" href={sectionHref(section.id)} onClick={onNavigate}>
                {section.title} overview <ArrowRight size={14} />
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
                      data-status={tool.status}
                      onClick={onNavigate}
                    >
                      <span className={styles.paneName}>
                        {tool.name}
                        {planned ? <ArrowUpRight size={12} /> : null}
                      </span>
                      <span className={styles.paneTag}>{tool.tagline}</span>
                      <span className={`badge ${tool.status}`}>{tool.status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
      <aside className={styles.feature} aria-label="Start here">
        <p className="eyebrow">Start here</p>
        <p className={styles.featureTitle}>Does this settlement add up?</p>
        <p className={styles.featureText}>
          The settlement verifier replays public evidence with exact integer arithmetic. Each check reads PASS, FAIL or
          UNVERIFIABLE.
        </p>
        <Link className="button" href="/verify" onClick={onNavigate}>
          Check a settlement <ArrowRight />
        </Link>
        <p className={styles.featureHint}>
          Press <span className="kbd">/</span> to search every tool and README heading.
        </p>
      </aside>
    </motion.div>
  );
}

const trust = [
  { href: "/about", title: "How it was made", text: "Agents write the code. A gate checks it. A person merges." },
  { href: "/provenance", title: "Provenance", text: "Verify pull request and build signatures in your browser." },
  { href: "/did", title: "DID trail", text: "What this did:key has signed and whether it verifies." },
  { href: `${repository}/blob/main/LICENSE`, title: "Licence", text: "Apache-2.0. Read it, fork it and run it." },
];

/** The Trust dropdown: how the project is built and how to check its signatures. Example: <TrustMenu id="menu-trust" onNavigate={close} />. */
export function TrustMenu({ id, onNavigate }: { id: string; onNavigate: () => void }) {
  const panel = usePanelMotion();
  return (
    <motion.div id={id} className={styles.dropdown} data-lenis-prevent {...panel}>
      <ul className={styles.dropList}>
        {trust.map((item) => {
          const external = item.href.startsWith("http");
          return (
            <li key={item.href}>
              <Link className={styles.dropLink} href={item.href} onClick={onNavigate}>
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
        <p className="eyebrow">Signing key</p>
        <code title={CONTRIBUTOR_DID}>{`${CONTRIBUTOR_DID.slice(0, 18)}...${CONTRIBUTOR_DID.slice(-6)}`}</code>
        <CopyButton text={CONTRIBUTOR_DID} label="Copy DID" />
      </div>
    </motion.div>
  );
}
