// SPDX-License-Identifier: Apache-2.0
import { parseStats } from "@flop-lab/mcp";
import { expiry, parseGateway } from "@flop-lab/models";
import { parseReport } from "@flop-lab/harness";
import { analyze } from "@flop-lab/recorder";
import { classifyChannel } from "@flop-lab/sessions";
import { integer, type Config, type Rule } from "./config";
import { channels, parseSample, settlementPage, type Sample } from "./observations";

export type Alert = {
  id: string;
  rule: string;
  kind: Rule["kind"];
  measuredAt: string;
  source: string;
  message: string;
  evidence: Record<string, string | number>;
};
export type Memory = {
  signature: string;
  lastAt: string | null;
  values: Record<string, string | number>;
  seen: string[];
};
export type EngineState = Record<string, Memory>;
export type Evaluation = { state: EngineState; alerts: Alert[]; notes: string[] };
function key(rule: Rule) {
  return rule.kind === "devnet-reset"
    ? "stats"
    : rule.kind === "settlement"
      ? "settlements"
      : rule.kind === "challenge-closing"
        ? "channels"
        : rule.kind === "claim-change"
          ? `harness:${rule.report}`
          : rule.kind === "price-expired"
            ? "models"
            : rule.service === "mcp"
              ? "stats"
              : "models";
}

/** Evaluate only fresh observations. The first settlement read establishes a baseline.
 * @example const next = evaluate(config, sample, previous.state)
 */
