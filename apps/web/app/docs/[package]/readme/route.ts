// SPDX-License-Identifier: Apache-2.0
import { readCatalog } from "../../catalog";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return readCatalog().docs.map((doc) => ({ package: doc.slug }));
}
export async function GET(_request: Request, { params }: { params: Promise<{ package: string }> }) {
  const slug = (await params).package;
  const doc = readCatalog().docs.find((item) => item.slug === slug);
  if (!doc) return new Response("README not found", { status: 404 });
  return new Response(doc.raw, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
