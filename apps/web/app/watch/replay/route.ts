// SPDX-License-Identifier: Apache-2.0
import { parseRules } from "../../../../../packages/watch/src/config";
import { recordedReplay } from "../data";
import { failure, LIMITS, sameOrigin } from "../../../lib/security/policy";
import { readBytes, safeJson } from "../../../lib/security/transport";

/** Replay bounded YAML against local recordings only. @example POST /watch/replay with text/plain */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure(403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/plain") return failure(415);
  try {
    const bytes = await readBytes(request.body, LIMITS.requestBytes, AbortSignal.timeout(LIMITS.bodyMs));
    const config = parseRules(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return safeJson(recordedReplay(config));
  } catch (error) {
    return failure(
      error instanceof RangeError ? 413 : error instanceof DOMException && error.name === "TimeoutError" ? 408 : 400,
    );
  }
}
