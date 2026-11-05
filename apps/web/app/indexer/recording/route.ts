// SPDX-License-Identifier: Apache-2.0
import snapshot from "../../../../../packages/indexer-audit/fixtures/devnet.json";

export function GET() {
  return Response.json(snapshot, {
    headers: {
      "Content-Disposition": 'attachment; filename="flop-indexer-snapshot.json"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
