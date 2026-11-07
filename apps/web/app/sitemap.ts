// SPDX-License-Identifier: Apache-2.0
import type { MetadataRoute } from "next";
import { tools } from "@/content/tools";
import { sitePages } from "@/components/suite/catalogue";
import { languagePair, translatedPaths } from "./zh/routes";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL ?? "https://flop-lab.vercel.app";
  return [
    ...new Set([
      ...translatedPaths,
      ...translatedPaths.map((path) => languagePair(path)!.zh),
      ...sitePages.map((page) => page.href),
      ...tools.filter((tool) => tool.status !== "planned").map((tool) => tool.href),
    ]),
  ].map((path) => {
    const pair = languagePair(path);
    return {
      url: new URL(path, base).href,
      ...(pair
        ? { alternates: { languages: { en: new URL(pair.en, base).href, "zh-Hans": new URL(pair.zh, base).href } } }
        : {}),
    };
  });
}
