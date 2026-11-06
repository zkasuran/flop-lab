// SPDX-License-Identifier: Apache-2.0
import { MotionLink } from "./motion";
import { CONTRIBUTOR_DID, FINGERPRINT } from "@/lib/constants";
import { repository, sections, toolHref, toolsIn } from "@/content/tools";
import { CopyButton } from "./controls";
import { ArrowRight, ArrowUpRight } from "./icons";

export function Footer() {
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown";
  const groups = sections
    .map((section) => ({ section, list: toolsIn(section.id).filter((tool) => tool.status !== "planned") }))
    .filter((group) => group.list.length > 0);
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-cta">
          <div>
            <p className="eyebrow">Dated observations, not conclusions</p>
            <h2>Run the tools and get your own.</h2>
            <p className="muted">
              Every tool runs from a checkout with Node 22 and pnpm. No wallet, no key, no account. Keep the source time
              with the result.
            </p>
          </div>
          <div className="footer-actions">
            <MotionLink className="button" href="/#start">
              Start with a read <ArrowRight />
            </MotionLink>
            <MotionLink className="quiet-button" href={repository}>
              Repository <ArrowUpRight />
            </MotionLink>
          </div>
        </div>
        <div className="footer-grid">
          <div>
            <h3>Signature</h3>
            <p className="muted">Pull requests in this repository are signed with</p>
            <div className="proof-key">
              <code>{CONTRIBUTOR_DID}</code>
              <CopyButton text={CONTRIBUTOR_DID} label="Copy DID" />
            </div>
            <p className="muted mono">Fingerprint {FINGERPRINT}</p>
            <p className="footer-verify">
              <MotionLink className="text-link" href="/provenance">
                Verify contribution proofs <ArrowRight />
              </MotionLink>
            </p>
          </div>
          <nav aria-label="Tools by section" className="footer-tools">
            {groups.map(({ section, list }) => (
              <div key={section.id} className="footer-group">
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
          <div>
            <h3>Project</h3>
            <ul>
              <li>
                <MotionLink href="/about">How this was made</MotionLink>
              </li>
              <li>
                <MotionLink href="/provenance">Contribution provenance</MotionLink>
              </li>
              <li>
                <MotionLink href={repository}>
                  Repository <ArrowUpRight />
                </MotionLink>
              </li>
              <li>
                <MotionLink href={`${repository}/blob/main/LICENSE`}>Apache-2.0</MotionLink>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-note">
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
      <div className="container footer-mark">
        <p className="footer-wordmark" aria-hidden="true">
          flop-lab
        </p>
      </div>
    </footer>
  );
}
