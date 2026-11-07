// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { DevnetPanel } from "@/components/devnet-panel";
import { LiveStatus } from "@/components/home/live-status";
import { ReadingReveal, ReadingSteps } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { ToolCard } from "@/components/shell/tool-context";
import { toolsIn } from "@/content/tools";
import { getCachedSnapshot } from "@/lib/devnet-server";
import home from "@/components/home/home.module.css";
import cards from "@/components/shell/tool-context.module.css";

export const metadata: Metadata = {
  title: "Network",
  description:
    "Public readings from the FLOP devnet gateway and indexer: block height, accounts, price-source addresses and the sampled settlement page, each with its source and time.",
};

export const revalidate = 30;
export default async function NetworkPage() {
  const snapshot = await getCachedSnapshot();
  const observe = toolsIn("observe").filter((tool) => tool.status !== "planned");
  return (
    <>
      <PageHero
        eyebrow="Network / Public readings"
        lines={["Read what the", "network publishes."]}
        accent={1}
        lede="The gateway and the indexer answer in public. Each value keeps its source and time. Values can have different measurement times. They are not an atomic network snapshot."
      >
        <LiveStatus stats={snapshot.stats} renderedAt={snapshot.renderedAt} />
      </PageHero>
      <section className="section" aria-label="Devnet observations">
        <ReadingReveal>
          <DevnetPanel snapshot={snapshot} />
        </ReadingReveal>
        <div className={home.observeGrid}>
          <div className={home.observeNotes}>
            <p className="eyebrow">How to read the map</p>
            <ReadingSteps
              steps={[
                {
                  title: "Read a public source",
                  text: "The gateway lists price-source addresses. The indexer reports blocks, accounts and a page of settlements. Each observation keeps its source and time.",
                },
                {
                  title: "Keep the sample in view",
                  text: "The map highlights addresses found in both responses. A missing match only means an address was absent from this settlement page.",
                },
                {
                  title: "Inspect before you rely",
                  text: "Open a tool for its checks and limits. Contribution signatures verify published bytes. They do not prove an inference result or network finality.",
                },
              ]}
            />
          </div>
          <ReadingReveal order={1}>
            <DevnetPanel snapshot={snapshot} visual />
          </ReadingReveal>
        </div>
      </section>
      <section className="section" aria-labelledby="observe-tools">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Observe over time</p>
            <h2 id="observe-tools">Follow the devnet past a single reading.</h2>
          </div>
          <p className="muted">
            Each tool keeps dated recordings, so a change shows up as a difference between two captures.
          </p>
        </div>
        <ul className={cards.relatedGrid}>
          {observe.map((tool) => (
            <li key={tool.slug}>
              <ToolCard tool={tool} hint={tool.status} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
