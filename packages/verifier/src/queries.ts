// SPDX-License-Identifier: Apache-2.0
// Fields recorded by scripts/probe-v2.ts before use. Variables bind each observation to its subject.
export const CHANNEL_QUERY =
  "query($id: String!) { computeChannel(channelId: $id) { channelId agent miner escrow minerPaid burned aggregateGn status marketKind modelHash assuranceTier cooperative finalRoot challengeEnd verifierRef } }";
export const SETTLEMENT_QUERY =
  "query($id: String!) { settlementPrice(channelId: $id) { channelId agent miner escrow minerPaid burned unusedEscrow aggregateGn pricePerGflop settledBlock settledAt settlementKind settlementEvent cooperative modelHash assuranceTier } }";
export const HTLC_QUERY =
  "query($hash: String!) { htlc(hashLock: $hash) { hashLock htlcId sender recipient amount timeout status paymentStatus evidenceStatus verifierRef timeoutPath observationHead preImage gnUsed receiptHash createdAt settledAt refundedAt blockHash blockNumber } }";
