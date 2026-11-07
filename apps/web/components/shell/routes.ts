// SPDX-License-Identifier: Apache-2.0
import { pathLocale } from "./locale";

const STORY_PAGES = new Set(["/", "/findings", "/network", "/about", "/provenance", "/docs"]);

/**
 * Story pages carry the cursor, smooth scroll and scroll choreography. Tool pages stay calm, so their
 * workbenches keep native scrolling and the system cursor. The Chinese pages follow their English pair.
 * Example: isStoryPath("/zh/sections/verify") is true.
 */
export function isStoryPath(path: string): boolean {
  const { base } = pathLocale(path);
  return STORY_PAGES.has(base) || base.startsWith("/sections/") || base.startsWith("/docs/");
}
