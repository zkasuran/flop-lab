// SPDX-License-Identifier: Apache-2.0
import type { Page } from "@playwright/test";

/** Walk actual Tab stops and return enabled controls the keyboard never reached. @example await unreachable(page). */
export async function unreachable(page: Page): Promise<string[]> {
  const targets = await page.evaluate(() => {
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="checkbox"], [tabindex]';
    const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
      if (!el.checkVisibility() || el.matches(":disabled") || el.closest("[inert]")) return false;
      // A native radio group has one Tab stop. Arrow keys reach its other choices.
      if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
        const group = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
          (item) => item.name === el.name && item.form === el.form,
        );
        return el === (group.find((item) => item.checked) ?? group[0]);
      }
      return true;
    });
    return controls.map((el, index) => {
      el.dataset.qaKey = String(index);
      return {
        id: String(index),
        name: `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 90) ?? el.id}`,
      };
    });
  });
  const seen = new Set<string>();
  const groups = new Set<string>();
  const hasRoving = await page.locator('[role="tablist"] [tabindex="-1"], [role="group"] [tabindex="-1"]').count();
  // Visit the initial panel before arrow keys replace it with another panel.
  for (const arrows of [false, true]) {
    if (arrows && (!hasRoving || seen.size === targets.length)) break;
    let first: string | undefined;
    for (let index = 0; index < targets.length + 4; index++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.qaKey);
      if (index > 0 && first !== undefined && id === first) break;
      first ??= id;
      if (id) seen.add(id);
      const group = arrows
        ? await page.evaluate(() => {
            const parent = document.activeElement?.closest('[role="group"], [role="tablist"]');
            if (!parent?.querySelector('[tabindex="-1"]')) return null;
            const children = [...parent.querySelectorAll<HTMLElement>("[data-qa-key]")];
            return {
              id: children[0]?.dataset.qaKey ?? "",
              count: children.length,
              key: parent.getAttribute("aria-orientation") === "vertical" ? "ArrowDown" : "ArrowRight",
            };
          })
        : null;
      if (group && !groups.has(group.id)) {
        groups.add(group.id);
        let previous = id;
        for (let step = 0; step < group.count; step++) {
          await page.keyboard.press(group.key);
          const next = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.qaKey);
          if (next) seen.add(next);
          if (next === previous) break;
          previous = next;
        }
      }
      if (seen.size === targets.length) break;
    }
  }
  return targets.filter((target) => !seen.has(target.id)).map((target) => target.name);
}
