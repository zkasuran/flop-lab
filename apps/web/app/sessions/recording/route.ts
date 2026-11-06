// SPDX-License-Identifier: Apache-2.0
import { report } from "../data";
export function GET() {
  return Response.json(report, {
    headers: {
      "Content-Disposition": 'attachment; filename="session-lifecycle.json"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
