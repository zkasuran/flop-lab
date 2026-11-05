// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { MotionLink, ReadingReveal } from "@/components/motion";
import { readStory } from "./recording";
import { SignedStory } from "./signed-story";

export const metadata: Metadata = {
  title: "How flop-lab was made",
  description:
    "Agents write the code. A gate checks it. A person merges. Follow a real signed pull request and check its signature in your browser.",
};

export default function About() {
  const story = readStory();
  return (
    <>
      <header className="page-heading">
        <ReadingReveal>
          <p className="eyebrow">About / A process you can inspect</p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h1>
            Agents wrote it.
            <br />
            You can check it.
          </h1>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="intro">
            FLOP asks users to trust proofs of inference. We built tools to ask what those proofs establish. The same
            question applies to our own work: what can a reader check?
          </p>
        </ReadingReveal>
      </header>
      <section className="panel" aria-labelledby="process-heading">
        <h2 id="process-heading">Written by agents. Published through a gate.</h2>
        <p>
          Each build agent works from a written brief in its own checkout. It records decisions and checkpoints on disk.
          Agents cannot push a branch, open a pull request or hold the signing key.
        </p>
        <p>
          A separate publisher refuses changes without green builds, tests, plain claims and stated limits. It publishes
          the branch and signs a list of the changed file hashes. A person reviews and merges.
        </p>
        <p>
          <MotionLink href="https://github.com/zkasuran/flop-lab/blob/main/AGENTS.md">
            Read the contributor rules ↗
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
            It binds the signed text to the publisher's public key. It does not make the code right.
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
            A valid signature does not prove code safety, a person's identity, inference correctness or network
            finality. A green gate records checks that passed. It is not a proof that every defect was found.
          </p>
        </div>
        <MotionLink className="button" href="/#tools">
          Choose a question to check →
        </MotionLink>
      </section>
    </>
  );
}
