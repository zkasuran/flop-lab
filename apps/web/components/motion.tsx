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
import { useId, useRef, useState, type ReactNode } from "react";

const LinkWithMotion = motion.create(Link);

/** Immediate actions with transform-only feedback. Example: <MotionButton onClick={copy}>Copy</MotionButton>. */
export function MotionButton(props: HTMLMotionProps<"button">) {
  const reduced = useReducedMotion() !== false;
  return (
    <motion.button
      whileHover={{ y: reduced ? 0 : -1 }}
      whileTap={{ scale: reduced ? 1 : 0.97 }}
      whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
      transition={{ duration: reduced ? 0 : 0.16 }}
      {...props}
    />
  );
}

/** Client navigation keeps the shared shell mounted. Example: <MotionLink href="/provenance">Verify</MotionLink>. */
export function MotionLink(props: React.ComponentProps<typeof LinkWithMotion>) {
  const reduced = useReducedMotion() !== false;
  return (
    <LinkWithMotion
      whileHover={{ y: reduced ? 0 : -2 }}
      whileTap={{ scale: reduced ? 1 : 0.98 }}
      whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      {...props}
    />
  );
}

/** Route arrivals preserve visible server-rendered content. Example: <RouteSurface>{children}</RouteSurface>. */
export function RouteSurface({ children }: { children: ReactNode }) {
  const path = usePathname();
  const reduced = useReducedMotion() !== false;
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="suite-routes">
        <motion.div
          className="route-surface"
          key={path}
          initial={{ y: reduced ? 0 : 8 }}
          animate={{ y: 0 }}
          transition={{ duration: reduced ? 0 : 0.24 }}
        >
          {children}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}

/** Reveal content in reading order without hiding its final value. Example: <ReadingReveal order={1}>...</ReadingReveal>. */
export function ReadingReveal({ children, order = 0 }: { children: ReactNode; order?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "0px 0px -24px 0px" });
  const reduced = useReducedMotion() !== false;
  return (
    <motion.div
      ref={ref}
      className="reading-reveal"
      initial={false}
      animate={{ y: reduced || visible ? 0 : 14 }}
      transition={{ duration: reduced ? 0 : 0.32, delay: reduced ? 0 : Math.min(order * 0.06, 0.24) }}
    >
      {children}
    </motion.div>
  );
}

/** Animate a measured number as a whole, never invent intermediate counts. Example: <ObservedNumber value={snapshot.stats.value?.block} />. */
export function ObservedNumber({ value }: { value: number | undefined }) {
  const reduced = useReducedMotion() !== false;
  return (
    <motion.span
      className="observed-number"
      key={value ?? "missing"}
      initial={{ y: reduced ? 0 : 7 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: reduced ? 0 : 0.36 }}
    >
      {value?.toLocaleString("en-US") ?? "No data"}
    </motion.span>
  );
}

/** A keyboard disclosure with immediate expanded state. Example: <Disclosure title="Inspect bytes">...</Disclosure>. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion() !== false;
  return (
    <motion.div className="disclosure" layout={!reduced} transition={{ duration: reduced ? 0 : 0.24 }}>
      <MotionButton
        className="disclosure-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          ›
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
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Scroll progress describes reading, never verification completion. Example: <ReadingPath title="Follow the evidence" steps={[{ title: "Read", text: "Public data." }]} />. */
export function ReadingPath({ title, steps }: { title: string; steps: { title: string; text: string }[] }) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 50%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section ref={ref} className="section reading-path" aria-labelledby={id}>
      <div>
        <p className="eyebrow">Reading guide</p>
        <h2 id={id}>{title}</h2>
        <p className="muted reading-note">The line tracks your place in this explanation.</p>
      </div>
      <div className="reading-steps">
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
    </section>
  );
}
