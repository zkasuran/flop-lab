// SPDX-License-Identifier: Apache-2.0
import { recordedSnapshot } from "../../../../../packages/metering/src/recorded";
export const dynamic = "force-static";
export function GET() {
  return Response.json(recordedSnapshot, {
    headers: { "Content-Disposition": 'attachment; filename="metering-recording.json"' },
  });
}
