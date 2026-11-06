// SPDX-License-Identifier: Apache-2.0
"use client";

import Lenis from "lenis";
import { cancelFrame, frame, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isStoryPath } from "./routes";
import styles from "./cursor.module.css";

type CursorState = "default" | "link" | "label" | "crosshair" | "text";

const INTERACTIVE = "a, button, [role='button'], [role='tab'], summary, label, select";
const TEXT_INPUT =
  "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='button']):not([type='submit']), textarea, [contenteditable='true']";
const LABELS: Readonly<Record<string, string>> = { open: "Open", view: "View", copy: "Copy", read: "Read" };

/** True for a mouse or trackpad that can hover, outside forced colours. Example: const fine = useFinePointer(); */
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const forced = window.matchMedia("(forced-colors: active)");
    const update = () => setFine(pointer.matches && !forced.matches);
    update();
    pointer.addEventListener("change", update);
    forced.addEventListener("change", update);
    return () => {
      pointer.removeEventListener("change", update);
      forced.removeEventListener("change", update);
    };
  }, []);
  return fine;
}

/** Read the cursor mode for the element under the pointer. Example: modeFor(event.target). */
function modeFor(target: EventTarget | null): { state: CursorState; label: string } {
  const node = target instanceof Element ? target : null;
  if (!node) return { state: "default", label: "" };
  if (node.closest(TEXT_INPUT)) return { state: "text", label: "" };
  const own = node.closest<HTMLElement>(`[data-cursor], ${INTERACTIVE}`);
  if (!own) return { state: "default", label: "" };
  let mode = own.dataset.cursor;
  let source: HTMLElement = own;
  if (!mode) {
    // A plain link inside a labelled card takes the card's label. Anything else reads as a link.
    const area = own.parentElement?.closest<HTMLElement>("[data-cursor]");
    if (area && area.dataset.cursor && area.dataset.cursor in LABELS) {
      mode = area.dataset.cursor;
      source = area;
    } else mode = "link";
  }
  if (mode === "crosshair") return { state: "crosshair", label: "" };
  const label = source.dataset.cursorLabel ?? LABELS[mode] ?? "";
  if (label) return { state: "label", label };
  return { state: mode === "link" ? "link" : "default", label: "" };
}

/**
 * A dot and a trailing ring that replace the system cursor on story pages. The ring grows on links, shows a
 * label on cards and becomes a crosshair over the network constellation. It gives way to the text cursor in
 * inputs and to the system cursor while a dialog is open. Mouse only, never under reduced motion or forced
 * colours. Example: <MagicCursor />.
 */
export function MagicCursor() {
  const path = usePathname();
  const reduced = useReducedMotion() !== false;
  const fine = useFinePointer();
  const enabled = fine && !reduced && isStoryPath(path);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 520, damping: 42, mass: 0.55 });
  const ringY = useSpring(y, { stiffness: 520, damping: 42, mass: 0.55 });
  const [mode, setMode] = useState<{ state: CursorState; label: string }>({ state: "default", label: "" });
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const shown = useRef(false);
  const current = useRef(mode);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      delete root.dataset.cursor;
      shown.current = false;
      setVisible(false);
      return;
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x.set(event.clientX);
      y.set(event.clientY);
      if (!shown.current) {
        // Hide the system cursor only once the replacement knows where the pointer is.
        shown.current = true;
        ringX.jump(event.clientX);
        ringY.jump(event.clientY);
        root.dataset.cursor = "on";
        setVisible(true);
      }
      const next = modeFor(event.target);
      if (next.state !== current.current.state || next.label !== current.current.label) {
        current.current = next;
        setMode(next);
      }
    };
    const onOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      shown.current = false;
      delete root.dataset.cursor;
      setVisible(false);
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      delete root.dataset.cursor;
      shown.current = false;
    };
  }, [enabled, x, y, ringX, ringY]);

  if (!enabled) return null;
  return (
    <div
      className={`magic-cursor ${styles.cursor}`}
      data-state={mode.state}
      data-visible={visible}
      data-pressed={pressed}
      aria-hidden="true"
    >
      <motion.div className={styles.ring} style={{ x: ringX, y: ringY }}>
        <span className={styles.label}>{mode.label}</span>
      </motion.div>
      <motion.div className={styles.dot} style={{ x, y }} />
    </div>
  );
}

/**
 * Feed the pointer position to cards marked data-spotlight, as --mx and --my, once per frame.
 * Mouse only. Reduced motion keeps the static glow. Example: <PointerSpotlight />.
 */
export function PointerSpotlight() {
  const fine = useFinePointer();
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    if (!fine || reduced) return;
    let raf = 0;
    let pending: { node: HTMLElement; x: number; y: number } | null = null;
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const box = pending.node.getBoundingClientRect();
      pending.node.style.setProperty("--mx", `${pending.x - box.left}px`);
      pending.node.style.setProperty("--my", `${pending.y - box.top}px`);
      pending = null;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
      const node = event.target.closest<HTMLElement>("[data-spotlight]");
      if (!node) return;
      pending = { node, x: event.clientX, y: event.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [fine, reduced]);
  return null;
}

/**
 * Lenis smooth scroll on story pages, driven from Motion's frame loop so scroll-linked values read this frame's
 * position. Tool pages keep native scrolling. Dialogs, menus and marked areas scroll natively. The instance is
 * destroyed in a layout effect, before the next route restores its scroll position. Example: <SmoothScroll />.
 */
export function SmoothScroll() {
  const path = usePathname();
  const story = isStoryPath(path);
  useLayoutEffect(() => {
    if (!story) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    const lenis = new Lenis({
      autoRaf: false,
      anchors: { offset: -96 },
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
      prevent: (node) => node.closest("dialog, [data-lenis-prevent]") !== null,
    });
    const update = ({ timestamp }: { timestamp: number }) => lenis.raf(timestamp);
    frame.setup(update, true);
    return () => {
      cancelFrame(update);
      lenis.destroy();
    };
  }, [story, path]);
  return null;
}
