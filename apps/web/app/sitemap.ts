// SPDX-License-Identifier: Apache-2.0
import type { MetadataRoute } from "next";
import { tools } from "@/content/tools";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL ?? "https://flop-lab.vercel.app";
  return [
    "/",
    "/about",
    "/provenance",
    ...tools.filter((tool) => tool.status !== "planned").map((tool) => tool.href),
  ].map((path) => ({ url: new URL(path, base).href }));
}
