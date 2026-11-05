// SPDX-License-Identifier: Apache-2.0
import type { Policy, SpendRequest } from "../src/policy";
export const policy: Policy = {
  version: 1,
  budgets: { task: "10", hour: "10", day: "10", total: "10" },
  maxPricePerGflop: "1",
  maxEscrowPerSession: "10",
  allowModels: ["model"],
  allowMiners: ["miner"],
  denyMiners: [],
  modelCaps: {},
  minerCaps: {},
  requireDryRun: false,
  cooldown: 0,
};
export const request: SpendRequest = {
  id: "request",
  task: "task",
  model: "model",
  miner: "miner",
  amount: "1",
  pricePerGflop: "0.1",
  at: 1_000_000_000,
  dryRun: false,
};
export const channelId = `0x${"ab".repeat(32)}`;
export const blockHash = `0x${"cd".repeat(32)}`;
