// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { sections } from "@/content/tools";
import type { Locale } from "./translations/types";
export const translatedPaths = ["/", "/docs", ...sections.map(({ id }) => `/sections/${id}`)];

/** Resolve only existing translated routes. Unknown routes have no alternate. @example languagePair('/zh/docs') */
export function languagePair(path: string): { en: string; zh: string } | null {
  const base = path === "/zh" ? "/" : path.startsWith("/zh/") ? path.slice(3) : path;
  if (!translatedPaths.includes(base)) return null;
  return { en: base, zh: base === "/" ? "/zh" : `/zh${base}` };
}

/** Reciprocal SEO alternates for supported pages. @example languageMetadata('/docs', 'zh') */
export function languageMetadata(path: string, locale: Locale): Metadata {
  const pair = languagePair(path);
  if (!pair) return {};
  return {
    alternates: { canonical: pair[locale], languages: { en: pair.en, "zh-Hans": pair.zh, "x-default": pair.en } },
  };
}
