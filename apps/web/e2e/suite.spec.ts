// SPDX-License-Identifier: Apache-2.0
import AxeBuilder from "@axe-core/playwright";
import { tools } from "../content/tools";
import { test, expect } from "./fixtures";
import { interactions, interact } from "./interactions";
import { unreachable } from "./keyboard";
import { execFileSync } from "node:child_process";

const routes = [
  "/",
  "/about",
  "/provenance",
  ...tools.filter((tool) => tool.status !== "planned").map((tool) => tool.href),
];

test("server guard blocks fetch and direct sockets", () => {
  const script = `import assert from 'node:assert/strict'; import net from 'node:net';
    await assert.rejects(fetch('https://example.com/'), /E2E offline/);
    assert.throws(() => net.connect({host: 'example.com', port: 443}), /E2E blocked external socket/);
    process.stdout.write('blocked');`;
  expect(
    execFileSync(
      process.execPath,
      ["--import", new URL("./offline.mjs", import.meta.url).href, "--input-type=module", "-e", script],
      { encoding: "utf8", timeout: 5000 },
    ),
  ).toBe("blocked");
});

test("sitemap and interaction inventory agree", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const paths = [...(await response.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
  expect(paths.sort()).toEqual([...routes].sort());
  expect(routes.filter((path) => !interactions[path])).toEqual([]);
});

for (const path of routes) {
  test(`${path} browser contract`, async ({ page, errors }, info) => {
    if (path === "/yellowpaper") test.setTimeout(240_000);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect.soft(await page.locator("main").count(), "The page must have one main landmark").toBe(1);
    await page.evaluate(() => document.fonts.ready);
    // Wait for React to own the first button, not for an animation to complete.
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some((button) =>
        Object.keys(button).some((key) => key.startsWith("__reactProps")),
      ),
    );
    const movingValues = await page.evaluate(() => {
      const selector = ".observed-number, .swap-value, [data-value], main output";
      return document
        .getAnimations()
        .filter((animation) => {
          const effect = animation.effect;
          if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) return false;
          const duration = effect.getTiming().duration;
          return (
            animation.playState === "running" &&
            typeof duration === "number" &&
            duration > 0 &&
            (effect.target.matches(selector) || effect.target.querySelector(selector))
          );
        })
        .map((animation) => (animation.effect as KeyframeEffect).target?.textContent?.slice(0, 100));
    });
    expect.soft(movingValues, "Reduced motion must show values without an active animation").toEqual([]);
    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    await info.attach("axe", { body: JSON.stringify(serious, null, 2), contentType: "application/json" });
    expect
      .soft(
        serious.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) })),
        "No serious or critical accessibility violations",
      )
      .toEqual([]);
    // Keep the first viewport stable. The build commit is unrelated to visual layout.
    await expect.soft(page).toHaveScreenshot(`${path === "/" ? "home" : path.slice(1)}.png`, {
      animations: "disabled",
      mask: [page.locator("footer .mono")],
    });
    const missing = await unreachable(page);
    expect.soft(missing, "Every enabled visible control must be keyboard reachable").toEqual([]);
    // Keyboard focus can select a row. Reset before the independent primary-action assertion.
    await page.reload();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some((button) =>
        Object.keys(button).some((key) => key.startsWith("__reactProps")),
      ),
    );
    try {
      await interact(page, path);
    } catch (error) {
      expect.soft(error, "The primary interaction must succeed").toBeUndefined();
    }
    expect.soft(errors, "No console errors, page errors or unmocked external requests").toEqual([]);
    await info.attach("observation", {
      body: JSON.stringify({
        path,
        owner: tools.find((tool) => tool.href === path)?.repoPath ?? "apps/web",
        measuredAt: new Date().toISOString(),
        browser: await page.context().browser()?.version(),
        viewport: page.viewportSize(),
        keyboardMissing: missing,
        errors,
      }),
      contentType: "application/json",
    });
  });
}

test("keyboard detector catches an unreachable control", async ({ page, errors }) => {
  await page.goto("/about");
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "QA unreachable mutation";
    button.tabIndex = -1;
    document.body.append(button);
  });
  expect(await unreachable(page)).toContain("BUTTON QA unreachable mutation");
  expect(errors).toEqual([]);
});

test("an empty recorded provenance page says no data", async ({ page, errors }) => {
  await page.route("https://api.github.com/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/provenance");
  await expect(page.getByText("No pull requests returned by GitHub.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("hostile provenance links are rejected before rendering", async ({ page, errors }) => {
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({
      json: [
        {
          number: 1,
          title: "hostile fixture",
          html_url: "javascript:alert(1)",
          body: "",
          state: "open",
          head: { sha: "a".repeat(40), ref: "fixture" },
        },
      ],
    }),
  );
  await page.goto("/provenance");
  await expect(page.getByText("Malformed GitHub pull request fields")).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
