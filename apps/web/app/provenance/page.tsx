// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { ProvenanceBrowser } from "@/components/provenance-browser";
import { ReadingPath, ReadingReveal } from "@/components/motion";
export const metadata: Metadata = {
  title: "Contribution provenance",
  description: "Inspect the public signing identity for flop-lab contributions.",
};
export default function Provenance() {
  return (
    <>
      <header className="page-heading">
        <ReadingReveal>
          <p className="eyebrow">Open source / Provenance</p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h1>Check the signature.</h1>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="muted">
            Verify exact manifest bytes with the public DID in the footer. Checks run locally with Ed25519 WebCrypto.
            Flip one byte to see a valid signature fail.
          </p>
        </ReadingReveal>
      </header>
      <section className="panel">
        <h2>What a signature tells you</h2>
        <p>
          A valid signature binds exact manifest bytes to a public key. It does not prove the code is safe or that
          network data is correct.
        </p>
      </section>
      <ReadingPath
        title="From bytes to a result."
        steps={[
          {
            title: "Read the manifest",
            text: "Extract the exact signed text from a public pull request or this build. Preserve every byte, including line breaks.",
          },
          {
            title: "Bind the public key and commit",
            text: "Decode the pinned did:key as Ed25519. Check that the manifest names the expected commit and branch.",
          },
          {
            title: "Verify in this browser",
            text: "WebCrypto checks the signature. Only a successful check shows PASS. The tamper control flips one byte and checks again.",
          },
        ]}
      />
      <ProvenanceBrowser />
    </>
  );
}
