// SPDX-License-Identifier: Apache-2.0
import { readScoreboard } from "../server";

export const revalidate = 60;
export const dynamic = "force-static";

/** Serve validated observations with their original dates. Example: GET /scoreboard/snapshot. */
export async function GET() {
  return Response.json(await readScoreboard());
}
