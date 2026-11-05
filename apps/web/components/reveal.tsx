// SPDX-License-Identifier: Apache-2.0
"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";

export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "0px 0px -24px 0px" });
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{ y: reduced || visible ? 0 : 12 }}
      transition={{ duration: reduced ? 0 : 0.4 }}
    >
      {children}
    </motion.div>
  );
}
