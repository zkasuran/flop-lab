// SPDX-License-Identifier: Apache-2.0
import { digest, FileLedger, LedgerIntegrityError, type AuditEvent } from "./ledger";
import {
  evaluate,
  parseFlop,
  parsePolicy,
  parseRequest,
  type Decision,
  type Policy,
  type SpendRequest,
} from "./policy";
import type { Alert, Notifier } from "./notify";

export interface GuardOptions {
  policy: Policy;
  ledger: FileLedger;
  notify?: Notifier;
  now?: () => number;
}
export interface GuardResult<T> {
  decision: Decision;
  status: "denied" | "dry-run" | "returned" | "failed";
  result?: T;
  error?: string;
  warnings: string[];
}
export interface SpendOperation<T> {
  /** Exact operation content, excluding API clients and signers. It is hashed, not logged. */
  binding: unknown;
  execute: () => Promise<T>;
  channelId: (result: T) => string | null;
}

/**
 * Serialize policy admission with a durable reservation before executing an operation.
 * The caller supplies a trusted operation whose maximum spend equals request.amount.
 * @example await guardedSpend(options, request, operation, { dryRun: true })
 */
export async function guardedSpend<T>(
  options: GuardOptions,
  input: SpendRequest,
  operation: SpendOperation<T>,
  mode: { dryRun: boolean },
): Promise<GuardResult<T>> {
  if (typeof mode.dryRun !== "boolean") throw new Error("Explicit dryRun mode required");
  const dryRun = mode.dryRun;
  const policy = parsePolicy(options.policy);
  const request = parseRequest(input);
  request.at = (options.now ?? Date.now)();
  const fingerprint = digest({ policy, request: { ...request, at: 0, dryRun: false }, operation: operation.binding });
  const warnings: string[] = [];
  const alerts: Alert[] = [];
  let decision: Decision;
  try {
    decision = await options.ledger.transact((state) => {
      request.at = (options.now ?? Date.now)();
      const matching = state.events.some(
        (e) =>
          e.kind === "dryRun" && e.fingerprint === fingerprint && e.at <= request.at && request.at - e.at <= 120_000,
      );
      const consumed = state.events.some((e) => e.kind === "reserve" && e.fingerprint === fingerprint);
      request.dryRun = dryRun || (matching && !consumed);
      const evaluated = evaluate(policy, state.reservations, request);
      const events: AuditEvent[] = [];
      if (evaluated.decision === "deny") {
        events.push({ kind: "deny", at: request.at, request, fired: evaluated.fired });
        alerts.push({
          type: "deny",
          measuredAt: new Date(request.at).toISOString(),
          source: options.ledger.path,
          details: evaluated,
        });
      } else if (dryRun) {
        events.push({ kind: "dryRun", at: request.at, fingerprint });
      } else {
        events.push({ kind: "reserve", at: request.at, request, fingerprint });
        for (const [budget, value] of Object.entries(evaluated.budgets)) {
          const used = parseFlop(value.used),
            limit = parseFlop(value.limit);
          if (used * 100n < limit * 80n && (used + parseFlop(request.amount)) * 100n >= limit * 80n)
            alerts.push({
              type: "budget80",
              measuredAt: new Date(request.at).toISOString(),
              source: options.ledger.path,
              details: { budget, limit: value.limit, amount: request.amount },
            });
        }
      }
      return { events, value: evaluated };
    });
  } catch (error) {
    if (error instanceof LedgerIntegrityError && options.notify) {
      try {
        await options.notify({
          type: "tampering",
          measuredAt: new Date(request.at).toISOString(),
          source: options.ledger.path,
          details: error.message,
        });
      } catch {
        /* Preserve the integrity error. Never continue spending. */
      }
    }
    throw error;
  }
  for (const alert of alerts) {
    try {
      await options.notify?.(alert);
    } catch (error) {
      warnings.push(`Alert delivery failed: ${String(error)}`);
    }
  }
  if (decision.decision === "deny") return { decision, status: "denied", warnings };
  if (dryRun) return { decision, status: "dry-run", warnings };
  let result: T | undefined;
  let failure: string | undefined;
  let channelId: string | null = null;
  try {
    result = await operation.execute();
    channelId = operation.channelId(result);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    if (error && typeof error === "object" && "channelId" in error) {
      const id = error.channelId;
      if (id instanceof Uint8Array && id.length === 32) channelId = `0x${Buffer.from(id).toString("hex")}`;
    }
  }
  // An audit failure leaves the reservation intact. Retrying with this ID is refused.
  await options.ledger.transact((state) => ({
    events: [
      {
        kind: "outcome",
        at: Math.max((options.now ?? Date.now)(), state.events.at(-1)?.at ?? 0),
        id: request.id,
        status: failure === undefined ? "returned" : "failed",
        channelId,
      },
    ],
    value: undefined,
  }));
  return {
    decision,
    status: failure === undefined ? "returned" : "failed",
    ...(result === undefined ? {} : { result }),
    ...(failure === undefined ? {} : { error: failure }),
    warnings,
  };
}
