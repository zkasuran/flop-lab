// SPDX-License-Identifier: Apache-2.0
import recorded from "../../../../../packages/models/test/fixtures/devnet.json";
export function GET() {
  return Response.json(recorded, {
    headers: { "Content-Disposition": "attachment; filename=flop-models-recording.json" },
  });
}
