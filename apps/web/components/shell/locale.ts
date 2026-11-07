// SPDX-License-Identifier: Apache-2.0
import { languagePair } from "@/app/zh/routes";
import type { Locale } from "@/app/zh/translations/types";

/** Split a pathname into its locale and the English route behind it. @example pathLocale("/zh/docs") */
export function pathLocale(path: string): { locale: Locale; base: string } {
  const chinese = path === "/zh" || path.startsWith("/zh/");
  return { locale: chinese ? "zh" : "en", base: chinese ? path.slice(3) || "/" : path };
}

/** Keep a site link on the Chinese pages only when that page has a translation. @example localized("/docs", "zh") */
export function localized(path: string, locale: Locale): string {
  if (locale === "en") return path;
  return languagePair(path)?.zh ?? path;
}
