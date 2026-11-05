// SPDX-License-Identifier: Apache-2.0
import { ImageResponse } from "next/og";
export const alt = "flop-lab contribution provenance. Check the signature.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#101312",
        color: "#edf2e9",
        width: "100%",
        height: "100%",
        padding: 70,
      }}
    >
      <div style={{ fontSize: 34 }}>flop-lab / Provenance</div>
      <div style={{ fontSize: 88 }}>Check the signature.</div>
      <div style={{ fontSize: 28, color: "#bded89" }}>Ed25519 / did:key / Independent community project</div>
    </div>,
    size,
  );
}
