// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { pickResponse } from "@flop-lab/mcp";
import { loadClaims } from "../src/catalogue";
import { checkClaim } from "../src/checks";
import { Context } from "../src/context";
import { Transport } from "../src/transport";
import { CI_CLAIMS, runHarness } from "../src/runner";
import { object } from "../src/validation";
import { recordedFetch } from "./replay";
const claims = await loadClaims();
const fixture = JSON.parse(await readFile(new URL("../fixtures/expanded/probe-4.json", import.meta.url), "utf8")) as {
  response: string;
  request: { body: string };
};
const rpcId = Number(object(JSON.parse(fixture.request.body)).id);
const response = object(pickResponse(fixture.response, rpcId).result);
const catalog = JSON.parse(String(object((response.content as unknown[])[0]).text)) as unknown;
function context(value: unknown = catalog) {
  const ctx = new Context(new Transport({ maxRequests: 0 }));
  ctx.call = async () => structuredClone(value);
  return ctx;
}
const reward = claims.find((claim) => claim.id === "docs-initial-block-reward")!;

describe("extracted public predicates", () => {
  it("compares the recorded catalog in exact units", async () => {
    expect((await checkClaim(reward, context())).status).toBe("PASS");
    expect((await checkClaim({ ...reward, args: { ...reward.args, value: "97" } }, context())).status).toBe("FAIL");
    expect((await checkClaim({ ...reward, args: { ...reward.args, unit: "blocks" } }, context())).status).toBe(
      "UNVERIFIABLE",
    );
  });
  it("does not pass missing rows or accept duplicate catalog identities", async () => {
    expect((await checkClaim({ ...reward, args: { ...reward.args, name: "missing" } }, context())).status).toBe(
      "UNVERIFIABLE",
    );
    const bad = object(structuredClone(catalog));
    const line = String(bad.content)
      .split("\n")
      .find((line) => line.startsWith("| `initial_block_reward`"))!;
    bad.content = String(bad.content).replace(line, `${line}\n${line}`);
    await expect(checkClaim(reward, context(bad))).rejects.toThrow("Duplicate");
  });
  it("checks the full hosted inventory but never calls a write method", async () => {
    const ctx = new Context(new Transport({ fetch: recordedFetch(), intervalMs: 0, maxRequests: 4 }));
    const claim = claims.find((claim) => claim.id === "hosted-session-boundary")!;
    expect((await checkClaim(claim, ctx)).status).toBe("PASS");
    const tools = await ctx.tools();
    ctx.tools = async () => [
      ...tools,
      { name: "flop_run_session", description: "test mutation", inputSchema: {}, annotations: { readOnlyHint: false } },
    ];
    expect((await checkClaim(claim, ctx)).status).toBe("FAIL");
    ctx.tools = async () => [];
    expect((await checkClaim(claim, ctx)).status).toBe("UNVERIFIABLE");
  });
  it("keeps the ci subset under its attempt ceiling, including failures", async () => {
    const report = await runHarness({
      profile: "ci",
      claims,
      transport: new Transport({ fetch: recordedFetch(), intervalMs: 0, maxRequests: 100, sleep: async () => {} }),
    });
    expect(report.budget.requests).toBeLessThanOrEqual(12);
    expect(report.budget.maxRequests).toBe(12);
    expect(
      report.results
        .filter((result) => result.reason !== "Not selected by ci profile")
        .map((result) => result.claim.id)
        .sort(),
    ).toEqual([...CI_CLAIMS].sort());
    await expect(runHarness({ profile: "ci", only: "settlement-conservation" })).rejects.toThrow("outside");
  });
});