export function evaluate(config: Config, input: Sample, previous: EngineState = {}): Evaluation {
  const sample = parseSample(input),
    state = structuredClone(previous),
    alerts: Alert[] = [],
    notes: string[] = [];
  for (const rule of config.rules) {
    const signature = JSON.stringify(rule);
    const memory: Memory =
      state[rule.id]?.signature === signature ? state[rule.id]! : { signature, lastAt: null, values: {}, seen: [] };
    state[rule.id] = memory;
    const o = sample.observations.find((o) => o.key === key(rule));
    if (!o) {
      notes.push(`${rule.id}: no observation`);
      continue;
    }
    if (memory.lastAt !== null && o.measuredAt <= memory.lastAt) {
      notes.push(`${rule.id}: repeated or older observation ignored`);
      continue;
    }
    const emit = (event: string, message: string, evidence: Alert["evidence"] = {}) => {
      if (memory.seen.includes(event)) return;
      if (memory.seen.length >= 20_000)
        throw new Error("State event limit reached. Archive state before starting a new baseline.");
      memory.seen.push(event);
      alerts.push({
        id: `${rule.id}:${o.measuredAt}:${event}`,
        rule: rule.id,
        kind: rule.kind,
        measuredAt: o.measuredAt,
        source: o.source,
        message,
        evidence,
      });
    };
    if (rule.kind === "service-down") {
      if (o.status === "unknown" || o.status === "budget") {
        notes.push(`${rule.id}: ${o.status}; failure streak interrupted`);
        memory.values.failures = 0;
        memory.lastAt = o.measuredAt;
        continue;
      }
      memory.values.failures = o.status === "down" ? Number(memory.values.failures ?? 0) + 1 : 0;
      if (o.status === "ok") memory.values.outage = "";
      if (o.status === "down" && !memory.values.outage) memory.values.outage = o.measuredAt;
      if (Number(memory.values.failures) >= rule.failures!)
        emit(
          String(memory.values.outage),
          `Public ${rule.service} probe failed consecutively. This is local reachability, not global downtime.`,
          { consecutiveFailures: Number(memory.values.failures), error: o.error ?? "Probe failed" },
        );
      memory.lastAt = o.measuredAt;
      continue;
    }
    if (o.status !== "ok" || o.raw === null) {
      notes.push(`${rule.id}: ${o.status}; ${o.error ?? "no data"}`);
      continue;
    }
    if (rule.kind === "devnet-reset") {
      const height = parseStats(JSON.parse(o.raw)).latestBlockNumber;
      const before = memory.values.height;
      if (typeof before === "number") {
        const entries = [before, height].map((value, i) => ({
          id: String(i),
          path: "",
          measuredAt: i ? o.measuredAt : memory.lastAt!,
          claims: [],
          fields: {
            "stats.latestBlockNumber": { value, measuredAt: i ? o.measuredAt : memory.lastAt!, source: o.source },
          },
        }));
        if (analyze({ version: 1, entries }).events.length)
          emit(
            o.measuredAt,
            "Reported head decreased. Reset signal only; indexer rollback or lag can also cause this.",
            { before, after: height },
          );
      }
      memory.values.height = height;
    } else if (rule.kind === "settlement") {
      const page = settlementPage(o.raw);
      if (page.hasMore)
        notes.push(`${rule.id}: partial settlement page; unseen rows outside this page cannot be detected`);
      for (const s of page.rows.filter((s) => s.agent === rule.address || s.miner === rule.address)) {
        const event = `${s.channelId}:${s.settledBlock}:${s.settledBlockHash ?? "unknown"}:${s.settlementEvent}`;
        if (memory.lastAt === null) {
          if (!memory.seen.includes(event)) memory.seen.push(event);
        } else
          emit(event, "Newly observed settlement for the configured address.", {
            channelId: s.channelId,
            settledBlock: s.settledBlock,
            address: rule.address!,
          });
      }
    } else if (rule.kind === "price-expired") {
      const models = parseGateway(JSON.parse(o.raw));
      if (!models.length) notes.push(`${rule.id}: empty model list`);
      for (const model of models)
        for (const source of model.sources) {
          if (expiry(source, o.measuredAt).state === "expired")
            emit(
              `${model.id}:${source.address}:${source.expiresAt}`,
              "Advertised model price source was expired at read time.",
              { model: model.id, address: source.address, expiresAt: source.expiresAt },
            );
        }
    } else if (rule.kind === "claim-change") {
      const report = parseReport(JSON.parse(o.raw)),
        result = report.results.find((r) => r.claim.id === rule.claim);
      if (!result) {
        notes.push(`${rule.id}: claim absent from report`);
        continue;
      }
      if (typeof memory.values.reportAt === "string" && report.measuredAt <= memory.values.reportAt) continue;
      const before = memory.values.status;
      if (typeof before === "string" && before !== result.status)
        emit(report.measuredAt, "Harness claim status changed between dated reports.", {
          claim: rule.claim!,
          before,
          after: result.status,
          reportAt: report.measuredAt,
        });
      memory.values.status = result.status;
      memory.values.reportAt = report.measuredAt;
    } else if (rule.kind === "challenge-closing") {
      const stats = sample.observations.find((s) => s.key === "stats" && s.status === "ok");
      if (!stats?.raw) {
        notes.push(`${rule.id}: no reported head for this poll`);
        continue;
      }
      const height = parseStats(JSON.parse(stats.raw)).latestBlockNumber,
        page = channels(o.raw);
      if (page.pagination.hasMore) notes.push(`${rule.id}: partial channel page`);
      let candidates = 0;
      for (const c of page.data) {
        const observation = {
          kind: "channels" as const,
          source: o.source,
          measuredAt: o.measuredAt,
          offset: 0,
          raw: o.raw,
          error: null,
        };
        if (classifyChannel({ value: c, observation }, null).state !== "challenge-window" || c.challengeEnd === null)
          continue;
        candidates++;
        const remaining = integer(c.challengeEnd) - height;
        if (remaining > 0 && remaining <= rule.withinBlocks!)
          emit(
            `${c.channelId}:${c.challengeEnd}`,
            "Reported challenge end is within the configured block threshold. Runtime eligibility is unverified.",
            {
              channelId: c.channelId,
              remainingBlocks: remaining,
              challengeEnd: c.challengeEnd,
              head: height,
              headMeasuredAt: stats.measuredAt,
            },
          );
      }
      if (!candidates) notes.push(`${rule.id}: no explicit forced challenge window in this page`);
    }
    memory.lastAt = o.measuredAt;
  }
  return { state, alerts, notes };
}

/** Replay only actual observations in chronological order. No interpolation. @example replay(config, samples) */
export function replay(config: Config, samples: Sample[]): Evaluation[] {
  let state: EngineState = {};
  return [...samples]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((sample) => {
      const result = evaluate(config, sample, state);
      state = result.state;
      return result;
    });
}
