// SPDX-License-Identifier: Apache-2.0
import { ImageResponse } from "next/og";
import { sections, tools } from "@/content/tools";

function image(title: string, question: string, label: string) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#101310",
        color: "#f0f3e8",
        padding: "64px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
        <span>flop-lab</span>
        <span style={{ color: "#b8d98c" }}>{label}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontSize: 72, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 32, lineHeight: 1.35, color: "#bec5b8" }}>{question}</div>
      </div>
      <div style={{ display: "flex", borderTop: "2px solid #45523d", paddingTop: 22, fontSize: 24 }}>
        Independent FLOP devnet tools / Dated evidence / Read-only
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}

/** Render a registry tool card without network requests. @example toolImage("verify") */
export function toolImage(slug: string) {
  const tool = tools.find((entry) => entry.slug === slug);
  if (!tool) throw new Error("Unknown social image tool");
  return image(tool.name, tool.tagline, `${tool.section.toUpperCase()} / ${tool.status}`);
}

/** Render a suite section card without network requests. @example sectionImage("observe") */
export function sectionImage(id: string) {
  const section = sections.find((entry) => entry.id === id);
  if (!section) throw new Error("Unknown social image section");
  return image(section.title, section.question, "THE FLOP DEVNET SUITE");
}
