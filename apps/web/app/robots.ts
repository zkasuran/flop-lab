// SPDX-License-Identifier: Apache-2.0
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${process.env.SITE_URL ?? "https://flop-lab.vercel.app"}/sitemap.xml`,
  };
}
