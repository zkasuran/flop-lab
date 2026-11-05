// SPDX-License-Identifier: Apache-2.0
import type { Citation, Result, Sdk } from "./model.ts";
import { versions } from "./model.ts";

export type Spec = Omit<Result, "status" | "reason" | "attempts">;
function citation(
  sdk: Sdk,
  path: string,
  lines: string,
  quote: string,
  basis: Citation["basis"] = "documented",
): Citation {
  return { source: `https://unpkg.com/@flop-labs/${sdk}@${versions[sdk]}/${path}`, lines, quote, basis };
}
const client = (lines: string, quote: string) => citation("client", "README.md", lines, quote);
const sdk = (path: string, lines: string, quote: string, basis: Citation["basis"] = "type contract") =>
  citation("sdk", path, lines, quote, basis);
const noRetry = client(
  "38",
  "Paid requests are sent once: there are no automatic retries, including on 429, cancellation, or transport failure.",
);
const metadata = client("42", "`FlopHTTPError` retains `status`, `body`, and the raw `retryAfter` header.");
const validation = client(
  "36",
  "Requests are validated before network access; successful JSON responses are checked structurally using the shared contracts.",
);
const faucet = sdk(
  "dist/faucet.d.ts",
  "44-47",
  "HTTP status when the faucet returned a response. / Server cooldown in seconds, when supplied.",
);
const handshake = sdk(
  "dist/x402.d.ts",
  "23-27",
  "1. Parses payment instructions from response headers / 2. Creates an HTLC on-chain to pay the requested amount / 3. Waits for settlement / 4. Retries the original request with payment proof attached",
);
function spec(
  id: string,
  sdkName: Sdk,
  behaviour: string,
  title: string,
  expected: string,
  citation: Citation,
  issue: number | null = null,
): Spec {
  return { id, sdk: sdkName, version: versions[sdkName], behaviour, title, expected, citation, issue };
}
export const catalogue: readonly Spec[] = [
  spec(
    "client-models",
    "client",
    "Discovery",
    "Replay the public model feed",
    "The recorded data survives validation and no bearer is sent.",
    client("34", "Model discovery needs no API key and sends no bearer credential."),
  ),
  spec(
    "client-empty",
    "client",
    "Discovery",
    "Accept an empty model feed",
    "An empty model list returns no rows.",
    validation,
  ),
  spec(
    "client-malformed",
    "client",
    "Validation",
    "Reject malformed success JSON",
    "Malformed JSON is a FlopValidationError after one request.",
    client("42", "`FlopValidationError` reports malformed configuration, input, or successful responses."),
  ),
  spec(
    "client-shape",
    "client",
    "Validation",
    "Reject a hostile model shape",
    "An invalid model row is rejected after one request.",
    validation,
  ),
  spec(
    "client-input",
    "client",
    "Validation",
    "Validate before dispatch",
    "An empty chat messages array is rejected without a request.",
    validation,
  ),
  ...[400, 401, 403, 429, 500, 503].map((status) =>
    spec(
      `client-post-${status}`,
      "client",
      "POST retry",
      `POST refusal ${status}`,
      "One POST. FlopHTTPError retains status, body and Retry-After.",
      { ...noRetry, quote: `${noRetry.quote} / ${metadata.quote}`, lines: "38, 42" },
    ),
  ),
  spec(
    "client-disconnect",
    "client",
    "POST retry",
    "Ambiguous POST disconnect",
    "One POST. The transport failure is surfaced.",
    noRetry,
  ),
  spec(
    "client-timeout",
    "client",
    "Cancellation",
    "Abort before response headers",
    "The exact caller reason propagates without a retry.",
    client("42", "caller cancellation propagates the signal's reason."),
  ),
  spec(
    "client-slow-body",
    "client",
    "Cancellation",
    "Abort a slow response body",
    "Body cancellation propagates the caller reason without a retry.",
    client("42", "caller cancellation propagates the signal's reason."),
  ),
  spec(
    "client-idempotency",
    "client",
    "Replay identity",
    "Preserve a caller replay key",
    "The caller key is sent on exactly one POST.",
    client("89", "Both paid methods accept `{ idempotencyKey }` alongside `signal`."),
  ),
  spec(
    "client-invalid-keys",
    "client",
    "Replay identity",
    "Reject invalid replay keys",
    "Empty, whitespace, control and oversized keys dispatch no requests.",
    client("89-91", "The client never creates a key or retries for you."),
  ),
  ...[400, 401, 403, 429].map((status) =>
    spec(
      `sdk-faucet-${status}`,
      "sdk",
      "Faucet refusal",
      `FaucetClient refusal ${status}`,
      "One refusal is returned with HTTP status and a 120-second cooldown, matching the functional helper.",
      { ...faucet, basis: "issue regression" },
      71,
    ),
  ),
  spec(
    "sdk-faucet-control",
    "sdk",
    "Faucet refusal",
    "Functional faucet control",
    "One 429 is returned with status and Retry-After.",
    faucet,
  ),
  spec(
    "sdk-faucet-recovery",
    "sdk",
    "Retry bounds",
    "Recover from a synthetic 503",
    "The configured faucet retry recovers on the second request.",
    sdk("dist/faucet.d.ts", "27-30", "Maximum retry attempts / Delay between retries in milliseconds"),
  ),
  spec(
    "sdk-faucet-timeout",
    "sdk",
    "Retry bounds",
    "Bound faucet timeouts",
    "Three configured attempts end in a failed result.",
    sdk("dist/faucet.d.ts", "25-28", "Request timeout in milliseconds / Maximum retry attempts"),
  ),
  spec(
    "sdk-x402-post",
    "sdk",
    "POST retry",
    "Management POST refusal",
    "A refused deposit does not resolve as a successful balance or replay the POST.",
    sdk(
      "dist/x402.d.ts",
      "72-75",
      "depositToChannel(channelId: string, amount: number): Promise<{ newBalance: number; }>;",
      "issue regression",
    ),
    72,
  ),
  spec(
    "sdk-x402-function",
    "sdk",
    "402 handshake",
    "Standalone handshake control",
    "One unpaid request, one mock payment and one proof-bearing retry.",
    handshake,
  ),
  spec(
    "sdk-x402-class",
    "sdk",
    "402 handshake",
    "Reuse the first challenge",
    "The class also completes with one unpaid request and one proof-bearing retry.",
    { ...handshake, basis: "issue regression" },
    89,
  ),
  spec(
    "sdk-header-example",
    "sdk",
    "README example",
    "Run the payment-header example",
    "The README's Headers argument is accepted and parsed.",
    sdk("README.md", "316", "const payment = parsePaymentHeaders(response.headers);", "documented"),
  ),
  spec(
    "sdk-capacity",
    "sdk",
    "Worker capacity",
    "Respect full active workers",
    "All documented strategies reject a full active worker before assigning work.",
    sdk("dist/coordination.d.ts", "68-69", "Current workload (0.0 - 1.0).", "issue regression"),
    78,
  ),
  spec(
    "sdk-capacity-control",
    "sdk",
    "Worker capacity",
    "Keep free workers eligible",
    "Free active workers can receive work; empty pools reject it.",
    sdk("dist/coordination.d.ts", "174", "Select the best worker for a task based on load balancing strategy."),
  ),
  spec(
    "sdk-wallet-report",
    "sdk",
    "Wallet reporting",
    "Report rejected wallet creation",
    "Rejected synthetic creation returns walletCreated=false and no transaction hashes.",
    sdk(
      "dist/coordination.d.ts",
      "323-326",
      "walletCreated: boolean; / sessionCreated: boolean; / txHashes: string[];",
      "issue regression",
    ),
    82,
  ),
  spec(
    "cli-version",
    "cli",
    "CLI startup",
    "Run the pinned version command",
    "Exit successfully and report the installed 0.4.0 version.",
    citation("cli", "README.md", "11", "npx --yes --package @flop-labs/cli@0.4.0 flop --version"),
  ),
  spec(
    "cli-help",
    "cli",
    "CLI startup",
    "Expose documented global options",
    "Help includes --network, --rpc and --json.",
    citation("cli", "README.md", "65-71", "--network <name> / --rpc <url> / --json"),
  ),
  spec(
    "cli-wallet",
    "cli",
    "Wallet reporting",
    "Live CLI wallet operations",
    "Not run: this suite has no signer or node RPC.",
    citation("cli", "README.md", "355", "flop wallet agent create <agent-address> --daily-cap 50 --tx-limit 5"),
  ),
  spec(
    "sdk-mcp",
    "sdk",
    "MCP",
    "Hosted MCP SDK transport",
    "No hosted MCP method is documented by these pinned SDKs. The mock is checked with the shared MCP client.",
    {
      source: "https://docs.flop.network/docs/sdk-references",
      lines: "Other public surfaces",
      quote: "Hosted read-only MCP server: https://mcp.flop.network/mcp (streamable HTTP).",
      basis: "documented",
    },
  ),
  spec(
    "python-health",
    "python",
    "HTTP health",
    "Python async health client",
    "A synthetic health response is returned by flop-sdk 0.2.0.",
    {
      source: "https://docs.flop.network/docs/sdk-references",
      lines: "flop-sdk (Python)",
      quote: "async with FlopClient() as client: health = await client.health()",
      basis: "documented",
    },
  ),
];
