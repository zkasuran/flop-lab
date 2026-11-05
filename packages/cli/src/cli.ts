#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeIo, run } from "./run";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
run(process.argv.slice(2), nodeIo(packageDir)).then((code) => {
  process.exitCode = code;
});
