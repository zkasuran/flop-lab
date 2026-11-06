// SPDX-License-Identifier: Apache-2.0
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { STATUS_ORDER, statusLabel, type ClaimStatus } from "@/lib/status";
import { EASE_OUT, useSeen } from "../motion";
import styles from "./home.module.css";

/** Proportional result bar for a recorded run. Segment widths come from the counts only. Example: <OutcomeBar counts={run.counts} />. */
export function OutcomeBar({ counts }: { counts: Record<ClaimStatus, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useSeen(ref, 0.6);
  const reduced = useReducedMotion() !== false;
  const present = STATUS_ORDER.filter((status) => counts[status] > 0);
  return (
    <div
      ref={ref}
      className={styles.outcomeBar}
      role="img"
      aria-label={present.map((status) => `${counts[status]} ${statusLabel(status).toLowerCase()}`).join(", ")}
    >
      {present.map((status, index) => (
        <motion.span
          key={status}
          data-status={status}
          style={{ flexGrow: counts[status], transformOrigin: "left" }}
          initial={false}
          animate={{ scaleX: shown ? 1 : 0 }}
          transition={{ duration: reduced ? 0 : 0.42, ease: EASE_OUT, delay: reduced ? 0 : index * 0.06 }}
        />
      ))}
    </div>
  );
}
