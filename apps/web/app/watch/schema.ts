// SPDX-License-Identifier: Apache-2.0
import { array, integer, kinds, object, text, time } from "../../../../packages/watch/src/config";
import type { Replay } from "./data";
/** Validate the same-origin replay before rendering links or measured fields. @example parseReplay(await response.json()) */
export function parseReplay(value: unknown): Replay {
  const r = object(value);
  if (r.mode !== "recorded" || !/^\d{4}-\d{2}-\d{2}$/.test(text(r.day))) throw new Error("Invalid replay mode or day");
  const start = time(r.startedAt),
    end = time(r.finishedAt);
  if (start > end || !start.startsWith(String(r.day)) || !end.startsWith(String(r.day)))
    throw new Error("Invalid replay interval");
  const polls = array(r.polls, 100);
  if (!polls.length) throw new Error("No recorded polls");
  let requests = 0;
  for (const item of polls) {
    const p = object(item),
      at = time(p.startedAt),
      finish = time(p.finishedAt);
    if (at < start || finish > end || at > finish) throw new Error("Invalid poll interval");
    integer(p.head);
    requests += integer(p.requests);
    if (!text(p.recording).startsWith("https://github.com/zkasuran/flop-lab/blob/main/packages/watch/test/fixtures/"))
      throw new Error("Invalid recording link");
    for (const item of array(p.observations, 100)) {
      const o = object(item);
      text(o.key);
      time(o.measuredAt);
      if (!["https://mcp.flop.network/mcp", "https://api.flop.network/v1/models"].includes(text(o.source)))
        throw new Error("Invalid public source");
      if (!["ok", "down", "unknown", "budget"].includes(text(o.status))) throw new Error("Invalid source status");
      if (o.error !== null) text(o.error);
    }
    for (const item of array(p.alerts, 20_000)) {
      const alert = object(item);
      text(alert.id, 4000);
      text(alert.rule);
      text(alert.message);
      time(alert.measuredAt);
      if (!kinds.some((kind) => kind === alert.kind)) throw new Error("Invalid alert kind");
      text(alert.source);
      for (const v of Object.values(object(alert.evidence)))
        if (typeof v !== "string" && (typeof v !== "number" || !Number.isFinite(v)))
          throw new Error("Invalid alert evidence");
    }
    for (const note of array(p.notes, 100)) text(note);
  }
  if (integer(r.requests) !== requests) throw new Error("Request total disagrees with polls");
  return value as Replay;
}
