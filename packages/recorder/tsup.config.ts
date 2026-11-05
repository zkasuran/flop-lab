// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  noExternal: [/.*/],
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
