// SPDX-License-Identifier: Apache-2.0
export const STATS_FIELDS = "latestBlockNumber totalBlocks totalTransactions totalAccounts";
export const QUERY = `query Audit($limit: Int!) {
  stats { ${STATS_FIELDS} }
  blocks(limit: $limit) { number hash parentHash }
  pouiLeaderboard(limit: $limit) { submitter totalWeight proofsCount }
  settlementPrices(limit: $limit) {
    pagination { total limit offset hasMore }
    data { channelId settledBlock settledBlockHash settledAt agent miner escrow minerPaid burned unusedEscrow aggregateGn pricePerGflop marketKind }
  }
}`;
export const COUNTERS_QUERY = `{ stats { ${STATS_FIELDS} } }`;
