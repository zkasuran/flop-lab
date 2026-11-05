// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { runHarness } from "../src/runner";

it.skipIf(process.env.FLOP_LIVE !== "1")(
  "checks the public gateway when explicitly enabled",
  async (context) => {
    const report = await runHarness({ only: "gateway-contract", maxRequests: 6 });
    const result = report.results.find((result) => result.claim.id === "gateway-contract")!;
    if (result.status === "UNVERIFIABLE" || result.status === "SKIPPED") context.skip();
    expect(result.status).toBe("PASS");
  },
  60_000,
);
