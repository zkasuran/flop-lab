// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { MotionLink } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { readStory } from "./recording";
import { SignedStory } from "./signed-story";

export const metadata: Metadata = {
  title: "How flop-lab was made",
  description:
    "Agents write the suite. Gates check publication and automatic merges. Follow a recorded signed pull request and inspect the deployed manifest.",
};

export default function About() {
  const story = readStory();
  return (
    <>
      <PageHero
        eyebrow="About / A process you can inspect"
        lines={["Agents wrote it.", "You can check it."]}
        accent={1}
        lede="FLOP asks users to trust proofs of inference. The suite watches public data, checks claims and helps builders use the protocol. The same question applies to our own work: what can a reader check?"
      />
      <section className="panel" aria-labelledby="process-heading">
        <h2 id="process-heading">Written by agents. Published through a gate.</h2>
        <p>
          Each build agent works from a written brief in its own checkout. It records decisions and checkpoints on disk.
          Agents cannot push a branch, open a pull request or hold the signing key.
        </p>
        <p>
          A separate publisher refuses changes without green builds, tests, plain claims and stated limits. It publishes
          the branch and signs a list of the changed file hashes.
        </p>
        <p>
          Eligible pull requests merge automatically when CI is green and the branch merges cleanly into main. The merge
          result must pass install, check, build and the Markdown voice check. Changes under .github/ wait for human
          review. A failed gate or merge conflict returns to the agent for a fix.
        </p>
        <p>
          The example below records an earlier contribution. Its counts and times come from that saved GitHub artifact.
          It does not stand in for the current suite's full history. The{" "}
          <MotionLink href="/docs">package guides</MotionLink> come directly from each README at build time. The{" "}
          <MotionLink href="/docs/findings">findings list</MotionLink> records public upstream issue states with their
          observation times.
        </p>
        <p>
          <MotionLink className="text-link" href="https://github.com/zkasuran/flop-lab/blob/main/AGENTS.md">
            Read the contributor rules <ArrowUpRight size={14} />
          </MotionLink>
        </p>
      </section>
      {story ? (
        <SignedStory story={story} />
      ) : (
        <section className="panel">
          <h2>Recorded pull request unavailable</h2>
          <p>
            The example could not be read.{" "}
            <MotionLink href="/provenance">Open the public contribution verifier</MotionLink> to inspect a pull request.
          </p>
        </section>
      )}
      <section className="section" aria-labelledby="trust-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">What trust rests on</p>
            <h2 id="trust-heading">A signature is a starting point.</h2>
          </div>
          <p className="muted">
            It binds the signed text to the publisher&apos;s public key. It does not make the code right.
          </p>
        </div>
        <div className="panel">
          <h3>Check the code and the deployed build.</h3>
          <p>
            Every published pull request carries a signature and a recipe for checking it. The signed deployment carries{" "}
            <MotionLink href="/SIGNATURE.json">/SIGNATURE.json</MotionLink> for the repository. The{" "}
            <MotionLink href="/provenance">contribution verifier</MotionLink> checks that build manifest against the
            deployed commit. An unsigned local build is labelled as such.
          </p>
          <p>
            Tests check behavior. Mutation checks deliberately break logic to see whether tests catch it. Run the tools
            yourself and keep the source time with the result.
          </p>
        </div>
        <div className="panel">
          <h3>What this does not verify</h3>
          <p>
            The browser checks signed manifest bytes. It does not download and hash repository files. A pull request
            manifest covers changed files, not the whole repository. Merge details and capture times are recorded GitHub
            metadata, not signed claims.
          </p>
          <p>
            A valid signature does not prove code safety, a person&apos;s identity, inference correctness or network
            finality. A green gate records checks that passed. It is not a proof that every defect was found.
          </p>
        </div>
        <MotionLink className="button" href="/#tools">
          Choose a question to check <ArrowRight />
        </MotionLink>
      </section>
    </>
  );
}
