// SPDX-License-Identifier: Apache-2.0
import { modelFallback, publicHistory } from "../data";

export const revalidate = 300;
export async function GET() {
  return Response.json(
    { modelFallback: await modelFallback(await publicHistory()) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } },
  );
}
