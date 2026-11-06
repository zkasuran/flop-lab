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
import consoleTools from "../../../../packages/console/fixtures/tools.json";
import staking from "../../../../packages/staking/fixtures/miners.json";
import { pickResponse } from "@flop-lab/mcp";
import starter from "../../../../packages/create-flop-agent/fixtures/devnet.json";
import didSearch from "../../../../packages/did/fixtures/github.json";
import sessions from "../../../../packages/sessions/test/fixtures/live/page-0.json";
import finality from "../../../../packages/finality/test/fixtures/observation.json";
import { analyzeRecording } from "../../../../packages/finality/src/analysis";
import { parseRecording } from "../../../../packages/finality/src/schema";
import proofs from "../../../../packages/proofs/fixtures/capture-3.json";
import { parseProofs } from "../../../../packages/proofs/src/model";
import { repository, tools } from "../../content/tools";
import { parseMetric, type SuiteMetric } from "./metric";
import { recordedObservation as economicsObservation } from "../../../../packages/economics/src/recorded";
import swaps from "../../../../packages/swaps/fixtures/swaps.json";
import { parseSwapPage } from "../../../../packages/swaps/src/observed";

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
  swaps: () =>
    metric(
      parseSwapPage(JSON.parse(swaps.raw) as unknown).total,
      "open FLOP_BTC orders in the recorded response",
      swaps.measuredAt,
      swaps.source,
      "packages/swaps/fixtures/swaps.json",
      "Orders and indexed HTLCs are distinct. No chain-pair completion is verified.",
    ),
  finality: () =>
    metric(
      analyzeRecording(parseRecording(finality)).lag,
      "blocks of reported finality lag",
      finality.measuredAt,
      finality.source,
      "packages/finality/test/fixtures/observation.json",
      "Dated API heads. No consensus signatures or finalized-prefix storage proof.",
    ),
  proofs: () =>
    metric(
      parseProofs(JSON.parse(proofs.raw) as unknown).length,
      "proof rows in the recorded indexer query",
      proofs.measuredAt,
      proofs.source,
      "packages/proofs/fixtures/capture-3.json",
      "Empty direct-rail data does not establish missing paid-channel evidence.",
    ),
  did: () =>
    metric(
      rows(object(JSON.parse(didSearch.raw) as unknown).items).length,
      "GitHub artifacts in the recorded DID trail",
      didSearch.measuredAt,
      didSearch.source,
      "packages/did/fixtures/github.json",
      "Bounded search results. The DID page verifies each retained signature in the browser.",
    ),
  sessions: () =>
    metric(
      rows(object(object(JSON.parse(sessions.raw) as unknown).computeChannels).data).length,
      "channel rows in the first recorded page",
      sessions.measuredAt,
      sessions.source,
      "packages/sessions/test/fixtures/live/page-0.json",
      "One recorded page. The lifecycle view joins the full bounded crawl with settlement evidence.",
    ),
  staking: () =>
    metric(
      rows(object(JSON.parse(staking.raw) as unknown).data).length,
      "miners in the recorded stake page",
      staking.measuredAt,
      staking.source,
      "packages/staking/fixtures/miners.json",
      "Indexed balances and capacity. Not a runtime eligibility or calibration lease proof.",
    ),
  economics: () => {
    const observation = economicsObservation();
    return metric(
      observation.data.settlements?.length,
      "settlements in the economics comparison sample",
      observation.measuredAt,
      observation.source,
      "packages/economics/fixtures/devnet.json",
      "Compared with a pinned target. No issuance or reward receipt is verified.",
    );
  },
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
  console: () =>
    metric(
      rows(object(pickResponse(consoleTools.raw, consoleTools.request.id).result).tools).length,
      "tools in recorded MCP discovery",
      consoleTools.measuredAt,
      consoleTools.source,
      "packages/console/fixtures/tools.json",
      "Discovery only. Not every tool has an output schema or is enabled in the console.",
    ),
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
