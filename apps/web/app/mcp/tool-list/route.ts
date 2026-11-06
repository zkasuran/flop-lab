// SPDX-License-Identifier: Apache-2.0
import list from "../tool-list.json";
export function GET() {
  return Response.json(list, {
    headers: { "Cache-Control": "public, max-age=300", "Content-Disposition": "inline; filename=flop-lab-tools.json" },
  });
}
