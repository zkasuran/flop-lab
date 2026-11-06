// SPDX-License-Identifier: Apache-2.0

const STORY_PAGES = new Set(["/", "/findings", "/network", "/about", "/provenance"]);

/**
 * Story pages carry the cursor, smooth scroll and scroll choreography. Tool pages stay calm, so their
 * workbenches keep native scrolling and the system cursor. Example: isStoryPath("/sections/verify") is true.
 */
export function isStoryPath(path: string): boolean {
  return STORY_PAGES.has(path) || path.startsWith("/sections/");
}
