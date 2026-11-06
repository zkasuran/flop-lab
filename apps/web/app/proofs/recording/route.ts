// SPDX-License-Identifier: Apache-2.0
import { recordedInput } from "../../../../../packages/proofs/src/recorded";
export const dynamic = "force-static";
export function GET() {
  return Response.json(recordedInput(), {
    headers: { "Content-Disposition": 'attachment; filename="proof-observation.json"' },
  });
}
