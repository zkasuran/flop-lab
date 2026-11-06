// SPDX-License-Identifier: Apache-2.0
"use client";

import {
  AnimatePresence,
  motion,
  MotionConfig,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Fragment,
  ViewTransition,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronRight } from "./icons";

const LinkWithMotion = motion.create(Link);

/** Shared easing. Interface feedback finishes within 600 ms. Decorative loops live in their own components. */
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
      whileHover={{ y: reduced ? 0 : -1 }}
      whileTap={{ scale: reduced ? 1 : 0.98 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}
      {...props}
    />
  );
}

/**
 * Route changes run through React's ViewTransition. The old page fades out and the new one rises in, while a named
 * ToolMark morphs from its card into the tool header. The first paint is never animated, so server-rendered content
 * stays visible. Browsers without view transitions switch at once. Example: <RouteSurface>{children}</RouteSurface>.
 */
export function RouteSurface({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <ViewTransition key={path} enter="route-enter" exit="route-exit" default="none">
        <div className="route-surface">{children}</div>
      </ViewTransition>
    </MotionConfig>
  );
}

/**
 * Pull a control a few pixels toward the pointer. The wrapper widens the hover area, so the pull starts just
 * before the pointer reaches the control. Mouse only. Reduced motion keeps it still.
 * Example: <Magnetic><MotionLink className="button" href="/verify">Check</MotionLink></Magnetic>.
 */
export function Magnetic({
  children,
  strength = 0.3,
  limit = 10,
  className,
}: {
  children: ReactNode;
  strength?: number;
  limit?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion() !== false;
  const spring = { stiffness: 240, damping: 16, mass: 0.5 };
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const clamp = (value: number) => Math.max(-limit, Math.min(limit, value));
  const move = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (reduced || event.pointerType !== "mouse") return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    x.set(clamp((event.clientX - (box.left + box.width / 2)) * strength));
    y.set(clamp((event.clientY - (box.top + box.height / 2)) * strength));
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <motion.span
      ref={ref}
      className={className ? `magnetic ${className}` : "magnetic"}
      style={{ x, y }}
      onPointerMove={move}
      onPointerLeave={reset}
    >
      {children}
    </motion.span>
  );
}

/**
 * Headline words rise into place once at first paint, driven by CSS so the text never waits for hydration.
 * Reduced motion shows the words at once. Example: <SplitWords text="See the network." />.
 */
export function SplitWords({ text, start = 0, className }: { text: string; start?: number; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className ? `split-words ${className}` : "split-words"}>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="split-word">
            <span style={{ "--i": start + index } as CSSProperties}>{word}</span>
          </span>
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
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
  const visible = useInView(ref, { once: true, margin: "0px 0px -24px 0px" });
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
export function ObservedNumber({ value }: { value: number | undefined }) {
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
      {value?.toLocaleString("en-US") ?? "No data"}
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
export function ReadingPath({ title, steps }: { title: string; steps: Step[] }) {
  const id = useId();
  return (
    <section className="section reading-path" aria-labelledby={id}>
      <div>
        <p className="eyebrow">Reading guide</p>
        <h2 id={id}>{title}</h2>
        <p className="muted reading-note">The line tracks your place in this explanation.</p>
      </div>
      <ReadingSteps steps={steps} />
    </section>
  );
}
