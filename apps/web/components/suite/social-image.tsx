// SPDX-License-Identifier: Apache-2.0
import { ImageResponse } from "next/og";
import { sections, tools } from "@/content/tools";
import { OG_SIZE, OgCard } from "@/lib/og";

const FOOTER = "Independent FLOP devnet tools / Dated evidence / Read-only";

/** Release status and the registry question only. Social images carry no live metrics. */
function image(title: string, question: string, label: string) {
  return new ImageResponse(<OgCard eyebrow={label} title={title} subtitle={question} footer={FOOTER} />, OG_SIZE);
}

/** Render a registry tool card without network requests. @example toolImage("verify") */
export function toolImage(slug: string) {
  const tool = tools.find((entry) => entry.slug === slug);
  if (!tool) throw new Error("Unknown social image tool");
  const section = sections.find((entry) => entry.id === tool.section);
  return image(tool.name, tool.tagline, `${section?.title ?? tool.section} / ${tool.status}`);
}

/** Render a suite section card without network requests. @example sectionImage("observe") */
export function sectionImage(id: string) {
  const section = sections.find((entry) => entry.id === id);
  if (!section) throw new Error("Unknown social image section");
  return image(section.title, section.question, "The FLOP devnet suite");
}
