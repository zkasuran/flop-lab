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

const process = [
  {
    title: "An agent works from a brief",
    text: "Each tool was built by a separate AI agent from a written brief, in its own git worktree, with checkpoints on disk.",
  },
  {
    title: "A gate refuses weak changes",
    text: "An agent cannot push, open a pull request or touch a key. The gate refuses a change without a green build, tests, honest wording and a README that says what is not verified.",
  },
  {
    title: "The publisher signs the file hashes",
    text: "Every pull request is signed with one Ed25519 key. The signature covers the hash of every changed file.",
  },
  {
    title: "A person merges",
    text: "A signature proves who published the bytes. It does not prove the code is right. Tests, mutation checks and your own run are for that.",
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
              Independent tools / FLOP devnet
            </p>
            <h1 id="pitch" className={styles.heroTitle}>
              <span className={styles.line}>
                <span>Observe first.</span>
              </span>
              <span className={styles.line}>
                <span>
                  Build on <em>evidence.</em>
                </span>
              </span>
            </h1>
          </div>
          <div className={styles.heroAside}>
            <p className={styles.heroIntro}>
              Open tools for a network where agents pay miners for AI inference. Inspect what happened. See what is
              still unverified.
            </p>
            <div className={styles.heroActions}>
              <MotionLink className="button" href="#tools">
                Explore the tools <ArrowDown />
              </MotionLink>
              <MotionLink className="text-link" href="https://docs.flop.network">
                Read the protocol <ArrowUpRight />
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
              <p className="muted">Recorded harness results are unavailable. Open the harness for its evidence.</p>
            </div>
          )}
        </div>
      </section>

      <Findings snapshot={snapshot} run={run} tape={tape} />

      <PromiseLedger ledger={ledger} />

      <section className="section" id="observe" aria-labelledby="observe-heading">
        <SectionHeading
          index="03"
          eyebrow="Devnet observations"
          id="observe-heading"
          title="Read what the network publishes."
        >
          The gateway and the indexer answer in public. Each value keeps its source and time. Values can have different
          measurement times. They are not an atomic network snapshot.
        </SectionHeading>
        <ReadingReveal>
          <DevnetPanel snapshot={snapshot} />
        </ReadingReveal>
        <div className={styles.observeGrid}>
          <div className={styles.observeNotes}>
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

      <section className="section" id="tools" aria-labelledby="tools-heading">
        <SectionHeading index="04" eyebrow="The workbench" id="tools-heading" title="One suite. One question per tool.">
          The suite has six sections, from watching the network to checking who signed a change. Start with a settlement
          in the verifier. Alpha pages run today on real data. Planned pages link to their source.
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
          No wallet, key or account. Paste a command in a terminal to read the gateway or run a tool from a checkout.
          Then open a tool to check what the records support.
        </SectionHeading>
        <ReadingReveal>
          <Terminal />
        </ReadingReveal>
      </section>

      <section className="section" id="process" aria-labelledby="process-heading">
        <SectionHeading
          index="06"
          eyebrow="How it is built"
          id="process-heading"
          title="Agents wrote it. You can check it."
        >
          FLOP asks users to trust proofs of inference. The same question applies to this site: what can a reader check?
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
                How this was made <ArrowRight />
              </MotionLink>
              <MotionLink className="text-link" href="/provenance">
                Verify contribution proofs <ArrowRight />
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
