// SPDX-License-Identifier: Apache-2.0
import { getCachedSnapshot } from "@/lib/devnet-server";

export const revalidate = 30;

/**
 * The latest block observation for the header reading. It shares the home page's 30 second snapshot cache,
 * so polling it adds no public requests beyond that cache. A failed source keeps its dated last value.
 */
export async function GET() {
  const snapshot = await getCachedSnapshot();
  return Response.json({ stats: snapshot.stats, renderedAt: snapshot.renderedAt });
}
