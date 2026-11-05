// SPDX-License-Identifier: Apache-2.0
import snapshot from "../../../../packages/challenger/fixtures/site.json";
import { settlement } from "../../../../packages/challenger/src/validation";
import { collectTape } from "../../../../packages/challenger/src/watcher";
import { draftDossier } from "../../../../packages/challenger/src/dossier";
import { McpClient } from "../../../../packages/mcp/src/index";
import type { Tape } from "../../../../packages/challenger/src/types";
import { createSiteService } from "./data";
import { withClient } from "./collect";

export const fallbackTape: Tape = { ...snapshot, mode: "recorded", settlements: snapshot.settlements.map(settlement) };

function recordedEvidence(id: string) {
  let clock = Date.parse(snapshot.measuredAt);
  return new McpClient({
    retries: 0,
    minIntervalMs: 0,
    now: () => clock,
    sleep: async () => undefined,
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { params: { name: string } };
      const name = request.params.name;
      const observed =
        name === "flop_trust_root"
          ? snapshot.evidence.trustRoot
          : id === snapshot.evidence.settlement.value.channelId
            ? snapshot.evidence.channel
            : null;
      if (!observed)
        throw new Error("No recorded channel evidence for this settlement. Run the CLI against the live service.");
      clock = Date.parse(observed.measuredAt);
      const body = JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify(observed.value) }] } });
      // In-memory fixture transport. Parsing stays in McpClient. The Node-only
      // replayFetch module resolves a filesystem directory at import time.
      return new Response(body, { headers: { "Content-Type": "application/json" } });
    },
  });
}

/** Shared per-instance cache for the page. Example: await challenger.read(). */
export const challenger = createSiteService(
  {
    tape: () => withClient((client) => collectTape(client, { maxRows: 1000 })),
    dossier: (report, id) =>
      report.tape.mode === "recorded"
        ? draftDossier(report, id, recordedEvidence(id))
        : withClient((client) => draftDossier(report, id, client)),
  },
  fallbackTape,
);
