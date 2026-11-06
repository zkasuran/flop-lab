// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { repository, tools } from "@/content/tools";
import { CommandPalette, ThemeToggle } from "./controls";
import type { SearchEntry } from "./suite/catalogue";
import { ArrowUpRight, CloseIcon, GitHubIcon, Mark, MenuIcon } from "./icons";
import { EASE_OUT, MotionButton } from "./motion";
import { LanguageSwitch } from "@/app/zh/language-switch";
import { common } from "@/app/zh/translations/common";

type NavItem = { id: string; label: string; href: string };
const items: NavItem[] = [
  { id: "findings", label: "Findings", href: "/#findings" },
  { id: "tools", label: "Tools", href: "/#tools" },
  { id: "about", label: "About", href: "/about" },
  { id: "provenance", label: "Provenance", href: "/provenance" },
];
const toolPaths = new Set(tools.filter((tool) => tool.status !== "planned").map((tool) => tool.href));

/** Follow the home page section under the reading line so the nav can mark it. */
function useHomeSection(enabled: boolean) {
  const [section, setSection] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const targets = ["findings", "tools"]
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setSection(entry.target.id);
          else setSection((current) => (current === entry.target.id ? null : current));
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [enabled]);
  return enabled ? section : null;
}

/** Sticky site header with scroll-aware chrome, section-aware navigation and a compact mobile menu. */
export function SiteHeader({ entries }: { entries: readonly SearchEntry[] }) {
  const path = usePathname();
  const chinese = path === "/zh" || path.startsWith("/zh/");
  const copy = common[chinese ? "zh" : "en"];
  const navigation = items.map((item) => ({
    ...item,
    label:
      (
        {
          findings: copy.findings,
          tools: chinese ? "工具" : "Tools",
          about: copy.about,
          provenance: copy.provenance,
        } as Record<string, string>
      )[item.id] ?? item.label,
    href: chinese && item.href.startsWith("/#") ? `/zh${item.href.slice(1)}` : item.href,
  }));
  navigation.push({ id: "docs", label: copy.docs, href: chinese ? "/zh/docs" : "/docs" });
  const reduced = useReducedMotion() !== false;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const homeSection = useHomeSection(path === "/" || path === "/zh");
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));
  useEffect(() => {
    setScrolled(window.scrollY > 8);
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [path]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const activeId =
    path === "/" || path === "/zh"
      ? homeSection
      : path.startsWith("/about")
        ? "about"
        : path === "/docs" || path === "/zh/docs"
          ? "docs"
          : path.startsWith("/provenance")
            ? "provenance"
            : toolPaths.has(path)
              ? "tools"
              : null;
  return (
    <header
      className="site-header"
      data-scrolled={scrolled}
      data-menu={menu ? "open" : "closed"}
      lang={chinese ? "zh-Hans" : "en"}
    >
      <div className="container header-inner">
        <Link className="wordmark" href={chinese ? "/zh" : "/"} aria-label={`flop-lab ${copy.home}`}>
          <Mark />
          <span aria-hidden="true">
            flop<span className="wordmark-suffix">-lab</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label={copy.mainNavigation} lang={chinese ? "zh-Hans" : "en"}>
          <LayoutGroup id="nav">
            <ul className="nav-links">
              {navigation.map((item) => (
                <li key={item.id}>
                  <Link
                    className="nav-link"
                    href={item.href}
                    data-active={activeId === item.id}
                    aria-current={activeId === item.id && item.href.startsWith("/#") === false ? "page" : undefined}
                  >
                    {activeId === item.id && (
                      <motion.span
                        layoutId="nav-indicator"
                        className="nav-indicator"
                        transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
                      />
                    )}
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </LayoutGroup>
          <div className="nav-actions">
            <LanguageSwitch />
            <CommandPalette entries={entries} />
            <a
              className="icon-button nav-repo"
              href={repository}
              aria-label="Source on GitHub"
              title="Source on GitHub"
            >
              <GitHubIcon />
            </a>
            <ThemeToggle />
            <MotionButton
              className="icon-button menu-button"
              aria-expanded={menu}
              aria-controls="mobile-menu"
              aria-label={menu ? copy.closeMenu : copy.openMenu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <CloseIcon /> : <MenuIcon />}
            </MotionButton>
          </div>
        </nav>
      </div>
      <AnimatePresence initial={false}>
        {menu && (
          <motion.div
            id="mobile-menu"
            className="mobile-menu"
            initial={{ height: reduced ? "auto" : 0, opacity: reduced ? 1 : 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: reduced ? "auto" : 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: EASE_OUT }}
          >
            <ul>
              {navigation.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} data-active={activeId === item.id} onClick={() => setMenu(false)}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href={repository}>
                  Source on GitHub <ArrowUpRight />
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
