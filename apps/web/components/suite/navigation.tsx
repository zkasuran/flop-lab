// SPDX-License-Identifier: Apache-2.0
"use client";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { sections, tools } from "@/content/tools";
import { MotionLink } from "../motion";
import { sectionHref } from "./catalogue";
import styles from "./suite.module.css";
import { sectionCopy } from "@/app/zh/translations/sections";
import { common } from "@/app/zh/translations/common";

/** Persistent section navigation, including tool routes. @example <SectionNavigation /> */
export function SectionNavigation() {
  const pathname = usePathname();
  const chinese = pathname === "/zh" || pathname.startsWith("/zh/");
  const base = chinese ? pathname.slice(3) || "/" : pathname;
  const reduced = useReducedMotion() !== false;
  const active =
    sections.find((section) => base === sectionHref(section.id))?.id ??
    tools.find((tool) => tool.href === base)?.section;
  return (
    <nav
      className={`container ${styles.navigation}`}
      aria-label={common[chinese ? "zh" : "en"].sections}
      lang={chinese ? "zh-Hans" : "en"}
    >
      {sections.map((section) => (
        <MotionLink
          key={section.id}
          href={`${chinese ? "/zh" : ""}${sectionHref(section.id)}`}
          aria-current={active === section.id ? "page" : undefined}
        >
          <span lang={chinese && !sectionCopy[section.id] ? "en" : undefined}>
            {chinese ? (sectionCopy[section.id]?.zh.title ?? section.title) : section.title}
          </span>
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
