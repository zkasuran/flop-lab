// SPDX-License-Identifier: Apache-2.0
export const UPSTREAM_COMMIT = "7d402db451ad952e3695e8ce9a8fcac99893950b";
export const SPEC_URL = `https://github.com/flop-labs/tclk/blob/${UPSTREAM_COMMIT}/SPEC.md`;
export interface SignedRecord {
  room: string;
  seq: number;
  timestampMs: number;
  sender: string;
  nonce: string;
  signature: string;
  line: string;
}
interface Common {
  from: string;
}
export interface Offer extends Common {
  type: "offer";
  id: string;
  role: "payer" | "payee";
  amount: string;
  asset: string;
  lock: "hash" | "point";
  rails: string[];
  claimByMs: number;
  refundAfterMs: number;
  expiresMs: number;
  paymentKey?: string;
  job?: { proto: string; id: string; context?: string };
  nonce: string;
}
export interface Accept extends Common {
  type: "accept";
  ref: string;
  statement: string;
  contract: string;
  nonce: string;
  paymentKey?: string;
}
interface Bound extends Common {
  contract: string;
}
export type Frame =
  | Offer
  | Accept
  | (Bound & { type: "lock"; rail: string; ref: string; presig?: { nonce: string; s: string } })
  | (Bound & { type: "reveal"; secret: string; ref?: string })
  | (Bound & { type: "refund"; ref?: string; reason?: string })
  | (Bound & { type: "cancel"; reason?: string })
  | (Bound & { type: "receipt"; outcome: "claimed" | "refunded" | "cancelled"; rail?: string; ref?: string })
  | (Bound & { type: "heartbeat"; nonce: string; note?: string });
export type Status = "proposed" | "accepted" | "locked" | "claimed" | "refunded" | "cancelled";
export interface Deal {
  status: Status;
  offer: Offer;
  payer?: string;
  payee?: string;
  contract?: string;
  statement?: string;
  rail?: string;
  railRef?: string;
}
export interface Step {
  index: number;
  type: string;
  from: Status | "none";
  to: Status | "none";
  ok: boolean;
  section: string;
  reason?: string;
  warnings: string[];
  timestampMs?: number;
  sender?: string;
}
export interface Inspection {
  verdict: "conformant" | "violation" | "no-data";
  state: Deal | null;
  steps: Step[];
  firstViolation: Step | null;
  inspectedAt: string;
  source: string;
  spec: string;
  limits: string[];
}
