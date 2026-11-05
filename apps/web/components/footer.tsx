// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { CONTRIBUTOR_DID, FINGERPRINT } from "@/lib/constants";
import { repository } from "@/content/tools";
import { CopyButton } from "./controls";

export function Footer() {
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown";
  return (
    <footer className="proof-footer container">
      <div className="footer-top">
        <div>
          <p className="muted">Pull requests in this repository are signed with</p>
          <div className="proof-key">
            <code>{CONTRIBUTOR_DID}</code>
            <CopyButton text={CONTRIBUTOR_DID} label="Copy DID" />
          </div>
          <p className="muted mono">Fingerprint {FINGERPRINT}</p>
        </div>
        <Link href="/provenance">Verify contribution proofs ↗</Link>
      </div>
      <div className="footer-links">
        <a href={repository}>Repository ↗</a>
        <a href={`${repository}/blob/main/LICENSE`}>Apache-2.0</a>
        <span className="muted">
          Build{" "}
          {commit === "unknown" ? (
            "unknown"
          ) : (
            <a className="mono" title={commit} href={`${repository}/commit/${commit}`}>
              {commit.slice(0, 12)}
            </a>
          )}
        </span>
      </div>
      <p className="footer-note">
        Independent community project. Not an official FLOP product. Devnet data can change or reset.
      </p>
    </footer>
  );
}
