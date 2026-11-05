// SPDX-License-Identifier: Apache-2.0
import { sourceDocuments, sourcePage } from "../../source-data";
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return sourceDocuments.map((doc) => ({ id: doc.id }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = sourcePage(id);
  return page ? Response.json(page) : Response.json({ error: "Unknown source document" }, { status: 404 });
}
