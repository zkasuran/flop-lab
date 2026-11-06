// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { diagnose } from "@flop-lab/doctor";
import { localDiskPath } from "../src/recorded";
const report = await diagnose({ role: "miner", offline: true, skipPorts: true, diskPath: localDiskPath() });
await writeFile(new URL("../fixtures/doctor.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ measuredAt: report.measuredAt, status: report.status, requests: report.requests }));
