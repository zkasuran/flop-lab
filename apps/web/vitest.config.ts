// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
  test: { include: ["tests/**/*.test.ts"], maxWorkers: 2 },
});
