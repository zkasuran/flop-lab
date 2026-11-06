// SPDX-License-Identifier: Apache-2.0
export const states = [
  "opening",
  "open",
  "cooperative",
  "challenge-window",
  "disputed",
  "finalized",
  "refunded",
  "unknown",
] as const;
export type State = (typeof states)[number];
export const labels: Record<State, string> = {
  opening: "Awaiting acknowledgement",
  open: "Open / usage unobserved",
  cooperative: "Cooperative settlement",
  "challenge-window": "Forced claim / awaiting finalisation",
  disputed: "Dispute reported",
  finalized: "Finalisation reported",
  refunded: "Refund / expiry reported",
  unknown: "Unresolved evidence",
};
const docs = "https://docs.flop.network/docs/send-to-specific-miner";
const paper =
  "https://github.com/flop-labs/yellowpaper/blob/2a2cc8218048a2933071bb2f45d75335560e39d8/yellowpaper.md#121-sessions--attested-streaming--aggregate-settlement";
export const transitions = [
  {
    from: "offer",
    to: "opening",
    action: "Choose offer or force-open",
    source: docs,
    quote:
      "`auto` uses a live signed spot offer for this miner and model, then falls back to `force_open` when none is available.",
  },
  {
    from: "opening",
    to: "open",
    action: "Miner acknowledges",
    source: docs,
    quote:
      "On this runtime the ack emits `ChannelOpened`, and the key is read from finalized channel storage; there is no separate `ForceAcked` event.",
  },
  {
    from: "open",
    to: "open",
    action: "Stream usage off-chain",
    source: paper,
    quote: "The inference stream remains off-chain",
  },
  {
    from: "open",
    to: "cooperative",
    action: "Co-sign and settle",
    source: paper,
    quote: "The current cooperative path pays private escrow immediately and issues no public work credit (R11.2b).",
  },
  {
    from: "open",
    to: "challenge-window",
    action: "Post forced claim",
    source: docs,
    quote: "A forced settlement posts a claim; it still needs permissionless `finalize` after its challenge window.",
  },
  {
    from: "challenge-window",
    to: "disputed",
    action: "Challenge protocol fraud",
    source: paper,
    quote: "Disputes cover **protocol fraud only**",
  },
  {
    from: "challenge-window",
    to: "finalized",
    action: "Finalise after the window",
    source: docs,
    quote:
      "call `expire_force_open` for expired `PendingAck`, `timeout` for an expired zero-turn `Open`, or `finalize` for a force-settled channel after its challenge window.",
  },
  {
    from: "disputed",
    to: "refunded",
    action: "Fraud verdict",
    source: paper,
    quote: "**MUST** default to a fraud verdict → slash via the `miner-slashing` forgery path + agent refund.",
  },
  {
    from: "opening / open",
    to: "refunded",
    action: "Expiry or non-delivery timeout",
    source: docs,
    quote: "Both refund the channel escrow; fees remain spent.",
  },
] as const;
