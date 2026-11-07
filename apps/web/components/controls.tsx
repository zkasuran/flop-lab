// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { tools } from "@/content/tools";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { EASE_OUT, MotionButton, MotionLink } from "./motion";
import { ArrowUpRight, CheckIcon, CopyIcon, MoonIcon, SearchIcon, SunIcon } from "./icons";
import { searchEntries, type SearchEntry } from "./suite/catalogue";

/** Copy text on the same click that shows feedback. Example: <CopyButton text={did} label="Copy DID" />. */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <MotionButton
      className={className ?? "quiet-button"}
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("copied");
        } catch {
          setStatus("failed");
        }
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={status === "copied" ? "check" : "copy"}
          initial={{ scale: reduced ? 1 : 0.6, opacity: reduced ? 1 : 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: reduced ? 1 : 0.6, opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.16, ease: EASE_OUT }}
          style={{ display: "inline-grid", color: status === "copied" ? "var(--accent)" : undefined }}
        >
          {status === "copied" ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </motion.span>
      </AnimatePresence>
      <span>{status === "copied" ? "Copied" : status === "failed" ? "Select text to copy" : label}</span>
    </MotionButton>
  );
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

/** Switch themes. Supporting browsers reveal the new theme from the pointer in 520 ms. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);
  const apply = (next: boolean) => {
    document.documentElement.dataset.theme = next ? "light" : "dark";
    try {
      localStorage.setItem("flop-theme", next ? "light" : "dark");
    } catch {
      /* Storage is optional. */
    }
    setLight(next);
  };
  return (
    <MotionButton
      className="icon-button"
      aria-label="Light theme"
      aria-pressed={light}
      title={light ? "Switch to dark theme" : "Switch to light theme"}
      onClick={(event) => {
        const next = !light;
        const doc = document as TransitionDocument;
        if (reduced || typeof doc.startViewTransition !== "function") {
          apply(next);
          return;
        }
        const box = event.currentTarget.getBoundingClientRect();
        const x = event.clientX || box.left + box.width / 2;
        const y = event.clientY || box.top + box.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        const transition = doc.startViewTransition(() => flushSync(() => apply(next)));
        transition.ready
          .then(() => {
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
              { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
            );
          })
          .catch(() => {
            /* The theme is already applied. Only the reveal is skipped. */
          });
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={light ? "sun" : "moon"}
          style={{ display: "inline-grid" }}
          initial={{ rotate: reduced ? 0 : -60, scale: reduced ? 1 : 0.5, opacity: reduced ? 1 : 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: reduced ? 0 : 60, scale: reduced ? 1 : 0.5, opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
        >
          {light ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </MotionButton>
  );
}

const RESULT_LIMIT = 30;
const GROUP_LABEL: Record<SearchEntry["kind"], string> = { Section: "Sections", Tool: "Tools", Docs: "Docs" };
const toolsBySearchId = new Map(tools.map((tool) => [`tool:${tool.slug}`, tool]));

/**
 * Search tools, sections and README headings. Opens with "/" or Cmd/Ctrl-K. Arrows move, Enter opens the
 * first result from the input or the focused link, Home returns to the input, Escape closes and restores focus.
 * Example: <CommandPalette entries={await paletteEntries()} />.
 */
export function CommandPalette({ entries }: { entries: readonly SearchEntry[] }) {
  const reduced = useReducedMotion() !== false;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [modifier, setModifier] = useState("Ctrl");
  const open = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setFocused(null);
    setIsOpen(true);
    dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setModifier("⌘");
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A closed dialog needs no ranked links, layout measurements or route prefetches.
  const matches = isOpen ? searchEntries(entries, query) : [];
  // Groups follow the rank of their best match, so the first row shown is always the first result.
  const groups: { kind: SearchEntry["kind"]; list: SearchEntry[] }[] = [];
  for (const entry of matches.slice(0, RESULT_LIMIT)) {
    const group = groups.find((item) => item.kind === entry.kind);
    if (group) group.list.push(entry);
    else groups.push({ kind: entry.kind, list: [entry] });
  }
  const first = groups[0]?.list[0]?.id ?? null;
  const highlighted =
    focused && groups.some((group) => group.list.some((entry) => entry.id === focused)) ? focused : first;
  const linkFor = (id: string | null) =>
    Array.from(dialog.current?.querySelectorAll<HTMLAnchorElement>("a[data-entry]") ?? []).find(
      (link) => link.dataset.entry === id,
    );
  return (
    <>
      <MotionButton
        ref={trigger}
        className="find-button"
        onClick={open}
        aria-label="Search"
        aria-haspopup="dialog"
        lang="en"
      >
        <SearchIcon />
        <span className="find-label">Search</span>
        <span className="kbd" aria-hidden="true">
          /
        </span>
      </MotionButton>
      <dialog
        ref={dialog}
        className="palette"
        aria-labelledby="palette-title"
        onClose={() => {
          setIsOpen(false);
          (opener.current?.isConnected ? opener.current : trigger.current)?.focus();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Home" && event.target !== input.current) {
            event.preventDefault();
            input.current?.focus();
            return;
          }
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          const links = Array.from(dialog.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
          if (!links.length) return;
          event.preventDefault();
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          const next =
            index < 0
              ? event.key === "ArrowDown"
                ? 0
                : links.length - 1
              : index + (event.key === "ArrowDown" ? 1 : -1);
          links[(next + links.length) % links.length]?.focus();
        }}
      >
        <h2 id="palette-title" className="sr-only">
          Search the suite
        </h2>
        <p id="palette-help" className="sr-only">
          Arrows move. Enter opens. Home returns to search. Escape closes.
        </p>
        <div className="palette-head">
          <SearchIcon size={18} />
          <input
            ref={input}
            className="palette-search"
            aria-label="Search tools, sections and docs"
            aria-describedby="palette-help"
            placeholder="Tool, section or docs heading"
            value={query}
            onFocus={() => setFocused(null)}
            onChange={(event) => {
              setQuery(event.target.value);
              setFocused(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const target = linkFor(highlighted);
              if (target) {
                event.preventDefault();
                target.click();
              }
            }}
          />
          <button className="kbd" type="button" onClick={() => dialog.current?.close()} aria-label="Close">
            Esc
          </button>
        </div>
        <div className="palette-body">
          <LayoutGroup id="palette">
            {groups.map(({ kind, list }) => (
              <div className="palette-group" key={kind}>
                <h3 id={`palette-${kind}`}>{GROUP_LABEL[kind]}</h3>
                <ul className="palette-list" aria-labelledby={`palette-${kind}`}>
                  {list.map((entry) => {
                    const tool = toolsBySearchId.get(entry.id);
                    const external = entry.href.startsWith("http");
                    return (
                      <li key={entry.id}>
                        <MotionLink
                          href={entry.href}
                          data-entry={entry.id}
                          onClick={() => dialog.current?.close()}
                          onFocus={() => setFocused(entry.id)}
                        >
                          {highlighted === entry.id && (
                            <motion.span
                              layoutId="palette-active"
                              className="palette-active"
                              transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}
                            />
                          )}
                          <span className="palette-item-text">
                            <span>{tool?.name ?? entry.title}</span>
                            <small>{tool?.tagline ?? entry.detail}</small>
                          </span>
                          <span className="palette-meta">
                            {tool && <span className={`badge ${tool.status}`}>{tool.status}</span>}
                            {external && <ArrowUpRight size={14} />}
                          </span>
                        </MotionLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </LayoutGroup>
          {matches.length > RESULT_LIMIT && (
            <p className="palette-note">
              Showing the first {RESULT_LIMIT} of {matches.length} matches. Refine your search.
            </p>
          )}
          {!matches.length && (
            <p className="palette-empty muted" role="status">
              No tools, sections or docs match this search.
            </p>
          )}
        </div>
        <div className="palette-foot" aria-hidden="true">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> move
          </span>
          <span>
            <span className="kbd">Enter</span> open
          </span>
          <span>
            <span className="kbd">{modifier}</span>
            <span className="kbd">K</span> toggle
          </span>
        </div>
      </dialog>
    </>
  );
}
