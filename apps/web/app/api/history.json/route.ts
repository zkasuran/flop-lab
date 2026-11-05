// SPDX-License-Identifier: Apache-2.0
import { analyze } from "../../../../../packages/recorder/src/analysis";
import { modelFallback, publicHistory } from "../../history/data";

export const revalidate = 300;
export async function GET() {
  const history = await publicHistory();
  return Response.json(
    { ...history, latestModels: undefined, ...analyze(history.index), modelFallback: await modelFallback(history) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } },
  );
}
