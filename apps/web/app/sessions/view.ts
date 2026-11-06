// SPDX-License-Identifier: Apache-2.0
import { labels, states, type State } from "../../../../packages/sessions/src/lifecycle";
import { object, time, channelId, source } from "../../../../packages/sessions/src/schema";
import type { Evidence } from "../../../../packages/sessions/src/classify";
export type Detail = {
  channelId: string;
  state: State;
  label: string;
  reason: string;
  evidence: Evidence[];
  channel: Record<string, unknown> | null;
  settlement: Record<string, unknown> | null;
};
/** Validate the same-origin drawer response before displaying its claims. @example parseDetail(json, id) */
export function parseDetail(value: unknown, id: string): Detail {
  const o = object(value);
  if (
    channelId(o.channelId) !== id ||
    !states.includes(o.state as State) ||
    typeof o.reason !== "string" ||
    o.reason.length > 2000 ||
    !Array.isArray(o.evidence) ||
    o.evidence.length > 2
  )
    throw new Error("Invalid channel detail");
  const evidence = o.evidence.map((input): Evidence => {
    const e = object(input);
    if (e.source !== source || (e.kind !== "channels" && e.kind !== "settlements"))
      throw new Error("Invalid evidence source");
    const fields = object(e.fields);
    for (const v of Object.values(fields))
      if (
        v !== null &&
        typeof v !== "boolean" &&
        !(typeof v === "string" && v.length <= 2000) &&
        !(typeof v === "number" && Number.isSafeInteger(v) && v >= 0)
      )
        throw new Error("Invalid evidence field");
    return { source, kind: e.kind, measuredAt: time(e.measuredAt), fields: fields as Evidence["fields"] };
  });
  return {
    channelId: id,
    state: o.state as State,
    label: labels[o.state as State],
    reason: o.reason,
    evidence,
    channel: o.channel === null ? null : object(o.channel),
    settlement: o.settlement === null ? null : object(o.settlement),
  };
}
export type SessionCard = {
  id: string;
  state: State;
  openedBlock: number | null;
  openedAt: number | null;
  statusBlock: number | null;
  updatedAt: number | null;
  canReplayOpening: boolean;
};
export type HistoryRow = {
  measuredAt: string;
  counts: Record<State, number> | null;
  rows: number;
  total: number | null;
  source: string;
};
export const pageSize = 12;
/** Filter the recorded population without changing its counts. @example visibleChannels(cards, "open", "0x") */
export function visibleChannels(cards: SessionCard[], state: State | "all", query: string) {
  const search = query.trim().toLowerCase();
  return cards.filter((c) => (state === "all" || c.state === state) && c.id.toLowerCase().includes(search));
}
/** Replay only a known opening and the latest observed state. @example traceState(card, "latest") */
export function traceState(card: SessionCard, at: "opened" | "latest"): State {
  if (
    at === "opened" &&
    card.canReplayOpening &&
    card.openedBlock !== null &&
    card.state !== "opening" &&
    card.state !== "unknown"
  )
    return "open";
  return card.state;
}
