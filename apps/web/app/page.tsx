// SPDX-License-Identifier: Apache-2.0
import { MotionLink, ReadingReveal, ReadingSteps } from "@/components/motion";
import { ToolGrid } from "@/components/tool-grid";
import { DevnetPanel } from "@/components/devnet-panel";
import { Findings } from "@/components/findings";
import { ClaimMatrix } from "@/components/home/claim-matrix";
import { LiveStatus } from "@/components/home/live-status";
import { PromiseLedger } from "@/components/home/promise-ledger";
import { SectionHeading } from "@/components/home/section-heading";
import { SignatureCheck } from "@/components/home/signature-check";
import { Terminal } from "@/components/home/terminal";
import { ArrowDown, ArrowRight, ArrowUpRight } from "@/components/icons";
import { getCachedSnapshot } from "@/lib/devnet-server";
import { readClaimRun, readPromiseLedger, readSettlementTape } from "@/lib/evidence";
import { readStory } from "./about/recording";
import styles from "@/components/home/home.module.css";
import { languageMetadata } from "./zh/routes";
import { home } from "./zh/translations/home";

export const metadata = languageMetadata("/", "en");
const c = home.en;

const process = [
  {
    title: c.step1,
    text: c.step1Text,
  },
  {
    title: c.step2,
    text: c.step2Text,
  },
  {
    title: c.step3,
    text: c.step3Text,
  },
  {
    title: c.step4,
    text: c.step4Text,
  },
];

export const revalidate = 30;
export default async function Home() {
  const snapshot = await getCachedSnapshot();
  const run = readClaimRun();
  const tape = readSettlementTape();
  const ledger = await readPromiseLedger(run);
  const story = readStory();
  return (
    <>
      <section className={styles.hero} aria-labelledby="pitch">
        <div className={styles.backdrop} aria-hidden="true" />
        <div className={styles.heroTop}>
          <div>
            <p className={`eyebrow ${styles.heroEyebrow}`}>
              <span className={styles.heroMark} aria-hidden="true" />
              {c.eyebrow}
            </p>
            <h1 id="pitch" className={styles.heroTitle}>
              <span className={styles.line}>
                <span>{c.title}</span>
              </span>
              <span className={styles.line}>
                <span>
                  Build on <em>evidence.</em>
                </span>
              </span>
            </h1>
          </div>
          <div className={styles.heroAside}>
            <p className={styles.heroIntro}>{c.intro}</p>
            <div className={styles.heroActions}>
              <MotionLink className="button" href="#tools">
                {c.explore} <ArrowDown />
              </MotionLink>
              <MotionLink className="text-link" href="/docs">
                Find a command <ArrowUpRight />
              </MotionLink>
            </div>
            <LiveStatus stats={snapshot.stats} renderedAt={snapshot.renderedAt} />
          </div>
        </div>
        <div className={styles.heroVisual}>
          {run ? (
            <ClaimMatrix run={run} />
          ) : (
            <div className="panel">
              <p className="muted">{c.missingRun}</p>
            </div>
          )}
        </div>
      </section>

      <Findings snapshot={snapshot} run={run} tape={tape} />
      <MotionLink className="text-link" href="/docs/findings">
        Read the dated upstream reports <ArrowRight />
      </MotionLink>

      <PromiseLedger ledger={ledger} />

      <section className="section" id="observe" aria-labelledby="observe-heading">
        <SectionHeading index="03" eyebrow={c.observations} id="observe-heading" title={c.observeTitle}>
          {c.observeText}
        </SectionHeading>
        <ReadingReveal>
          <DevnetPanel snapshot={snapshot} />
        </ReadingReveal>
        <div className={styles.observeGrid}>
          <div className={styles.observeNotes}>
            <p className="eyebrow">{c.map}</p>
            <ReadingSteps
              steps={[
                {
                  title: c.read,
                  text: c.readText,
                },
                {
                  title: c.sample,
                  text: "The map highlights addresses found in both responses. A missing match only means an address was absent from this settlement page.",
                },
                {
                  title: c.inspect,
                  text: c.inspectText,
                },
              ]}
            />
          </div>
          <ReadingReveal order={1}>
            <DevnetPanel snapshot={snapshot} visual />
          </ReadingReveal>
        </div>
      </section>

      <section className="section" id="tools" aria-labelledby="tools-heading">
        <SectionHeading index="04" eyebrow="The workbench" id="tools-heading" title="One suite. One question per tool.">
          Observe, verify, build, operate, agents and identity. Each section starts with a question. Alpha pages use
          live or recorded real data with source times. Planned entries link to the repository. Search the{" "}
          <MotionLink href="/docs">package guides</MotionLink> for a command and its limits.
        </SectionHeading>
        <ToolGrid />
      </section>

      <section className="section" id="start" aria-labelledby="start-heading">
        <SectionHeading
          index="05"
          eyebrow="Start with a read"
          id="start-heading"
          title="Start with the public model list."
        >
          No wallet, key or account for this read. Paste the gateway command or use{" "}
          <MotionLink href="/docs/cli">flop from a checkout</MotionLink> to find a suite tool. Each package guide keeps
          its quick start beside its evidence limits.
        </SectionHeading>
        <ReadingReveal>
          <Terminal />
        </ReadingReveal>
      </section>

      <section className="section" id="process" aria-labelledby="process-heading">
        <SectionHeading index="06" eyebrow={c.process} id="process-heading" title={c.processTitle}>
          {c.processText}
        </SectionHeading>
        <div className={styles.processGrid}>
          <div>
            <ol className={styles.processSteps}>
              {process.map((step, index) => (
                <li key={step.title}>
                  <ReadingReveal order={index} className={styles.processItem}>
                    <span className={styles.processIndex} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3>{step.title}</h3>
                    <p className="muted">{step.text}</p>
                  </ReadingReveal>
                </li>
              ))}
            </ol>
            <div className={styles.processLinks}>
              <MotionLink className="text-link" href="/about">
                {c.about} <ArrowRight />
              </MotionLink>
              <MotionLink className="text-link" href="/provenance">
                {c.provenance} <ArrowRight />
              </MotionLink>
            </div>
          </div>
          <ReadingReveal order={1}>
            {story ? (
              <SignatureCheck story={story} />
            ) : (
              <div className="panel">
                <p className="muted">
                  The recorded pull request could not be read. Open the contribution verifier to inspect one.
                </p>
              </div>
            )}
          </ReadingReveal>
        </div>
      </section>
    </>
  );
}
