// SPDX-License-Identifier: Apache-2.0
"use client";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { sections, tools } from "@/content/tools";
import { MotionLink } from "../motion";
import { sectionHref } from "./catalogue";
import styles from "./suite.module.css";

/** Persistent section navigation, including tool routes. @example <SectionNavigation /> */
export function SectionNavigation() {
  const pathname = usePathname();
  const reduced = useReducedMotion() !== false;
  const active =
    sections.find((section) => pathname === sectionHref(section.id))?.id ??
    tools.find((tool) => tool.href === pathname)?.section;
  return (
    <nav className={`container ${styles.navigation}`} aria-label="Suite sections">
      {sections.map((section) => (
        <MotionLink
          key={section.id}
          href={sectionHref(section.id)}
          aria-current={active === section.id ? "page" : undefined}
        >
          {section.title}
          {active === section.id && (
            <motion.span
              className={styles.active}
              layoutId={reduced ? undefined : "suite-section"}
              transition={{ duration: reduced ? 0 : 0.24 }}
              aria-hidden="true"
            />
          )}
        </MotionLink>
      ))}
    </nav>
  );
}
