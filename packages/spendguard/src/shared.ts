// SPDX-License-Identifier: Apache-2.0
import { digest, FileLedger, type AuditEvent } from "./ledger";
import { evaluate, parsePolicy, parseRequest, type Decision, type Policy, type SpendRequest } from "./policy";

/** Local shared budget. All callers must use this boundary and one trusted policy.
 * @example const shared = new SharedBudget(new FileLedger("./team.jsonl"), policy); await shared.initialize();
 */
export class SharedBudget {
  private readonly policy: Policy;
  private readonly fingerprint: string;
  constructor(
    readonly ledger: FileLedger,
    policy: Policy,
    private readonly now: () => number = Date.now,
  ) {
    this.policy = parsePolicy(policy);
    this.fingerprint = digest(this.policy);
  }

  /** Create a new ledger and pin its policy. An interrupted setup fails closed. @example await shared.initialize() */
  async initialize(): Promise<void> {
    await this.ledger.initialize();
    await this.ledger.transact(() => ({
      events: [{ kind: "sharedPolicy", at: this.now(), fingerprint: this.fingerprint }],
      value: undefined,
    }));
  }

  /** Record a preflight without holding funds. It expires after 120 seconds. @example await shared.preview("writer", request) */
  preview(agent: string, request: SpendRequest): Promise<Decision> {
    return this.admit(agent, request, true);
  }

  /** Atomically evaluate and reserve. No signing or automatic release. @example await shared.reserve("writer", request) */
  reserve(agent: string, request: SpendRequest): Promise<Decision> {
    return this.admit(agent, request, false);
  }

  private async admit(agent: string, input: SpendRequest, preview: boolean): Promise<Decision> {
    if (typeof agent !== "string" || !agent.trim() || agent.length > 256) throw new Error("Invalid agent label");
    const original = parseRequest(input);
    // Hash tuples instead of concatenating ambiguous separators. Task caps are per agent and task.
    const request = {
      ...original,
      id: digest([agent, original.id]),
      task: digest([agent, original.task]),
    };
    const fingerprint = digest({ policy: this.fingerprint, request: { ...request, at: 0, dryRun: false } });
    return this.ledger.transact((state) => {
      const binding = state.events.find((event) => event.kind === "sharedPolicy");
      if (!binding || binding.fingerprint !== this.fingerprint)
        throw new Error("Shared policy mismatch or missing binding");
      request.at = this.now();
      if (request.at < (state.events.at(-1)?.at ?? 0)) throw new Error("Shared budget clock moved backwards");
      const matching = state.events.some(
        (event) =>
          event.kind === "dryRun" &&
          event.fingerprint === fingerprint &&
          event.at <= request.at &&
          request.at - event.at <= 120_000,
      );
      const consumed = state.events.some((event) => event.kind === "reserve" && event.fingerprint === fingerprint);
      request.dryRun = preview || (matching && !consumed);
      const result = evaluate(this.policy, state.reservations, request);
      const event: AuditEvent =
        result.decision === "deny"
          ? { kind: "deny", at: request.at, request, fired: result.fired }
          : preview
            ? { kind: "dryRun", at: request.at, fingerprint }
            : { kind: "reserve", at: request.at, request, fingerprint, agent };
      return { events: [event], value: result };
    });
  }
}
