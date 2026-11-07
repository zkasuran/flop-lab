// SPDX-License-Identifier: Apache-2.0
import type { Story } from "@/app/about/recording";
import { CONTRIBUTOR_DID } from "@/lib/constants";
import { CopyButton } from "../controls";
import { ArrowRight } from "../icons";
import { MotionLink } from "../motion";
import { SignatureCheck } from "../home/signature-check";
import { Terminal } from "../home/terminal";
import { BlockHeading } from "./block-heading";
import styles from "./landing.module.css";

const promises = [
  { title: "No wallet.", text: "These commands read public endpoints only." },
  { title: "No key.", text: "None of them needs a private key or an API token." },
  { title: "No account.", text: "Run them from a checkout with Node 22 and pnpm." },
];

/** Copyable start commands beside the three things they do not need. Example: <Quickstart />. */
export function Quickstart() {
  return (
    <section className={styles.block} id="start" aria-labelledby="start-title">
      <div className={styles.split}>
        <div className={styles.splitCopy}>
          <BlockHeading
            id="start-title"
            eyebrow="Start with a read"
            title="Start with the public model list."
            lede={
              <>
                Paste a command to read the gateway, or{" "}
                <MotionLink href="/docs/cli">run flop from a checkout</MotionLink> to find a suite tool. Each package
                guide keeps its quick start beside its limits.
              </>
            }
          />
          <ul className={styles.promises}>
            {promises.map((item) => (
              <li key={item.title} className="reveal-soft">
                <span className={styles.promiseMark} aria-hidden="true" />
                <span>
                  <b>{item.title}</b> {item.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className={`${styles.splitVisual} reveal`}>
          <Terminal />
        </div>
      </div>
    </section>
  );
}

const process = [
  "An agent works from a written brief in its own checkout.",
  "A gate refuses a change without green builds, tests and stated limits.",
  "The publisher signs the hash of every changed file.",
  "A person reviews and merges.",
];

/** How the project is built, with a real recorded signature checked in the browser. Example: <Signed story={story} />. */
export function Signed({ story }: { story: Story | null }) {
  return (
    <section className={styles.block} aria-labelledby="signed-title">
      <div className={styles.split}>
        <div className={styles.splitCopy}>
          <BlockHeading
            id="signed-title"
            eyebrow="Signed by design"
            title={
              <>
                Agents wrote it. <span className="signal-text">You can check it.</span>
              </>
            }
            lede="FLOP asks users to trust proofs of inference. The same question applies here: what can a reader check?"
          />
          <ol className={styles.process}>
            {process.map((step, index) => (
              <li key={step} className="reveal-soft">
                <span className={styles.processIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className={styles.didRow}>
            <code title={CONTRIBUTOR_DID}>{CONTRIBUTOR_DID}</code>
            <CopyButton text={CONTRIBUTOR_DID} label="Copy DID" />
          </div>
          <div className={styles.links}>
            <MotionLink className="text-link" href="/about">
              How this was made <ArrowRight />
            </MotionLink>
            <MotionLink className="text-link" href="/provenance">
              Verify contribution proofs <ArrowRight />
            </MotionLink>
          </div>
        </div>
        <div className={`${styles.splitVisual} reveal`}>
          {story ? (
            <SignatureCheck story={story} />
          ) : (
            <div className="panel">
              <p className="muted">
                The recorded pull request could not be read. Open the contribution verifier to inspect one.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
