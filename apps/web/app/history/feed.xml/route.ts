// SPDX-License-Identifier: Apache-2.0
import { rss } from "../../../../../packages/recorder/src/analysis";
import { publicHistory } from "../data";

export const revalidate = 300;
export async function GET() {
  const history = await publicHistory();
  return new Response(rss(history.index), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
