// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { searchEntries, type SearchEntry } from "./suite/catalogue";
import { motion, useReducedMotion } from "motion/react";
import { MotionButton, MotionLink } from "./motion";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [status, setStatus] = useState(label);
  return (
    <MotionButton
      className="quiet-button"
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("Copied");
        } catch {
          setStatus("Select text to copy");
        }
      }}
    >
      {status}
    </MotionButton>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);
  return (
    <MotionButton
      className="quiet-button"
      aria-label="Light theme"
      aria-pressed={light}
      onClick={() => {
        const next = !light;
        document.documentElement.dataset.theme = next ? "light" : "dark";
        try {
          localStorage.setItem("flop-theme", next ? "light" : "dark");
        } catch {
          /* Storage is optional. */
        }
        setLight(next);
      }}
    >
      {light ? "Dark" : "Light"}
    </MotionButton>
  );
}

export function CommandPalette({ entries }: { entries: readonly SearchEntry[] }) {
  const reduced = useReducedMotion() !== false;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const open = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
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
  const matches = searchEntries(entries, query);
  return (
    <>
      <MotionButton ref={trigger} className="quiet-button" onClick={open}>
        Search <span className="shortcut mono">/</span>
      </MotionButton>
      <dialog
        ref={dialog}
        aria-labelledby="palette-title"
        onClose={() => (opener.current?.isConnected ? opener.current : trigger.current)?.focus()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === input.current) {
            event.preventDefault();
            dialog.current?.querySelector<HTMLAnchorElement>(".palette-list a")?.click();
            return;
          }
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
        <div className="palette-head">
          <h2 id="palette-title">Search the suite</h2>
          <MotionButton className="quiet-button" onClick={() => dialog.current?.close()}>
            Close
          </MotionButton>
        </div>
        <motion.input
          ref={input}
          whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
          transition={{ duration: reduced ? 0 : 0.16 }}
          className="palette-search"
          aria-label="Search tools, sections and docs"
          placeholder="Tool, section or docs heading"
          aria-describedby="palette-help"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p id="palette-help" className="palette-empty muted">
          Arrows move. Enter opens. Home returns to search. Escape closes.
        </p>
        <ul className="palette-list">
          {matches.slice(0, 30).map((entry) => (
            <motion.li key={entry.id} layout={!reduced} transition={{ duration: reduced ? 0 : 0.2 }}>
              <MotionLink href={entry.href} onClick={() => dialog.current?.close()}>
                <span>
                  {entry.title}
                  <small className="muted" style={{ display: "block" }}>
                    {entry.detail}
                  </small>
                </span>
                <span className="badge">{entry.kind}</span>
              </MotionLink>
            </motion.li>
          ))}
        </ul>
        {matches.length > 30 && (
          <p className="palette-empty muted">Showing the first 30 of {matches.length} matches. Refine your search.</p>
        )}
        {!matches.length && (
          <p className="palette-empty muted" role="status">
            No tools, sections or docs match this search.
          </p>
        )}
      </dialog>
    </>
  );
}
