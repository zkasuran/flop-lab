// SPDX-License-Identifier: Apache-2.0
import { ImageResponse } from "next/og";
import { readClaimRun } from "@/lib/evidence";
import { OG_SIZE, OgCard, OgMatrix } from "@/lib/og";

export const alt =
  "flop-lab. Built on FLOP. See the network, check it yourself. Dated findings from the FLOP devnet with public evidence.";
export const size = OG_SIZE;
export const contentType = "image/png";
export default function Image() {
  const run = readClaimRun();
  return new ImageResponse(
    <OgCard
      eyebrow="Built on FLOP / Independent devnet observatory"
      title="See the network. Check it yourself."
      footer={
        run
          ? `${run.claims.length} recorded claims: ${run.counts.PASS} pass, ${run.counts.FAIL} fail, ${run.counts.UNVERIFIABLE} unverifiable, ${run.counts.SKIPPED} skipped.`
          : "Dated findings. Public evidence. Tools you can run."
      }
      visual={run ? <OgMatrix statuses={run.claims.map((claim) => claim.status)} /> : undefined}
    />,
    size,
  );
}
