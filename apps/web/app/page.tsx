// SPDX-License-Identifier: Apache-2.0
import { CopyButton } from "@/components/controls";
import { MotionLink, ReadingPath, ReadingReveal } from "@/components/motion";
import { ToolGrid } from "@/components/tool-grid";
import { DevnetPanel } from "@/components/devnet-panel";
import { getCachedSnapshot } from "@/lib/devnet-server";

const command = "curl --fail https://api.flop.network/v1/models";
export const revalidate = 30;
export default async function Home() {
  const snapshot = await getCachedSnapshot();
  return (
    <>
      <section className="hero" aria-labelledby="pitch">
        <div>
          <ReadingReveal>
            <p className="eyebrow">Independent tools / FLOP devnet</p>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <h1 id="pitch">
              Observe first.
              <br />
              Build on evidence.
            </h1>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <p className="intro">
              Open tools for a network where agents pay miners for AI inference. Inspect what happened. See what is
              still unverified.
            </p>
          </ReadingReveal>
          <ReadingReveal order={3}>
            <div className="hero-actions">
              <MotionLink className="button" href="#tools">
                Explore the tools <span aria-hidden="true">↓</span>
              </MotionLink>
              <MotionLink href="https://docs.flop.network">Read the protocol ↗</MotionLink>
            </div>
          </ReadingReveal>
        </div>
        <DevnetPanel snapshot={snapshot} visual />
      </section>
      <DevnetPanel snapshot={snapshot} />
      <ReadingPath
        title="Follow the evidence."
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
      <section className="section" id="tools" aria-labelledby="tools-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The workbench</p>
            <h2 id="tools-heading">One question. One tool.</h2>
          </div>
          <p className="muted">
            Planned tools link to their package location. They are not ready to run. Each tool will publish its evidence
            and limits.
          </p>
        </div>
        <ToolGrid />
      </section>
      <section className="section" aria-labelledby="start-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Start with a read</p>
            <h2 id="start-heading">Ask the network yourself.</h2>
          </div>
          <p className="muted">
            The public model list is keyless. This command reads gateway data. It does not send inference or move funds.
          </p>
        </div>
        <div className="command">
          <code>{command}</code>
          <CopyButton text={command} label="Copy command" />
        </div>
      </section>
    </>
  );
}
