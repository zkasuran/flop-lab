// SPDX-License-Identifier: Apache-2.0
import { recordedInputs, runChecks } from "../../../../../packages/invariants/src/index";
import { failure, sameOrigin } from "../../../lib/security/policy";
import { readBytes } from "../../../lib/security/transport";
export const runtime = "nodejs";
let busy = false;

/** Download native raw inputs for local CLI replay. @example GET /invariants/replay */
export function GET() {
  return Response.json(recordedInputs(), {
    headers: {
      "Content-Disposition": 'attachment; filename="invariant-inputs.json"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

/** Re-evaluate the immutable recordings and stream actual library completions.
 * @example fetch('/invariants/replay', { method: 'POST' })
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure(403);
  try {
    await readBytes(request.body, 0, AbortSignal.timeout(5000));
  } catch {
    return failure(413);
  }
  if (busy) return failure(429);
  busy = true;
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      };
      try {
        const report = await runChecks(undefined, (suite, checks) => send({ suite, checks: checks.length }));
        send({ done: true, evaluatedAt: report.evaluatedAt });
      } catch {
        send({ error: "Recorded replay could not complete. The displayed recording is retained." });
      } finally {
        busy = false;
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
