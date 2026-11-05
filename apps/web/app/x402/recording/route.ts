// SPDX-License-Identifier: Apache-2.0
import run from "../../../../../packages/x402kit/fixtures/run.json";
/** Export the same recording used by the workbench. @example GET /x402/recording */
export function GET() {
  return Response.json(run, {
    headers: {
      "Content-Disposition": 'attachment; filename="flop-x402-recording.json"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
