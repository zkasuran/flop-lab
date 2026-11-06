// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import seed from "../../recorder/test/fixtures/seed/snapshots/2026/11/05/21-24-20.273Z-bbf22ec5d76af626e448d855803f2e3eb1d3bd41444ce393a2927592b25c7f57.json";
import { loadPriceHistory, pricePoints } from "../src/history";

it("extracts dated model quotes from recorder data and rejects altered snapshots", async () => {
  const points = await pricePoints([seed, seed]);
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({
    model: "Qwen/Qwen2.5-0.5B-Instruct",
    prompt: "0.006",
    snapshotId: seed.id,
    measuredAt: seed.observations.models.measuredAt,
  });
  await expect(pricePoints([{ ...seed, requests: 1 }])).rejects.toThrow("hash mismatch");
});

it("does not manufacture history when the data branch is absent", async () => {
  const history = await loadPriceHistory(async () => new Response("missing", { status: 404 }));
  expect(history.points).toEqual([]);
  expect(history.errors).toEqual([]);
});
