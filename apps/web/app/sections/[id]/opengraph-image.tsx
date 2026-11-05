// SPDX-License-Identifier: Apache-2.0
import { sections } from "@/content/tools";
import { sectionImage } from "@/components/suite/social-image";
export const alt = "flop-lab section: independent FLOP devnet tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";
export function generateStaticParams() {
  return sections.map(({ id }) => ({ id }));
}
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return sectionImage((await params).id);
}
