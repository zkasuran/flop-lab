// SPDX-License-Identifier: Apache-2.0
import type { Settlement } from "@flop-lab/mcp";
import { labels, states, type State } from "./lifecycle";
import { channelId, parseCapture, parsePage, type Channel, type Kind, type Observation, type Page } from "./schema";
export type Evidence = {
  source: string;
  measuredAt: string;
  kind: Kind;
  fields: Record<string, string | number | boolean | null>;
};
export type Session = {
  channelId: string;
  state: State;
  label: string;
  reason: string;
  evidence: Evidence[];
  channel: Channel | null;
  settlement: Settlement | null;
};
export type Coverage = { rows: number; total: number | null; complete: boolean; errors: string[] };
export type Report = {
  measuredAt: string;
  source: string;
  sessions: Session[];
  counts: Record<State, number> | null;
  channels: Coverage;
  settlements: Coverage;
  offers: Coverage;
  warnings: string[];
};
type Row<T> = { value: T; observation: Observation };
function normalize(v: string) {
  return v.toLowerCase().replace(/[_ -]/g, "");
}
function decide(c: Channel | null, s: Settlement | null): [State, string] {
  const status = c ? normalize(c.status) : null;
  const forcedEvent = s?.settlementEvent === "computeChannel.ForceSettled";
  const finalEvent =
    s?.settlementEvent === "computeChannel.Finalized" || c?.settlement?.event === "computeChannel.Finalized";
  if (
    status &&
    ![
      "open",
      "pendingack",
      "settled",
      "settling",
      "forcesettled",
      "finalized",
      "disputed",
      "refunded",
      "timedout",
      "expired",
      "voided",
    ].includes(status)
  )
    return ["unknown", "Unsupported channel status. A tape row cannot override it."];
  if (
    c &&
    s &&
    ((c.cooperative !== null && c.cooperative !== s.cooperative) ||
      status === "open" ||
      status === "pendingack" ||
      (c.statusBlockNumber !== null && c.statusBlockNumber < s.settledBlock))
  )
    return ["unknown", "Channel and settlement observations disagree. Sequential reads can cross a state change."];
  if (s && forcedEvent && s.cooperative) return ["unknown", "Forced settlement event conflicts with cooperative=true."];
  if (status === "disputed") return ["disputed", "The indexer reports a dispute. No verdict is inferred."];
  if (status && ["refunded", "timedout", "expired", "voided"].includes(status)) {
    if (s) return ["unknown", "Refund status and settlement tape both exist. Inspect the source evidence."];
    return ["refunded", "The indexer reports a refund, timeout, expiry or void. No refund amount is inferred."];
  }
  if (status === "finalized" || finalEvent) {
    if (c?.cooperative === true || s?.cooperative === true)
      return ["unknown", "Finalisation and cooperative settlement labels conflict."];
    return [
      "finalized",
      "Explicit finalisation status or event reported by the indexer. Chain finality is not independently verified.",
    ];
  }
  if (
    status === "forcesettled" ||
    forcedEvent ||
    (status === "settling" && c?.challengeEnd !== null && c?.finalRoot !== null)
  ) {
    if (c?.cooperative === true || s?.cooperative === true)
      return ["unknown", "Forced status conflicts with cooperative=true."];
    return [
      "challenge-window",
      "A forced claim is reported. Window expiry and payout still require finalized runtime evidence.",
    ];
  }
  if (status === "settled" || s) {
    const cooperative = s?.cooperative ?? c?.cooperative;
    if (cooperative === true && (!s || s.settlementEvent === "computeChannel.Settled"))
      return [
        "cooperative",
        "A cooperative settlement is reported. No standard forced-settlement challenge window is attached.",
      ];
    return ["unknown", "Settlement is reported without an unambiguous cooperative or finalisation event."];
  }
  if (status === "pendingack") return ["opening", "The channel is awaiting miner acknowledgement."];
  if (status === "open")
    return ["open", "The channel is open. Public channel fields do not show off-chain turn progress."];
  return ["unknown", "No supported lifecycle status or event establishes a state."];
}
/** Classify one channel and its tape evidence, without clock-based finalisation.
 * @example classifyChannel(channelRow, settlementRow)
 */
