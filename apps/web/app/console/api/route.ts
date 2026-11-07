// SPDX-License-Identifier: Apache-2.0
import { ConsoleError, ConsoleService } from "../../../../../packages/console/src/service";
import { visitorKey } from "../../../lib/security/admission";
import { failure, sameOrigin } from "../../../lib/security/policy";
import { publicFetch, readRequestJson, safeJson, withPublicOperation } from "../../../lib/security/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const service = new ConsoleService(publicFetch);

/** Same-origin read-only proxy with bounded input. @example POST /console/api {"action":"tools"} */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return failure(403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
    return failure(415);
  let body: unknown;
  try {
    body = await readRequestJson(request);
  } catch (error) {
    return failure(
      error instanceof RangeError ? 413 : error instanceof DOMException && error.name === "TimeoutError" ? 408 : 400,
    );
  }
  return withPublicOperation(async () => {
    try {
      const result = await service.handle(body, visitorKey(request));
      if (result.payload.kind === "estimate") {
        // Copy the cached payload. Never overwrite cached observations or raw evidence.
        const estimate = result.payload.estimate;
        return safeJson({
          ...result,
          payload: {
            ...result.payload,
            estimate: {
              ...estimate,
              errors: estimate.errors.map(({ tool }) => ({ tool, message: "Public observation unavailable" })),
              gatewayError: estimate.gatewayError ? "Public model list unavailable" : null,
            },
          },
        });
      }
      return safeJson(result);
    } catch (error) {
      return failure(error instanceof ConsoleError ? error.status : 400);
    }
  }, 25_000);
}
