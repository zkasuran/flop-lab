// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { readHistory } from "../src/remote";
import { recordings } from "../src/recorded";

it("uses the archive without mixing in fixture samples", async () => {
  const result = await readHistory(recordings, async () => new Response(JSON.stringify(recordings[1]) + "\n"));
  expect(result.mode).toBe("data-branch");
  expect(result.runs).toHaveLength(1);
  expect(result.runs[0]).toEqual(recordings[1]);
});
it("keeps valid empty archives empty", async () => {
  const result = await readHistory(recordings, async () => new Response("\n"));
  expect(result.runs).toEqual([]);
  expect(result.mode).toBe("data-branch");
});
it("falls back with original dates on missing or malformed archives", async () => {
  for (const response of [
    new Response("missing", { status: 404 }),
    new Response("null"),
    new Response("x".repeat(200_000)),
  ]) {
    const result = await readHistory(recordings, async () => response);
    expect(result.mode).toBe("recorded-fixture");
    expect(result.runs).toEqual(recordings);
  }
});
