// SPDX-License-Identifier: Apache-2.0
import { collectTrail, type Observation } from "../../../../../packages/did/src/trail";
import { safeJson, withPublicOperation } from "../../../lib/security/transport";
import { createTrailReader } from "../../../lib/security/trail-reader";
import { failure } from "../../../lib/security/policy";

export const runtime = "nodejs";
const read = createTrailReader();

/** Return bounded raw observations for independent browser parsing. Example: GET /did/data?did=did:key:... */
export async function GET(request: Request) {
  return withPublicOperation(async () => {
    const query = new URL(request.url).searchParams.get("did") ?? "";
    const observations: Observation[] = [];
    try {
      const result = await collectTrail(query, async (url) => {
        // Transport errors must not enter collectTrail's public gap text.
        const obs = await read(url).catch(() => {
          throw new Error("Public source unavailable");
        });
        observations.push(obs);
        return obs;
      });
      return safeJson(
        { query, observations, gaps: result.gaps },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch {
      return failure(400);
    }
  });
}
