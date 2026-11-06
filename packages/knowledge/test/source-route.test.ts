// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { GET } from "../../../apps/web/app/knowledge/data/route";
import { recordedManifest, replay } from "../src/recorded";

it("serves exact concept text without fetching public sources", async () => {
  const response = GET(new Request("http://localhost/knowledge/data?concept=overview"));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.raw).toBe(replay("get", "overview").raw);
  expect(body.source).toBe("https://mcp.flop.network/mcp");
  expect(body.kind).toBe("Full concept tool response");
});

it("labels manifest excerpts and preserves fields not in the advertised schema", async () => {
  const response = GET(new Request("http://localhost/knowledge/data?concept=CONTRIBUTING"));
  const body = await response.json();
  expect(body.kind).toContain("Full concept text is not recorded");
  expect(JSON.parse(body.raw)).toMatchObject({ id: "CONTRIBUTING", generated_by: "tools/knowledge-catalog/build.mjs" });
  expect(body.measuredAt).toBe(recordedManifest().measuredAt);
});

it("does not turn an unknown path or URL into a network request", async () => {
  expect(GET(new Request("http://localhost/knowledge/data?concept=https://example.org")).status).toBe(404);
  expect(GET(new Request("http://localhost/knowledge/data?concept=../../outside")).status).toBe(404);
  expect(GET(new Request("http://localhost/knowledge/data?concept=")).status).toBe(400);
  const response = GET(new Request("http://localhost/knowledge/data"));
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect((await response.json()).manifest.encoding).toBe("gzip-base64");
});
