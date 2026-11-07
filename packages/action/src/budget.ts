// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_URL, McpError } from "@flop-lab/mcp";

/** Bound actual HTTP attempts across checks, including retries. @example const budget = requestBudget(3); */
export function requestBudget(maxRequests: number, transport: typeof fetch = fetch) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0 || maxRequests > 30)
    throw new Error("Invalid request budget");
  let requests = 0;
  const deadline = AbortSignal.timeout(120_000);
  const bounded: typeof fetch = async (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url !== DEFAULT_URL || init?.method !== "POST")
      throw new McpError("Only the public MCP endpoint is allowed", "protocol");
    if (requests >= maxRequests || deadline.aborted)
      throw new McpError("Action request budget or deadline exhausted", "protocol");
    requests++;
    return transport(input, {
      ...init,
      redirect: "error",
      signal: init.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
    });
  };
  return {
    fetch: bounded,
    get requests() {
      return requests;
    },
    get remaining() {
      return maxRequests - requests;
    },
  };
}
