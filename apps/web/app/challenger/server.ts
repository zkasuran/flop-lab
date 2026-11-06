// SPDX-License-Identifier: Apache-2.0
import snapshot from "../../../../packages/challenger/fixtures/site.json";
import { settlement } from "../../../../packages/challenger/src/validation";
import { collectTape } from "../../../../packages/challenger/src/watcher";
import { draftDossier } from "../../../../packages/challenger/src/dossier";
import { McpClient } from "../../../../packages/mcp/src/index";
import { collectWindows } from "../../../../packages/challenger/src/windows";
import { recordedEvidence, recordedWindows } from "../../../../packages/challenger/src/recorded-evidence";
import type { Tape } from "../../../../packages/challenger/src/types";
import { createSiteService } from "./data";
import { withClient } from "./collect";
import { publicFetch } from "../../lib/security/transport";

export const fallbackTape: Tape = { ...snapshot, mode: "recorded", settlements: snapshot.settlements.map(settlement) };

/** Shared per-instance cache for the page. Example: await challenger.read(). */
export const challenger = createSiteService(
  {
    tape: () => withClient((client) => collectTape(client, { maxRows: 1000 })),
    windows: () => withClient(collectWindows),
    dossier: async (report, id, windows) =>
      report.tape.mode === "recorded"
        ? draftDossier(report, id, new McpClient(), undefined, { bundle: await recordedEvidence(id), windows })
        : withClient((client) => draftDossier(report, id, client, undefined, { windows }), publicFetch, 20_000),
  },
  fallbackTape,
  Date.now,
  recordedWindows,
);