export function classifyChannel(c: Row<Channel> | null, s: Row<Settlement> | null): Session {
  if (!c && !s) throw new Error("No channel evidence");
  const id = channelId(c?.value.channelId ?? s?.value.channelId);
  if (s && channelId(s.value.channelId) !== id) throw new Error("Channel IDs differ");
  const [state, reason] = decide(c?.value ?? null, s?.value ?? null);
  const evidence: Evidence[] = [];
  if (c)
    evidence.push({
      source: c.observation.source,
      measuredAt: c.observation.measuredAt,
      kind: "channels",
      fields: {
        status: c.value.status,
        cooperative: c.value.cooperative,
        challengeEnd: c.value.challengeEnd,
        statusBlockNumber: c.value.statusBlockNumber,
        observationHead: c.value.observationHead,
        settlementEvent: c.value.settlement?.event ?? null,
      },
    });
  if (s)
    evidence.push({
      source: s.observation.source,
      measuredAt: s.observation.measuredAt,
      kind: "settlements",
      fields: {
        cooperative: s.value.cooperative,
        settlementKind: s.value.settlementKind,
        settlementEvent: s.value.settlementEvent,
        settledBlock: s.value.settledBlock,
      },
    });
  return {
    channelId: id,
    state,
    label: labels[state],
    reason,
    evidence,
    channel: c?.value ?? null,
    settlement: s?.value ?? null,
  };
}
/** Count each distinct observed channel once. @example countStates(report.sessions) */
export function countStates(sessions: Session[]): Record<State, number> {
  const counts = Object.fromEntries(states.map((s) => [s, 0])) as Record<State, number>;
  for (const session of sessions) counts[session.state]++;
  return counts;
}
/** Join validated pages by channel ID and retain coverage failures. @example classifyCapture(capture) */
export function classifyCapture(input: unknown): Report {
  const capture = parseCapture(input);
  const channels = new Map<string, Row<Channel>>();
  const settlements = new Map<string, Row<Settlement>>();
  const duplicate = new Set<string>();
  function collect<T extends Channel | Settlement | Record<string, unknown>>(
    kind: Kind,
    target?: Map<string, Row<T>>,
  ): Coverage {
    let rows = 0,
      total: number | null = null,
      expectedOffset = 0;
    let ended = false;
    const errors: string[] = [];
    for (const o of capture.observations.filter((o) => o.kind === kind)) {
      if (o.raw === null) {
        errors.push(o.error ?? "No data");
        continue;
      }
      const p = parsePage(o) as Page<T>;
      if (o.offset !== expectedOffset || ended) errors.push("Non-contiguous pages");
      if (total !== null && total !== p.pagination.total) errors.push("Population changed during collection");
      total = p.pagination.total;
      for (const value of p.data) {
        if (target) {
          const id = channelId(value.channelId);
          if (target.has(id)) {
            duplicate.add(id);
            errors.push(`Duplicate channel ${id}`);
          } else target.set(id, { value, observation: o });
        }
      }
      rows += p.data.length;
      expectedOffset = o.offset + p.data.length;
      ended = !p.pagination.hasMore;
    }
    return {
      rows: target?.size ?? rows,
      total,
      complete: total !== null && ended && errors.length === 0 && rows === total,
      errors,
    };
  }
  const channelCoverage = collect("channels", channels);
  const tapeCoverage = collect("settlements", settlements);
  const offers = collect("offers");
  const sessions = [...new Set([...channels.keys(), ...settlements.keys()])].map((id) => {
    const result = classifyChannel(channels.get(id) ?? null, settlements.get(id) ?? null);
    return duplicate.has(id)
      ? {
          ...result,
          state: "unknown" as const,
          label: labels.unknown,
          reason: "Duplicate channel evidence. No row was silently selected as authoritative.",
        }
      : result;
  });
  return {
    measuredAt: capture.finishedAt,
    source: "https://mcp.flop.network/mcp",
    sessions,
    counts: channelCoverage.total === null && tapeCoverage.total === null ? null : countStates(sessions),
    channels: channelCoverage,
    settlements: tapeCoverage,
    offers,
    warnings: [
      "Sequential indexer observations are not an atomic chain snapshot.",
      "Off-chain usage, offer-to-channel links and independent finality are unavailable.",
      ...(!channelCoverage.complete || !tapeCoverage.complete
        ? ["Coverage is partial. Counts describe observed channels only."]
        : []),
    ],
  };
}
