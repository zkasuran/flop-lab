// SPDX-License-Identifier: Apache-2.0
export const PAPER_PIN = "2a2cc8218048a2933071bb2f45d75335560e39d8";
export const PAPER_URL = `https://github.com/flop-labs/yellowpaper/blob/${PAPER_PIN}/yellowpaper.md`;
export const RULES = {
  blockMs: 1000,
  warnBlocks: 30,
  freezeBlocks: 120,
  maxStallBlocks: 3600,
} as const;
export const QUOTES = {
  production: "Blocks **MUST** be authored by BABE at a fixed **1 s** interval.",
  warn: "Finality lag above which the detector reports Lagging (alert only; finality-clocked deadlines pause naturally).",
  freeze:
    "Finality lag at/above which the channel enters Stalled: new finality-dependent opens are rejected fail-closed (ensure_finality_open_allowed); additive top-up/cancel paths stay open.",
  escape:
    "Finality lag at/above which the chain is EscapeEligible (safe mode): restore AlephBFT finality or ratify a checkpoint recovery through the hard-fork runbook. ~1h at 1s blocks.",
} as const;
