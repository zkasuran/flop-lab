#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { endpoints, type Endpoint } from "./schema";
import { openapiDocument } from "./document";
import { readResult } from "./recorded";
const args = process.argv.slice(2);
try {
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]!))) {
    console.log(
      "flop-openapi document | list | result <tool>\nRead bundled dated results. No network requests.\nTools: " +
        endpoints.join(", "),
    );
  } else if (args.length === 1 && args[0] === "document") console.log(JSON.stringify(openapiDocument(), null, 2));
  else if (args.length === 1 && args[0] === "list") console.log(JSON.stringify(endpoints, null, 2));
  else if (args.length === 2 && args[0] === "result" && endpoints.includes(args[1] as Endpoint))
    console.log(JSON.stringify(readResult(args[1] as Endpoint), null, 2));
  else throw new Error("Use document, list or result <tool>. See --help.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
