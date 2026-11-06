// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { createMockService, runMockClient } from "../src/reference.js";
import { sdkTrace } from "./sdk-trace.js";

const server = serve({ fetch: createMockService().fetch, hostname: "127.0.0.1", port: 3592 });
try {
  const result = await runMockClient("http://127.0.0.1:3592/paid");
  if (result.error || result.report.outcome !== "no-deviations") throw new Error(JSON.stringify(result));
  await writeFile(
    new URL("../fixtures/handshake.json", import.meta.url),
    `${JSON.stringify(result.exchange, null, 2)}\n`,
  );
  const sdk = { direct: await sdkTrace("function"), wrapped: await sdkTrace("class") };
  await writeFile(new URL("../fixtures/sdk-handshake.json", import.meta.url), `${JSON.stringify(sdk, null, 2)}\n`);
  console.log(
    JSON.stringify({
      measuredAt: result.exchange.measuredAt,
      source: result.exchange.source,
      requests: result.report.requestCount,
      sdkDirect: sdk.direct.status,
      sdkWrapped: sdk.wrapped.status,
    }),
  );
} finally {
  server.close();
}
