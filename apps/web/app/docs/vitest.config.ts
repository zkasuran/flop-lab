// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["apps/web/app/docs/tests/**/*.test.ts"], maxWorkers: 1 } });
