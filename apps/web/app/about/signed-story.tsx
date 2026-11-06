// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { extractProof, verifyContribution } from "@/lib/provenance";
import { parseManifest, type Verification } from "@/lib/did";
import type { Story } from "./recording";
import styles from "./story.module.css";

/** Follow a recorded contribution and verify its exact proof locally. Example: <SignedStory story={story} />. */
export function SignedStory({ story }: { story: Story }) {
  const [tamper, setTamper] = useState(false);
  const [result, setResult] = useState<Verification | null>(null);
  const reduced = useReducedMotion() !== false;
  let proof;
  let manifest;
  try {
    proof = extractProof(story.pr.body);
    manifest = parseManifest(proof.manifest);
  } catch {
    /* The existing verifier reports malformed proof bytes below. */
  }
  useEffect(() => {
    let current = true;
    void verifyContribution(story.pr, tamper).then((value) => {
      if (current) setResult(value);
    });
    return () => {
      current = false;
    };
  }, [story.pr, tamper]);
  return (
    <div className={styles.story}>
      <section className="section" aria-labelledby="example-heading">
        <ReadingReveal>
          <div className="section-heading">
            <div>
              <p className="eyebrow">One real contribution</p>
              <h2 id="example-heading">The site shell, from branch to merge.</h2>
            </div>
            <p className="muted">
              Recorded from{" "}
              <MotionLink href={story.source}>
                GitHub&apos;s public API <ArrowUpRight size={13} />
              </MotionLink>
              <br />
              <time dateTime={story.measuredAt}>{story.measuredAt.replace("T", " ").replace("Z", " UTC")}</time>
            </p>
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className="panel">
            <p className="eyebrow">
              Pull request <ObservedNumber value={story.pr.number} />
            </p>
            <h3>
              <MotionLink href={story.pr.html_url}>
                {story.pr.title} <ArrowUpRight size={16} />
              </MotionLink>
            </h3>
            <p>
              <ObservedNumber value={manifest?.files.length} /> file hashes in the signed manifest. The signature covers
              the published branch head below.
            </p>
            <p className="mono">
              {story.pr.head.ref} / {story.pr.head.sha}
            </p>
          </div>
        </ReadingReveal>
      </section>
      <ReadingPath
        title="Follow the published record."
        steps={[
          {
            title: "An agent prepares a branch",
            text: `The public branch is ${story.pr.head.ref}. Its recorded head is ${story.pr.head.sha}. The work stays in a separate checkout until the gate passes.`,
          },
          {
            title: "The gate checks the change",
            text: "Install, lint, type checks, tests and production builds must pass for the final commit. The publisher also checks wording, scope and the package README. The PR body records the checks that were run.",
          },
          {
            title: "The publisher signs the file list",
            text:
              manifest && proof
                ? `The manifest names ${manifest.files.length} file hashes. Its Ed25519 signature starts ${proof.signature.slice(0, 16)}. The full signed bytes are available below.`
                : "The proof could not be parsed. The local check below reports the failure.",
          },
          {
            title: "A person merges",
            text: `GitHub records ${story.mergedBy} merging this pull request at ${story.mergedAt}. The merge commit is ${story.mergeCommit}. This is GitHub metadata. The contribution signature covers the branch head, not this merge record.`,
          },
          {
            title: "You check the signature",
            text: "Your browser uses the existing contribution verifier to check the pinned public key, signed branch and recorded head. Try changing a byte below. Reading this far does not count as verification.",
          },
        ]}
      />
      <section className="panel" aria-labelledby="local-check-heading">
        <h2 id="local-check-heading">Check it here.</h2>
        <p>This result is computed in your browser from the recorded proof. It is not a saved PASS label.</p>
        <p className={`verification-result ${result ? (result.valid ? "success" : "error") : "muted"}`} role="status">
          <motion.span
            key={result?.reason ?? "pending"}
            initial={{ opacity: reduced ? 1 : 0.65 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            {result
              ? `${result.valid ? "PASS" : "FAIL"} / ${result.reason}`
              : "Checking the recorded signature locally..."}
          </motion.span>
        </p>
        <MotionButton
          className="quiet-button"
          aria-pressed={tamper}
          onClick={() => {
            setResult(null);
            setTamper(!tamper);
          }}
        >
          {tamper ? "Restore signed bytes" : "Flip a signed byte"}
        </MotionButton>
        {proof && (
          <Disclosure title="Inspect the full signed manifest">
            <p className="mono">Public key: {proof.did}</p>
            <pre className="manifest">{proof.manifest}</pre>
            <p className="mono">Signature: {proof.signature}</p>
          </Disclosure>
        )}
        <p>
          <MotionLink className="text-link" href="/provenance">
            Read current pull request proofs and the build signature <ArrowRight />
          </MotionLink>
        </p>
      </section>
    </div>
  );
}
