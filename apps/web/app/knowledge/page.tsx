// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedManifest, recording, recordedPack } from "../../../../packages/knowledge/src/recorded";
import { parseRequirement } from "../../../../packages/knowledge/src/schema";
import { KnowledgeView } from "./view";

export const metadata: Metadata = {
  title: "Knowledge catalog",
  description:
    "Browse dated FLOP concepts, directed relationships and cited requirements. Inspect agent-pack responses as source text.",
};

export default function KnowledgePage() {
  try {
    const observation = recordedManifest();
    const requirement = recording("requirement", parseRequirement);
    if (!observation.value) throw new Error("No manifest");
    return (
      <KnowledgeView
        manifest={observation.value}
        measuredAt={observation.measuredAt}
        source={observation.source}
        requirement={requirement}
        pack={recordedPack()}
      />
    );
  } catch {
    return (
      <section className="container section">
        <h1>Knowledge catalog</h1>
        <p>No usable catalog recording. Run the CLI with --live to read the public service.</p>
      </section>
    );
  }
}
