// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedReader } from "../../../../../packages/did/src/reader";
import { collectTrail, type Observation } from "../../../../../packages/did/src/trail";

export const runtime = "nodejs";
const read = cachedReader(process.env.FLOP_DID_CACHE ?? join(tmpdir(), "flop-did-cache"));

/** Return bounded raw observations for independent browser parsing. Example: GET /did/data?did=did:key:... */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("did") ?? "";
  const observations: Observation[] = [];
  try {
    const result = await collectTrail(query, async (url) => {
      const obs = await read(url);
      observations.push(obs);
      return obs;
    });
    return Response.json(
      { query, observations, gaps: result.gaps },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid trail request" }, { status: 400 });
  }
}
