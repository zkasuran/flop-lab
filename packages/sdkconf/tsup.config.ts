// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/worker.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  external: ["@flop-labs/sdk", "@flop-labs/client", "@flop-labs/cli"],
});
