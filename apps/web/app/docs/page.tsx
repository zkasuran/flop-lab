// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { MotionLink, ReadingPath, ReadingReveal } from "../../components/motion";
import { tools, toolHref } from "../../content/tools";
import { readCatalog } from "./catalog";
import { DocsSearch } from "./view";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Suite documentation",
  description:
    "Find the FLOP devnet tool for your question. Package READMEs, commands and limits in one searchable place.",
};
export const dynamic = "force-static";

export default function DocsPage() {
  const { docs, generatedAt } = readCatalog();
  const planned = tools.filter(
    (tool) => tool.status === "planned" && !docs.some((doc) => `packages/${doc.slug}` === tool.repoPath),
  );
  return (
    <>
      <header className={`page-heading ${styles.hubHeading}`}>
        <ReadingReveal>
          <p className="eyebrow">Build / Suite documentation</p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h1>
            Find your question.
            <br />
            Run the check.
          </h1>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="intro">
            Package guides for the FLOP devnet. Find a command, read its evidence and keep its limits.
          </p>
        </ReadingReveal>
        <div className={styles.actions}>
          <MotionLink className="button" href="/docs/cli">
            Start with flop →
          </MotionLink>
          <MotionLink href="/docs/findings">Dated upstream findings →</MotionLink>
          <MotionLink href="https://docs.flop.network">Protocol documentation ↗</MotionLink>
        </div>
        <p className={styles.meta}>
          Built{" "}
          <time dateTime={generatedAt} title={generatedAt}>
            {generatedAt.slice(0, 10)}
          </time>{" "}
          from package READMEs in this checkout.
        </p>
      </header>
      <DocsSearch
        docs={docs.map(({ slug, title, question, section, packageName, command, headings }) => ({
          slug,
          title,
          question,
          section,
          packageName,
          command,
          headings,
        }))}
      />
      <ReadingPath
        title="From question to evidence"
        steps={[
          {
            title: "Choose a section",
            text: "Observe the network. Verify a claim. Build an integration. Operate a node. Set agent policy. Check who signed the work.",
          },
          {
            title: "Run the package command",
            text: "Start with the README quick start. Use flop to find the tool's own options. Recorded fixtures let you inspect evidence offline.",
          },
          {
            title: "Keep the limits with the result",
            text: "Read the source time and the final limits section. An unavailable check is not a pass. The devnet can reset.",
          },
        ]}
      />
      {planned.length > 0 && (
        <section className="panel">
          <h2>Planned tools</h2>
          <p>These registry entries have no package README in this build.</p>
          <ul>
            {planned.map((tool) => (
              <li key={tool.slug}>
                <MotionLink href={toolHref(tool)}>{tool.name} ↗</MotionLink>: {tool.tagline}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="section">
        <h2>Other integration</h2>
        <p>
          <MotionLink href="/kestra">FLOP for Kestra</MotionLink> has its own plugin guide on the tool page.
        </p>
      </section>
    </>
  );
}
