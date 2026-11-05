// SPDX-License-Identifier: Apache-2.0
import block from "../test/fixtures/block.json";
import transaction from "../test/fixtures/transaction.json";
import account from "../test/fixtures/account.json";
import channel from "../test/fixtures/channel.json";
import htlc from "../test/fixtures/htlc.json";
import { parseExploration } from "./report";
import type { Kind } from "./types";

const recordings = { block, transaction, account, channel, htlc };
/** Load and validate a real recorded entity search. No live request is made.
 * @example recordedExploration("channel")
 */
export function recordedExploration(kind: Kind) {
  if (!Object.hasOwn(recordings, kind)) throw new Error("Unknown recording");
  return parseExploration(structuredClone({ ...recordings[kind], mode: "recorded" }));
}
