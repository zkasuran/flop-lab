// SPDX-License-Identifier: Apache-2.0
// Server imports only. Raw recordings are never passed to the client catalogue.
import models from "../../tests/fixtures/models.json";
import scoreboard from "../../../../packages/scoreboard/fixtures/snapshot-03.json";
import verifier from "../../../../packages/verifier/fixtures/channel-1.json";
import harness from "../../../../packages/harness/last-run.json";
import challenger from "../../../../packages/challenger/fixtures/site.json";
import x402 from "../../../../packages/x402kit/fixtures/run.json";
import sdk from "../../../../packages/sdkconf/fixtures/report.json";
import doctor from "../../../../packages/doctor/test/fixtures/example-miner.json";
import history from "../../../../packages/recorder/test/fixtures/seed/index.json";
import spec from "../../../../packages/spec/fixtures/stats.json";
import explorer from "../../../../packages/explorer/test/fixtures/block.json";
import contracts from "../../../../packages/mcpaudit/last-run.json";
import tclk from "../../../../packages/tclk-inspect/fixtures/htlcs.json";
import indexer from "../../../../packages/indexer-audit/fixtures/devnet.json";
import modelCatalogue from "../../../../packages/models/test/fixtures/devnet.json";
import { parseGateway } from "../../../../packages/models/src/schema";
import kestra from "../../app/kestra/observed.json";
import starter from "../../../../packages/create-flop-agent/fixtures/devnet.json";
import { repository, tools } from "../../content/tools";
import { parseMetric, type SuiteMetric } from "./metric";

const mcp = "https://mcp.flop.network/mcp";
const saved = (path: string) => `${repository}/blob/main/${path}`;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing recorded object");
  return value as Record<string, unknown>;
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing recorded rows");
  return value;
}
const metric = (
  value: unknown,
  label: string,
  measuredAt: unknown,
  source: unknown,
  path: string,
  note: string,
  sourceLabel = "Public source",
) => parseMetric({ value, label, measuredAt, source, recording: saved(path), sourceLabel, note });

