// SPDX-License-Identifier: Apache-2.0
import { expect, type Page } from "@playwright/test";

type Interaction = { button?: RegExp; role?: "tab"; input?: string; select?: [string, string]; checkbox?: RegExp };
// Each route has a deliberate primary action. A new route without one fails the inventory check.
export const interactions: Record<string, Interaction> = {
  "/": { button: /^Claim 2 of/ },
  "/about": { button: /Flip a signed byte/ },
  "/provenance": { checkbox: /Tamper: flip/ },
  "/scoreboard": { input: 'input[placeholder="Filter miners"]' },
  "/harness": { input: 'input[placeholder="ID, expected value or reason"]' },
  "/verify": { button: /^Fail$/ },
  "/spendguard": { button: /^Next recorded row$/ },
  "/x402": { button: /^2\. Paywall to client/ },
  "/kestra": { button: /Collect settlements/, role: "tab" },
  "/challenger": { button: /^Inspect claim / },
  "/history": { button: /^Accounts$/ },
  "/explorer": { button: /^Block$/ },
  "/spec": { input: 'input[aria-label="Search clauses"]' },
  "/contracts": { button: /^Inspect flop_knowledge_get$/ },
  "/indexer": { button: /^FAIL\s*miners:/ },
  "/sdk": { button: /^Inspect Chain SDK Faucet refusal$/ },
  "/console": { button: /^Cost estimator$/, role: "tab" },
  "/start": { button: /src\/guards.ts/ },
  "/doctor": { button: /^Validator$/ },
  "/tclk": { select: ["#tclk-path", "happy"] },
  "/did": { button: /^Flip one signed byte$/ },
  "/models": { button: /^Inspect .* price sources$/ },
  "/sessions": { button: /^Trace$/ },
  "/finality": { button: /#3005602\. Inspect block$/ },
  "/upgrades": { button: /^SDK$/ },
  "/economics": { button: /^Subsidy ends$/ },
  "/metering": { button: /^Exact expiry$/ },
  "/proofs": { button: /^Leaderboards$/ },
  "/invariants": { button: /^M2\b/ },
  "/yellowpaper": { input: "#paper-search" },
  "/knowledge": { input: 'input[aria-label="Search concepts"]' },
  "/staking": { button: /^200 GFLOP\/s$/ },
  "/watch": { button: /^Next observation/ },
  "/swaps": { button: /^Margin too short$/ },
};

/** Exercise a named primary action and require a changed rendered result. @example await interact(page, '/spec'). */
export async function interact(page: Page, path: string) {
  const action = interactions[path];
  if (!action) throw new Error(`Missing primary interaction for ${path}`);
  const main = page.locator("main").first();
  const before = await main.innerText();
  if (action.button)
    await main
      .getByRole(action.role ?? "button", { name: action.button })
      .first()
      .click();
  if (action.checkbox) await main.getByRole("checkbox", { name: action.checkbox }).last().check();
  if (action.input) await main.locator(action.input).fill("qa-no-match-7f98a4");
  if (action.select) await main.locator(action.select[0]).selectOption(action.select[1]);
  await expect(main, `The primary action on ${path} must update the result`).not.toHaveText(before, {
    useInnerText: true,
  });
}
