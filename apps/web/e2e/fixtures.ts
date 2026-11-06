// SPDX-License-Identifier: Apache-2.0
import { test as base, expect } from "@playwright/test";
import pull from "../tests/fixtures/pull-request.json" with { type: "json" };

export const origin = "http://127.0.0.1:3540";

// Browser traffic never reaches a public service. Next has its own preload guard.
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page, context }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.clock.setFixedTime(new Date("2026-11-06T00:00:00Z"));
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "https://api.github.com" && url.pathname === "/repos/zkasuran/flop-lab/pulls") {
        await route.fulfill({ json: [JSON.parse(pull.raw)], headers: { "x-flop-recorded-at": pull.measuredAt } });
      } else if (url.origin !== origin) {
        errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
      } else if (url.pathname === "/SIGNATURE.json") {
        // There is no deployed build signature in a local checkout. Exercise the explicit unavailable state.
        await route.fulfill({ json: { error: "No deployed build signature in this local test" } });
      } else if (
        (url.pathname === "/explorer/query" && url.searchParams.get("recorded") === "block") ||
        url.pathname.startsWith("/sessions/channel/") ||
        url.pathname === "/knowledge/data"
      ) {
        // These local handlers only adapt committed raw recordings. Never follow redirects.
        const response = await route.fetch({ maxRedirects: 0 });
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    await use(errors);
  },
});
export { expect };
