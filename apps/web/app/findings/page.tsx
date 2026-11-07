// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { Findings } from "@/components/findings";
import { ClaimMatrix } from "@/components/home/claim-matrix";
import { PromiseLedger } from "@/components/home/promise-ledger";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { MotionLink } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { getCachedSnapshot } from "@/lib/devnet-server";
import { readClaimRun, readPromiseLedger, readSettlementTape } from "@/lib/evidence";

export const metadata: Metadata = {
  title: "Findings",
  description:
    "Dated findings from the FLOP devnet: settlement arithmetic, documented claims checked from outside and what public data cannot settle.",
};

export const revalidate = 30;
export default async function FindingsPage() {
  const snapshot = await getCachedSnapshot();
  const run = readClaimRun();
  const tape = readSettlementTape();
  const ledger = await readPromiseLedger(run);
  return (
    <>
      <PageHero
        eyebrow="Findings / Dated observations"
        lines={["The arithmetic passes.", "The questions stay open."]}
        accent={1}
        lede="These samples describe what the tools saw at the times shown. The devnet is disposable and may reset. Every figure keeps its source and capture time."
      >
        <MotionLink className="button" href="/harness">
          Inspect every claim <ArrowRight />
        </MotionLink>
        <MotionLink className="text-link" href="https://github.com/flop-labs/network/issues/87">
          The failure filed upstream <ArrowUpRight />
        </MotionLink>
      </PageHero>
      {run ? (
        <ClaimMatrix run={run} />
      ) : (
        <div className="panel">
          <p className="muted">Recorded harness results are unavailable. Open the harness for its evidence.</p>
        </div>
      )}
      <Findings snapshot={snapshot} run={run} tape={tape} />
      <PromiseLedger ledger={ledger} />
    </>
  );
}
