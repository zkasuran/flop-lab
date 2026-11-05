// SPDX-License-Identifier: Apache-2.0
import { recordedReport } from "../../../../../packages/spec/src/recorded";

export const dynamic = "force-static";

/** Download the same dated evidence shown by the page. @example GET /spec/report */
export function GET() {
  return Response.json(recordedReport(), {
    headers: { "Content-Disposition": 'attachment; filename="flop-spec-recorded.json"' },
  });
}
