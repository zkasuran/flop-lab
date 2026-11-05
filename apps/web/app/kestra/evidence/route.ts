// SPDX-License-Identifier: Apache-2.0
import observed from "../observed.json";

export function GET() {
  return Response.json(observed, { headers: { "Cache-Control": "public, max-age=3600" } });
}
