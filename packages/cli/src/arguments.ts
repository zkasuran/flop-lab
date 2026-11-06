// SPDX-License-Identifier: Apache-2.0
import type { Command } from "./commands";

// These child operations already emit one JSON value and do not accept --json.
// Streaming operations and text-producing operations are deliberately absent.
export const nativeJsonOperations: Readonly<Record<string, readonly string[]>> = {
  "@flop-lab/export": [
    "settlements",
    "channels",
    "blocks",
    "transactions",
    "accounts",
    "models",
    "price-sources",
    "proofs",
    "snapshots",
  ],
  "@flop-lab/community": ["lint-access"],
  "@flop-lab/watch": ["check"],
  "@flop-lab/swaps": ["plan", "generate", "check", "observe"],
  "@flop-lab/recorder": ["record", "analyze", "verify"],
  "@flop-lab/harness": ["run", "list", "coverage", "history"],
  "@flop-lab/spendguard": ["init", "verify", "evaluate", "lint", "replay", "shared-init", "reserve"],
  "@flop-lab/x402kit": ["inspect", "check", "client"],
};

/**
 * Accept a trailing --json for known JSON-native operations. Everything else passes through.
 * Example: toolArguments(swapCommand, ["observe", "--recorded", "--json"]) returns ["observe", "--recorded"].
 */
export function toolArguments(command: Command, args: readonly string[]): readonly string[] {
  if (
    Object.hasOwn(nativeJsonOperations, command.pkg) &&
    nativeJsonOperations[command.pkg]!.includes(args[0] ?? "") &&
    args.length > 1 &&
    args.at(-1) === "--json" &&
    args.filter((arg) => arg === "--json").length === 1 &&
    !args.includes("--")
  )
    return args.slice(0, -1);
  return args;
}
