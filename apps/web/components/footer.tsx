// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { Magnetic, MotionLink } from "./motion";
import { CONTRIBUTOR_DID, FINGERPRINT } from "@/lib/constants";
import { repository, sections, toolHref, toolsIn } from "@/content/tools";
import { CopyButton } from "./controls";
import { ArrowRight, ArrowUpRight, GitHubIcon, Mark } from "./icons";
import styles from "./shell/footer.module.css";

/** Site footer: a closing call to action, tools by section, the signing key and the project notice. */
export function Footer() {
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown";
  const groups = sections
    .map((section) => ({ section, list: toolsIn(section.id).filter((tool) => tool.status !== "planned") }))
    .filter((group) => group.list.length > 0);
  return (
    <footer className={`site-footer ${styles.footer}`}>
      <div className="container">
        <section className={styles.cta} aria-labelledby="footer-cta-title">
          <div className={styles.ctaField} aria-hidden="true" />
          <div className={styles.ctaCopy}>
            <p className="eyebrow">Dated observations, not conclusions</p>
            <h2 id="footer-cta-title">
              Run the tools. <span className="signal-text">Get your own.</span>
            </h2>
            <p className="muted">
              Every tool runs from a checkout with Node 22 and pnpm. No wallet, no key, no account. Keep the source time
              with the result.
            </p>
          </div>
          <div className={styles.ctaActions}>
            <Magnetic>
              <MotionLink className="button" href="/#start">
                Start with a read <ArrowRight />
              </MotionLink>
            </Magnetic>
            <MotionLink className="quiet-button" href={repository}>
              <GitHubIcon /> Repository <ArrowUpRight size={14} />
            </MotionLink>
          </div>
        </section>
        <div className={styles.grid}>
          <div className={styles.brandCol}>
            <Link className={styles.brand} href="/" aria-label="flop-lab home">
              <Mark size={26} />
              <span aria-hidden="true">
                flop<span className={styles.brandSuffix}>-lab</span>
              </span>
            </Link>
            <p className={styles.built}>
              <span className={styles.builtDot} aria-hidden="true" />
              Built on FLOP
            </p>
            <p className="muted">
              Independent tools for the FLOP Network devnet. They read what the network publishes, check it and say
              plainly what stays unverified.
            </p>
          </div>
          <nav aria-label="Tools by section" className={styles.tools}>
            {groups.map(({ section, list }) => (
              <div key={section.id} className={styles.group}>
                <h3>
                  <MotionLink href={`/sections/${section.id}`}>{section.title}</MotionLink>
                </h3>
                <ul>
                  {list.map((tool) => (
                    <li key={tool.slug}>
                      <MotionLink href={toolHref(tool)}>{tool.name}</MotionLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className={styles.side}>
            <div>
              <h3>Signature</h3>
              <p className="muted">Pull requests in this repository are signed with</p>
              <div className={styles.key}>
                <code>{CONTRIBUTOR_DID}</code>
                <CopyButton text={CONTRIBUTOR_DID} label="Copy DID" />
              </div>
              <p className="muted mono">Fingerprint {FINGERPRINT}</p>
              <p className={styles.verify}>
                <MotionLink className="text-link" href="/provenance">
                  Verify contribution proofs <ArrowRight />
                </MotionLink>
              </p>
            </div>
            <div>
              <h3>Project</h3>
              <ul>
                <li>
                  <MotionLink href="/about">How this was made</MotionLink>
                </li>
                <li>
                  <MotionLink href="/network">Network readings</MotionLink>
                </li>
                <li>
                  <MotionLink href="/findings">Findings</MotionLink>
                </li>
                <li>
                  <MotionLink href={repository}>
                    Repository <ArrowUpRight size={13} />
                  </MotionLink>
                </li>
                <li>
                  <MotionLink href={`${repository}/blob/main/LICENSE`}>Apache-2.0</MotionLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className={styles.note}>
          <p>Independent community project. Not an official FLOP product. Devnet data can change or reset.</p>
          <p>
            Build{" "}
            {commit === "unknown" ? (
              <span className="mono">unknown</span>
            ) : (
              <MotionLink className="mono" title={commit} href={`${repository}/commit/${commit}`}>
                {commit.slice(0, 12)}
              </MotionLink>
            )}
          </p>
        </div>
      </div>
      <div className={`container ${styles.mark}`} aria-hidden="true">
        <p className={styles.wordmark}>flop-lab</p>
      </div>
    </footer>
  );
}
