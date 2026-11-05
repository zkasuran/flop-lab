// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Contribution provenance",
  description: "Inspect the public signing identity for flop-lab contributions.",
};
export default function Provenance() {
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Open source / Provenance</p>
        <h1>Check the signature.</h1>
        <p className="muted">
          Browser verification is being built. This page does not verify a signature yet. The footer identifies the
          public key used by the repository publisher.
        </p>
      </header>
      <section className="panel">
        <h2>What a signature tells you</h2>
        <p>
          A valid signature binds exact manifest bytes to a public key. It does not prove the code is safe or that
          network data is correct.
        </p>
      </section>
    </>
  );
}
