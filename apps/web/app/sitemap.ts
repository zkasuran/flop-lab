// SPDX-License-Identifier: Apache-2.0
import type { MetadataRoute } from "next";
import { sections, tools } from "@/content/tools";
import { sitePages } from "@/components/suite/catalogue";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL ?? "https://flop-lab.vercel.app";
  return [
    "/",
    ...sitePages.map((page) => page.href),
    ...sections.map((section) => `/sections/${section.id}`),
    ...tools.filter((tool) => tool.status !== "planned").map((tool) => tool.href),
  ].map((path) => ({ url: new URL(path, base).href }));
}
