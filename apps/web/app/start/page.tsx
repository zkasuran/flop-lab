// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import fixture from "../../../../packages/create-flop-agent/fixtures/devnet.json";
import { templateFiles } from "../../../../packages/create-flop-agent/src/manifest";
import { assertDevnet, discoverModels } from "../../../../packages/create-flop-agent/template/src/guards";
import { Starter } from "./starter";

export const metadata: Metadata = {
  title: "Agent starter",
  description: "Generate a devnet-only FLOP agent with a hard spending ceiling and fixture-backed dry runs.",
};

export default function StartPage() {
  const health = fixture.observations.find((row) => row.tool === "flop_health")!;
  const discovery = fixture.observations.find((row) => row.tool === "flop_discover_models")!;
  assertDevnet(JSON.parse(health.raw) as unknown, health.measuredAt, Date.parse(fixture.snapshot.measuredAt));
  const models = discoverModels(JSON.parse(discovery.raw) as unknown);
  return (
    <Starter
      files={templateFiles.map(([name, detail]) => ({ name, detail }))}
      record={{
        healthAt: health.measuredAt,
        discoveryAt: discovery.measuredAt,
        source: health.source,
        registered: models.length,
        served: models.filter((model) => model.miners.length).length,
        miners: new Set(models.flatMap((model) => model.miners)).size,
        fixtureFiles: fixture.snapshot.records.length + 1,
      }}
    />
  );
}
