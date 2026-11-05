// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import type { EstimateOutput } from "../src/sdk";

// An explicit installed SDK module is supplied by the researcher. This script signs nothing.
const modulePath = process.env.SDK_MODULE;
if (!modulePath) throw new Error("Set SDK_MODULE to an installed @flop-labs/sdk@0.4.0 ESM entry");
const loaded = (await import(modulePath)) as {
  computeChannel: {
    QWEN2_5_0_5B: Record<string, bigint | boolean>;
    estimateSession(input: unknown): EstimateOutput;
  };
};
const input = {
  arch: loaded.computeChannel.QWEN2_5_0_5B,
  turns: [{ contextTokens: 10n, generatedTokens: 4n }],
  capGflopsPerSec: 10000n,
  flopPerGn: "0.1",
  blockTimeMs: 1000n,
  basePerTurnRaw: 1n,
};
const output = loaded.computeChannel.estimateSession(input);
const record = {
  measuredAt: new Date().toISOString(),
  source: "https://registry.npmjs.org/@flop-labs/sdk/-/sdk-0.4.0.tgz",
  description: "Real SDK output for synthetic token, calibration and price inputs. No network call.",
  input,
  output,
};
const json = JSON.stringify(record, (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value), 2);
await writeFile("fixtures/sdk-estimate.json", `${json}\n`);
console.log(json);
