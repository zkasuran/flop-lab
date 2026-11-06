// SPDX-License-Identifier: Apache-2.0
import { FileLedger } from "@flop-lab/spendguard";

// Explicit one-time setup. Never recreate a missing ledger during a turn.
await new FileLedger(".agent-ledger.jsonl").initialize();
console.log("Created local spend ledger. Keep it and its head file across runs.");
