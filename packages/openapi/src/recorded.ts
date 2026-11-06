// SPDX-License-Identifier: Apache-2.0
import recording from "./results.json";
import { parseResult, type Endpoint } from "./schema";

/** Read a validated bundled result without making requests. @example readResult("harness") */
export function readResult(tool: Endpoint) {
  return parseResult(tool, recording[tool]);
}
