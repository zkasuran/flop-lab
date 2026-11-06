// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  outputDir: "artifacts",
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/results.json" }],
    ["html", { outputFolder: "report", open: "never" }],
  ],
  expect: { timeout: 8000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.2 } },
  use: {
    actionTimeout: 8000,
    baseURL: "http://127.0.0.1:3540",
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "dark",
    contextOptions: { reducedMotion: "reduce" },
    serviceWorkers: "block",
    // Full DOM snapshots on every Tab duplicate the entire paper. Keep action, network and screenshot traces.
    trace: { mode: "retain-on-failure", snapshots: false, screenshots: true, sources: true },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command: "node --import ./e2e/offline.mjs ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3540",
    url: "http://127.0.0.1:3540",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
