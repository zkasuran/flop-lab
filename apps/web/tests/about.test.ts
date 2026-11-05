// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { readStory } from "../app/about/recording";
import captured from "../app/about/pull-request.json";
import { extractProof, verifyContribution } from "../lib/provenance";
import { parseManifest } from "../lib/did";

it("verifies the captured merged contribution and rejects a changed signed byte", async () => {
  const story = readStory();
  expect(story).not.toBeNull();
  expect(story!.pr.number).toBe(8);
  expect(parseManifest(extractProof(story!.pr.body).manifest).files.length).toBeGreaterThan(0);
  expect((await verifyContribution(story!.pr)).valid).toBe(true);
  expect((await verifyContribution(story!.pr, true)).valid).toBe(false);
  expect((await verifyContribution({ ...story!.pr, head: { ...story!.pr.head, sha: "a".repeat(40) } })).valid).toBe(
    false,
  );
});

it("does not present closed, unmerged or missing records as a completed merge", () => {
  const raw: Record<string, unknown> = JSON.parse(captured.raw);
  for (const patch of [{ merged: false }, { merged_at: null }, { merged_by: null }, { merge_commit_sha: "bad" }]) {
    expect(readStory({ ...captured, raw: JSON.stringify({ ...raw, ...patch }) })).toBeNull();
  }
  for (const input of [null, {}, { ...captured, raw: "{" }, { ...captured, source: "https://example.com" }]) {
    expect(readStory(input)).toBeNull();
  }
});
