// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { repository, sections, tools, type Section } from "@/content/tools";
import { CommandPalette, ThemeToggle } from "./controls";
import type { SearchEntry } from "./suite/catalogue";
import { ArrowRight, ChevronDown, CloseIcon, GitHubIcon, Mark, MenuIcon } from "./icons";
import { EASE_OUT, Magnetic, MotionButton } from "./motion";
import { LiveBlock } from "./shell/live-block";
import { ToolsMenu, TrustMenu } from "./shell/mega-menu";
import { MobileMenu } from "./shell/mobile-menu";
import styles from "./shell/header.module.css";

type MenuId = "tools" | "trust";
type NavId = MenuId | "network" | "findings";

const trustPaths = ["/about", "/provenance", "/did"];

/** Which registry section the current route belongs to, if any. Example: sectionOf("/verify") is "verify". */
function sectionOf(path: string): Section | null {
  const tool = tools.find((entry) => entry.status !== "planned" && entry.href === path);
  if (tool) return tool.section;
  return sections.find((entry) => path === `/sections/${entry.id}`)?.id ?? null;
}

function activeNav(path: string): NavId | null {
  if (path === "/network") return "network";
  if (path === "/findings") return "findings";
  if (trustPaths.some((entry) => path === entry || path.startsWith(`${entry}/`))) return "trust";
  if (sectionOf(path)) return "tools";
  return null;
}

/**
 * The site header: a Tools mega menu, the Network and Findings pages, a Trust dropdown, the latest block reading,
 * search, source, theme and the main action. Menus open on hover with a short intent delay, on click and from
 * the keyboard. Escape closes and returns focus. Small screens get a full-screen menu.
 * Example: <SiteHeader entries={entries} />.
 */
export function SiteHeader({ entries }: { entries: readonly SearchEntry[] }) {
  const path = usePathname();
  const reduced = useReducedMotion() !== false;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<MenuId | null>(null);
  const [mobile, setMobile] = useState(false);
  const [hovered, setHovered] = useState<NavId | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const openedAt = useRef(0);
  const header = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({});
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = sectionOf(path);
  const active = activeNav(path);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));
  useEffect(() => {
    setScrolled(window.scrollY > 8);
  }, []);
  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [path]);
  useEffect(() => {
    if (!open && !mobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (open) {
        triggers.current[open]?.focus();
        setOpen(null);
      } else {
        setMobile(false);
        menuButton.current?.focus();
      }
    };
    const onPointer = (event: globalThis.PointerEvent) => {
      if (open && !header.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, mobile]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const show = (id: MenuId) => {
    window.clearTimeout(closeTimer.current);
    if (open !== id) openedAt.current = Date.now();
    setOpen(id);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 180);
  };
  const hover = (id: MenuId) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "mouse") show(id);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === "mouse") hide();
    },
    onBlur: (event: FocusEvent<HTMLLIElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setOpen((value) => (value === id ? null : value));
    },
  });
  const toggle = (id: MenuId) => {
    // A click that lands right after a hover opened the menu should not close it again.
    if (open === id && Date.now() - openedAt.current < 400) return;
    if (open === id) setOpen(null);
    else show(id);
  };
  const close = () => setOpen(null);
  const indicator = (id: NavId) => (
    <>
      {active === id && (
        <motion.span
          layoutId="nav-indicator"
          className={styles.indicator}
          transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
        />
      )}
      {hovered === id && active !== id && (
        <motion.span
          layoutId="nav-hover"
          className={styles.hover}
          transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
        />
      )}
    </>
  );

  return (
    <header
      ref={header}
      className={`site-header ${styles.header}`}
      data-scrolled={scrolled}
      data-open={open !== null || mobile}
      data-print-hide
    >
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href="/" aria-label="flop-lab home">
          <Mark size={24} />
          <span aria-hidden="true">
            flop<span className={styles.brandSuffix}>-lab</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <LayoutGroup id="site-nav">
            <ul className={styles.links} onPointerLeave={() => setHovered(null)}>
              <li className={styles.megaItem} {...hover("tools")}>
                <button
                  ref={(node) => {
                    triggers.current.tools = node;
                  }}
                  type="button"
                  className={styles.link}
                  data-active={active === "tools"}
                  aria-expanded={open === "tools"}
                  aria-controls="menu-tools"
                  onClick={() => toggle("tools")}
                  onPointerEnter={() => setHovered("tools")}
                >
                  {indicator("tools")}
                  <span className={styles.label}>
                    Tools
                    <ChevronDown size={13} className={styles.chevron} data-open={open === "tools"} />
                  </span>
                </button>
                <AnimatePresence>
                  {open === "tools" && <ToolsMenu id="menu-tools" current={current} onNavigate={close} />}
                </AnimatePresence>
              </li>
              <li>
                <Link
                  className={styles.link}
                  href="/network"
                  data-active={active === "network"}
                  aria-current={active === "network" ? "page" : undefined}
                  onPointerEnter={() => setHovered("network")}
                >
                  {indicator("network")}
                  <span className={styles.label}>Network</span>
                </Link>
              </li>
              <li>
                <Link
                  className={styles.link}
                  href="/findings"
                  data-active={active === "findings"}
                  aria-current={active === "findings" ? "page" : undefined}
                  onPointerEnter={() => setHovered("findings")}
                >
                  {indicator("findings")}
                  <span className={styles.label}>Findings</span>
                </Link>
              </li>
              <li className={styles.dropItem} {...hover("trust")}>
                <button
                  ref={(node) => {
                    triggers.current.trust = node;
                  }}
                  type="button"
                  className={styles.link}
                  data-active={active === "trust"}
                  aria-expanded={open === "trust"}
                  aria-controls="menu-trust"
                  onClick={() => toggle("trust")}
                  onPointerEnter={() => setHovered("trust")}
                >
                  {indicator("trust")}
                  <span className={styles.label}>
                    Trust
                    <ChevronDown size={13} className={styles.chevron} data-open={open === "trust"} />
                  </span>
                </button>
                <AnimatePresence>
                  {open === "trust" && <TrustMenu id="menu-trust" onNavigate={close} />}
                </AnimatePresence>
              </li>
            </ul>
          </LayoutGroup>
        </nav>
        <div className={styles.actions}>
          <LiveBlock className={styles.liveDesktop} />
          <CommandPalette entries={entries} />
          <a
            className={`icon-button ${styles.repo}`}
            href={repository}
            aria-label="Source on GitHub"
            title="Source on GitHub"
          >
            <GitHubIcon />
          </a>
          <ThemeToggle />
          <Magnetic className={styles.ctaWrap}>
            <Link className={`button ${styles.cta}`} href="/verify">
              Run a check <ArrowRight size={14} />
            </Link>
          </Magnetic>
          <MotionButton
            ref={menuButton}
            className={`icon-button ${styles.menuButton}`}
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            aria-label={mobile ? "Close menu" : "Open menu"}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <CloseIcon /> : <MenuIcon />}
          </MotionButton>
        </div>
      </div>
      <MobileMenu open={mobile} onClose={() => setMobile(false)} current={current} path={path} />
    </header>
  );
}
