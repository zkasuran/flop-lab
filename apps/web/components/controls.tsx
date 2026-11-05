// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { tools, toolHref } from "@/content/tools";
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

export function CommandPalette() {
  const reduced = useReducedMotion() !== false;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const open = () => {
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
  const matches = tools.filter((tool) => `${tool.name} ${tool.tagline}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <MotionButton className="quiet-button" onClick={open}>
        Find tool <span className="shortcut mono">/</span>
      </MotionButton>
      <dialog
        ref={dialog}
        aria-labelledby="palette-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
        onKeyDown={(event) => {
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
          <h2 id="palette-title">Find a tool</h2>
          <MotionButton className="quiet-button" onClick={() => dialog.current?.close()}>
            Close
          </MotionButton>
        </div>
        <motion.input
          ref={input}
          whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
          transition={{ duration: reduced ? 0 : 0.16 }}
          className="palette-search"
          aria-label="Search tools"
          placeholder="Search by name or task"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="palette-list">
          {matches.map((tool) => (
            <motion.li key={tool.slug} layout={!reduced} transition={{ duration: reduced ? 0 : 0.2 }}>
              <MotionLink href={toolHref(tool)} onClick={() => dialog.current?.close()}>
                {tool.name}
                <span className={`badge ${tool.status}`}>{tool.status}</span>
              </MotionLink>
            </motion.li>
          ))}
        </ul>
        {!matches.length && (
          <p className="palette-empty muted" role="status">
            No tools match this search.
          </p>
        )}
      </dialog>
    </>
  );
}
