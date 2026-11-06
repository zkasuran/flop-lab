// SPDX-License-Identifier: Apache-2.0
import { recordedObservation } from "../../../../../packages/economics/src/recorded";
export function GET() {
  try {
    return Response.json(recordedObservation(), {
      headers: { "Content-Disposition": 'attachment; filename="economics-observation.json"' },
    });
  } catch {
    return Response.json({ error: "Recording unavailable" }, { status: 503 });
  }
}
