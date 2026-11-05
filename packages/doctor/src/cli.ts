#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { accessRequest, diagnose, markdown } from "./index.js";

const help = `flop-doctor miner|validator [--json | --markdown | --access-request]
Read-only operator preflight. No installation or signed operations.

--offline           Skip the model catalogue and HTTPS Date requests
--include-host      Include this machine's hostname in the report
--disk-path PATH    Filesystem to measure (default: current directory)
--worker-image REF  Version-and-sha256 worker pin (miner)
--backend-image REF Version-and-sha256 backend pin (miner)
--node-image REF    Version-and-sha256 node pin (validator)
--da-image REF      Version-and-sha256 DA pin (validator)
--da-port PORT      Approved release's DA port; no default is assumed
--skip-ports        Skip transient loopback binds

Exit: 0 READY, 1 NOT_READY, 2 UNKNOWN, 64 invalid arguments.
Missing tools and denied access produce UNKNOWN. READY is check-specific.
Network: at most two requests, no retries, cache TTL 0. On 429 or 5xx stop;
honor the service Retry-After before another run. HTTP Date is coarse.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      markdown: { type: "boolean" },
      "access-request": { type: "boolean" },
      offline: { type: "boolean" },
      "include-host": { type: "boolean" },
      "skip-ports": { type: "boolean" },
      "disk-path": { type: "string" },
      "worker-image": { type: "string" },
      "backend-image": { type: "string" },
      "node-image": { type: "string" },
      "da-image": { type: "string" },
      "da-port": { type: "string" },
    },
  });
  if (values.help) {
    process.stdout.write(help);
  } else {
    const role = positionals[0];
    if (positionals.length !== 1 || (role !== "miner" && role !== "validator"))
      throw new Error("Choose miner or validator");
    if ([values.json, values.markdown, values["access-request"]].filter(Boolean).length > 1)
      throw new Error("Choose one output format");
    const portText = values["da-port"];
    const daPort = portText === undefined ? undefined : Number(portText);
    if (
      portText !== undefined &&
      (!/^\d+$/.test(portText) || !Number.isInteger(daPort) || daPort! < 1 || daPort! > 65535)
    )
      throw new Error("Invalid DA port");
    const images: Record<string, string> = {};
    for (const name of ["worker", "backend", "node", "da"] as const) {
      const ref = values[`${name}-image`];
      if (ref !== undefined) images[name] = ref;
    }
    const report = await diagnose({
      role,
      offline: values.offline ?? false,
      includeHost: values["include-host"] ?? false,
      skipPorts: values["skip-ports"] ?? false,
      ...(values["disk-path"] ? { diskPath: values["disk-path"] } : {}),
      ...(daPort ? { daPort } : {}),
      images,
    });
    process.stdout.write(
      values.json
        ? JSON.stringify(report, null, 2) + "\n"
        : values["access-request"]
          ? accessRequest(report)
          : markdown(report),
    );
    process.exitCode = report.status === "READY" ? 0 : report.status === "NOT_READY" ? 1 : 2;
  }
} catch {
  process.stderr.write("Invalid arguments or preflight failure. Run flop-doctor --help.\n");
  process.exitCode = 64;
}
