// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/economics/recording/route";
import * as recording from "../../../packages/economics/src/recorded";
import { compare } from "../../../packages/economics/src/compare";
import { parseObservation } from "../../../packages/economics/src/observe";

afterEach(() => vi.restoreAllMocks());

describe("economics evidence download", () => {
  it("serves replayable raw evidence with its source and date", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="economics-observation.json"');
    const observation = parseObservation(await response.json());
    expect(observation.source).toBe("https://mcp.flop.network/mcp");
    expect(observation.measuredAt).toBe("2026-11-06T00:30:20.924Z");
    expect(observation.data.stats?.latestBlockNumber).toBe(3001897);
    expect(compare(observation).counts).toEqual({ MATCH: 20, DRIFT: 20, UNOBSERVABLE: 30 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails explicitly when the bundled evidence cannot be validated", async () => {
    vi.spyOn(recording, "recordedObservation").mockImplementation(() => {
      throw new Error("corrupt fixture");
    });
    const response = GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Recording unavailable" });
    expect(response.headers.has("content-disposition")).toBe(false);
  });
});
