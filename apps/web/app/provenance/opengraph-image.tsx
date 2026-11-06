// SPDX-License-Identifier: Apache-2.0
import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/lib/og";

export const alt = "flop-lab contribution provenance. Check the signature.";
export const size = OG_SIZE;
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <OgCard
      eyebrow="Open source / Provenance"
      title="Check the signature."
      footer="Ed25519 / did:key / Independent community project"
    />,
    size,
  );
}
