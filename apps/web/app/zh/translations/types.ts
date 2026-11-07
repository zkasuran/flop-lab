// SPDX-License-Identifier: Apache-2.0
export type Locale = "en" | "zh";
export type Chinese<T> = { [K in keyof T]: string };
export type Dictionary = { en: Record<string, string>; zh: Record<string, string> };
export type SectionDictionary = Dictionary & { metrics?: Record<string, { label: string; note: string }> };

/** Report missing, empty and unexpected translations. @example translationGaps(home) */
export function translationGaps({ en, zh }: Dictionary): string[] {
  return [
    ...Object.keys(en).filter((key) => !Object.hasOwn(zh, key) || !zh[key]?.trim()),
    ...Object.keys(zh).filter((key) => !Object.hasOwn(en, key)),
  ];
}
