// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sections, toolsIn } from "@/content/tools";
import { SectionView } from "@/components/suite/section-view";
import { sectionEvidence } from "@/components/suite/evidence";

export const dynamicParams = false;
export function generateStaticParams() {
  return sections.map(({ id }) => ({ id }));
}
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const section = sections.find((entry) => entry.id === id);
  return { title: section?.title, description: section?.question };
}
export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const section = sections.find((entry) => entry.id === id);
  if (!section) notFound();
  const evidence = sectionEvidence();
  return (
    <SectionView
      id={section.id}
      evidence={Object.fromEntries(toolsIn(section.id).map((tool) => [tool.slug, evidence[tool.slug] ?? null]))}
    />
  );
}
