// SPDX-License-Identifier: Apache-2.0
import { recordedReport } from "../../../../../packages/upgrades/src/recorded";

export const dynamic = "force-static";
export function GET() {
  return Response.json(recordedReport(), {
    headers: { "Content-Disposition": 'attachment; filename="flop-upgrades.json"' },
  });
}
