// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "./fixtures";

test("action records a meaningful layout transition", async ({ page, errors }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/action");
  await page.evaluate(() => document.fonts.ready);
  const heading = page.getByRole("heading", { name: "See what the job can prove." });
  await heading.scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Include spec", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  const frames: Buffer[] = [];
  const times: number[] = [];
  const start = performance.now();
  for (const delay of [0, 100, 220]) {
    if (delay) await page.waitForTimeout(delay);
    frames.push(await page.screenshot({ path: info.outputPath(`frame-${frames.length}.png`) }));
    times.push(Math.round(performance.now() - start));
  }
  await expect(page.getByRole("heading", { name: "spec", exact: true })).toBeVisible();
  expect(frames[0]!.equals(frames.at(-1)!)).toBe(false);
  expect(errors).toEqual([]);
  await info.attach("frame-times", {
    body: JSON.stringify({ elapsedMs: times, viewport: page.viewportSize() }),
    contentType: "application/json",
  });
});
