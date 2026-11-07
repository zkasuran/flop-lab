// SPDX-License-Identifier: Apache-2.0
"use client";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronRight } from "./icons";

const LinkWithMotion = motion.create(Link);

/** Shared easing. Every timed transition on the site finishes within 600 ms. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Immediate actions with transform-only feedback. Example: <MotionButton onClick={copy}>Copy</MotionButton>. */
export function MotionButton(props: HTMLMotionProps<"button">) {
  const reduced = useReducedMotion() !== false;
  return (
    <motion.button
      whileHover={{ y: reduced ? 0 : -1 }}
      whileTap={{ scale: reduced ? 1 : 0.97 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: EASE_OUT }}
      {...props}
    />
  );
}

/** Client navigation keeps the shared shell mounted. Example: <MotionLink href="/provenance">Verify</MotionLink>. */
export function MotionLink(props: React.ComponentProps<typeof LinkWithMotion>) {
  const reduced = useReducedMotion() !== false;
  return (
    <LinkWithMotion
      prefetch={false}
      whileHover={{ y: reduced ? 0 : -1 }}
      whileTap={{ scale: reduced ? 1 : 0.98 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}
      {...props}
    />
  );
}

/**
 * Route arrivals preserve visible server-rendered content. The layout group stays mounted across routes,
 * so a shared tool marker can travel from an index row to the tool header. Example: <RouteSurface>{children}</RouteSurface>.
 */
export function RouteSurface({ children }: { children: ReactNode }) {
  const path = usePathname();
  const reduced = useReducedMotion() !== false;
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="suite-routes">
        <motion.div
          className="route-surface"
          key={path}
          initial={{ y: reduced ? 0 : 10 }}
          animate={{ y: 0 }}
          transition={{ duration: reduced ? 0 : 0.32, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}

/**
 * True once an element has been seen. Elements that start on screen count as seen at once, so their
 * final state is never hidden. Example: const shown = useSeen(ref);
 */
export function useSeen<T extends Element>(ref: RefObject<T | null>, amount = 0.35): boolean {
  const inView = useInView(ref, { once: true, amount });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box && (box.top > window.innerHeight || box.bottom < 0)) setArmed(true);
  }, [ref]);
  return !armed || inView;
}

/** Reveal content in reading order without hiding its final value. Example: <ReadingReveal order={1}>...</ReadingReveal>. */
export function ReadingReveal({
  children,
  order = 0,
  className,
}: {
  children: ReactNode;
  order?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep initially visible server content still during hydration. Off-screen sections reveal on entry.
  const visible = useSeen(ref);
  const reduced = useReducedMotion() !== false;
  return (
    <motion.div
      ref={ref}
      className={className ? `reading-reveal ${className}` : "reading-reveal"}
      initial={false}
      animate={{ y: reduced || visible ? 0 : 16 }}
      transition={{
        duration: reduced ? 0 : 0.36,
        ease: EASE_OUT,
        delay: reduced ? 0 : Math.min(order * 0.06, 0.24),
      }}
    >
      {children}
    </motion.div>
  );
}

/** Animate a measured number as a whole, never invent intermediate counts. Example: <ObservedNumber value={snapshot.stats.value?.block} />. */
export function ObservedNumber({
  value,
  missingLabel = "No data",
}: {
  value: number | undefined;
  missingLabel?: string;
}) {
  const reduced = useReducedMotion() !== false;
  return (
    <motion.span
      className="observed-number"
      key={value ?? "missing"}
      initial={{ y: reduced ? 0 : 7 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: reduced ? 0 : 0.36, ease: EASE_OUT }}
    >
      {value?.toLocaleString("en-US") ?? missingLabel}
    </motion.span>
  );
}

/**
 * Replace one displayed value with the next as a whole. The old value leaves, the new one arrives.
 * Nothing in between is shown. Example: <SwapValue value={row.escrow} />.
 */
export function SwapValue({ value, className }: { value: string; className?: string }) {
  const reduced = useReducedMotion() !== false;
  return (
    <span className={`swap-value ${className ?? ""}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: reduced ? 0 : "70%", opacity: reduced ? 1 : 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: reduced ? 0 : "-70%", opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.26, ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A keyboard disclosure with immediate expanded state. Example: <Disclosure title="Inspect bytes">...</Disclosure>. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion() !== false;
  return (
    <motion.div className="disclosure" layout={!reduced} transition={{ duration: reduced ? 0 : 0.24, ease: EASE_OUT }}>
      <MotionButton
        className="disclosure-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}
        >
          <ChevronRight size={12} />
        </motion.span>
        {title}
      </MotionButton>
      <AnimatePresence initial={false} mode="popLayout">
        {open && (
          <motion.div
            id={id}
            key="details"
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type Step = { title: string; text: string };

/** Numbered steps with a rail that fills with scroll. It tracks reading, not verification. Example: <ReadingSteps steps={steps} />. */
export function ReadingSteps({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 55%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <div ref={ref} className="reading-steps">
      <div className="reading-track" aria-hidden="true">
        <motion.div className="reading-progress" style={{ scaleY: reduced ? 1 : scaleY }} />
      </div>
      {steps.map((step, index) => (
        <ReadingReveal key={step.title} order={index}>
          <article>
            <h3>{step.title}</h3>
            <p className="muted">{step.text}</p>
          </article>
        </ReadingReveal>
      ))}
    </div>
  );
}

/** Scroll progress describes reading, never verification completion. Example: <ReadingPath title="Follow the evidence" steps={[{ title: "Read", text: "Public data." }]} />. */
export function ReadingPath({
  title,
  steps,
  label = "Reading guide",
  note = "The line tracks your place in this explanation.",
}: {
  title: string;
  steps: Step[];
  label?: string;
  note?: string;
}) {
  const id = useId();
  return (
    <section className="section reading-path" aria-labelledby={id}>
      <div>
        <p className="eyebrow">{label}</p>
        <h2 id={id}>{title}</h2>
        <p className="muted reading-note">{note}</p>
      </div>
      <ReadingSteps steps={steps} />
    </section>
  );
}
