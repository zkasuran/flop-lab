// SPDX-License-Identifier: Apache-2.0
import { pageHistory } from "../data";
export async function GET() {
  const history = await pageHistory();
  return new Response(history.runs.map((run) => JSON.stringify(run)).join("\n") + "\n", {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "public, max-age=300",
      "X-Status-Source": history.mode,
    },
  });
}