const readers: Record<string, () => SuiteMetric | null> = {
  models: () => {
    const observation = modelCatalogue.observations.find((entry) => entry.key === "gateway");
    return metric(
      parseGateway(JSON.parse(observation?.raw ?? "null") as unknown).length,
      "models listed in the recorded gateway catalogue",
      observation?.measuredAt,
      observation?.source,
      "packages/models/test/fixtures/devnet.json",
      "Advertised listings. No inference or miner availability is verified.",
    );
  },
  start: () => {
    const observation = starter.observations.find((row) => row.tool === "flop_discover_models");
    return metric(
      rows(object(JSON.parse(observation?.raw ?? "null") as unknown).models).length,
      "registered models in starter replay",
      observation?.measuredAt,
      observation?.source,
      "packages/create-flop-agent/fixtures/devnet.json",
      "Recorded discovery. No current offer or spending quote.",
    );
  },
  indexer: () =>
    metric(
      indexer.requests,
      "requests in recorded invariant audit",
      indexer.completedAt,
      mcp,
      "packages/indexer-audit/fixtures/devnet.json",
      "Also read explorer APIs. Consistency is not independent chain proof.",
    ),
  tclk: () =>
    metric(
      rows(object(JSON.parse(tclk.raw) as unknown).htlcs).length,
      "HTLC rows in the deal inspector sample",
      tclk.measuredAt,
      tclk.source,
      "packages/tclk-inspect/fixtures/htlcs.json",
      "Bounded indexer sample. A hash match is not proof of payment.",
    ),
  explorer: () => {
    const observation = explorer.entities[0]?.evidence.find((entry) => entry.label === "block");
    return metric(
      object(observation?.data).extrinsicsCount,
      "extrinsics in recorded example block",
      observation?.measuredAt,
      observation?.source,
      "packages/explorer/test/fixtures/block.json",
      "Indexer observation. Not a proof of finalized inclusion.",
    );
  },
  contracts: () =>
    metric(
      contracts.requests,
      "requests in recorded contract audit",
      contracts.measuredAt,
      contracts.source,
      "packages/mcpaudit/last-run.json",
      "Recorded probes. No current service availability claim.",
    ),
  scoreboard: () => {
    const record = scoreboard.records.find((record) => record.kind === "settlements");
    return metric(
      rows(object(record?.raw).data).length,
      "settlements in ranking sample",
      record?.measuredAt,
      record?.source,
      "packages/scoreboard/fixtures/snapshot-03.json",
      "A bounded sample, not miner uptime.",
    );
  },
  verify: () => {
    const observation = verifier.observations.find((row) => row.id === "channel");
    const channel = object(JSON.parse(observation?.raw ?? "null") as unknown);
    return metric(
      channel.openedBlock,
      "recorded channel opening block",
      observation?.measuredAt,
      observation?.source,
      "packages/verifier/fixtures/channel-1.json",
      "Reported by the indexer. Not a finality proof.",
    );
  },
  harness: () =>
    metric(
      harness.budget.requests,
      "requests in recorded conformance run",
      harness.measuredAt,
      mcp,
      "packages/harness/last-run.json",
      "Run also read the public gateway. No current health claim.",
    ),
  spendguard: () =>
    metric(
      rows(object(JSON.parse(models.raw) as unknown).data).length,
      "models in policy example catalogue",
      models.measuredAt,
      models.source,
      "apps/web/tests/fixtures/models.json",
      "Identities are recorded. Policy budgets and requests are scripted.",
    ),
  x402: () =>
    metric(
      x402.preview.rows.length,
      "settlements in payment preview",
      x402.preview.measuredAt,
      x402.preview.source,
      "packages/x402kit/fixtures/run.json",
      "Public settlements do not prove a merchant payment.",
    ),
  kestra: () =>
    metric(
      kestra.tape.count,
      "settlements read by recorded flow",
      kestra.tape.measuredAt,
      kestra.tape.source,
      "apps/web/app/kestra/observed.json",
      "The saved excerpt retains the original bounded row count.",
    ),
  challenger: () =>
    metric(
      challenger.settlements.length,
      "settlements in review sample",
      challenger.measuredAt,
      mcp,
      "packages/challenger/fixtures/site.json",
      "Partial recorded tape. No current challenge eligibility claim.",
    ),
  history: () => {
    const entry = history.entries.at(-1)?.fields["stats.latestBlockNumber"];
    return metric(
      entry?.value,
      "latest block in recorded history",
      entry?.measuredAt,
      mcp,
      "packages/recorder/test/fixtures/seed/index.json",
      "Last bundled run. Separate captures are not an atomic snapshot.",
    );
  },
  spec: () =>
    metric(
      object(object(JSON.parse(spec.raw) as unknown).stats).proofs24h,
      "proofs24h reported in spec evidence",
      spec.measuredAt,
      spec.source,
      "packages/spec/fixtures/stats.json",
      "A reported field, not a proof of deployed runtime behaviour.",
    ),
  sdk: () =>
    metric(
      sdk.results.filter((result) => result.status === "FAIL").length,
      "failed checks in recorded SDK run",
      sdk.measuredAt,
      saved("packages/sdkconf/fixtures/report.json"),
      "packages/sdkconf/fixtures/report.json",
      "Pinned artifacts with scripted transport. Not live network failures.",
      "Local runner recording",
    ),
  doctor: () =>
    metric(
      doctor.inventory.cpu.value,
      "logical CPUs in recorded host probe",
      doctor.inventory.cpu.measuredAt,
      saved("packages/doctor/test/fixtures/example-miner.json"),
      "packages/doctor/test/fixtures/example-miner.json",
      "Probe: nproc. This is the recorded host, not your browser.",
      "Recorded host probe",
    ),
};

/** Project one dated metric per available tool, failing closed per card. @example sectionEvidence().verify */
export function sectionEvidence(): Record<string, SuiteMetric | null> {
  return Object.fromEntries(
    tools
      .filter((tool) => tool.status !== "planned")
      .map((tool) => {
        try {
          return [tool.slug, readers[tool.slug]?.() ?? null];
        } catch {
          return [tool.slug, null];
        }
      }),
  );
}
