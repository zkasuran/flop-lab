// SPDX-License-Identifier: Apache-2.0
"use client";
import { usePathname } from "next/navigation";
import { MotionLink } from "@/components/motion";
import { languagePair } from "./routes";
import styles from "./zh.module.css";

/** A fixed-size, server-rendered language switch. @example <LanguageSwitch /> */
export function LanguageSwitch() {
  const path = usePathname();
  const pair = languagePair(path);
  const chinese = path === "/zh" || path.startsWith("/zh/");
  return (
    <MotionLink
      className={styles.language}
      href={pair ? (chinese ? pair.en : pair.zh) : "/zh"}
      hrefLang={chinese ? "en" : "zh-Hans"}
      lang={chinese ? "en" : "zh-Hans"}
      aria-label={
        chinese ? "EN: Read this page in English" : pair ? "简中：阅读此页的简体中文版" : "简中：打开简体中文首页"
      }
      prefetch={false}
    >
      {chinese ? "EN" : "简中"}
    </MotionLink>
  );
}
