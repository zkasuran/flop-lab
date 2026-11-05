// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { collectSnapshot } from "../../../apps/web/app/scoreboard/collect";

describe("site collection deadline", () => {
  it("aborts a stalled transport and does not start another request", async () => {
    let calls = 0;
    let aborted = false;
    await expect(
      collectSnapshot(async (_url, init) => {
        calls++;
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(init!.signal!.reason);
            },
            { once: true },
          );
        });
      }, 20),
    ).rejects.toThrow();
    expect(aborted).toBe(true);
    expect(calls).toBe(1);
  });

  it("cancels a Retry-After wait as well as the transport", async () => {
    let calls = 0;
    await expect(
      collectSnapshot(async () => {
        calls++;
        return new Response("busy", { status: 429, headers: { "retry-after": "30" } });
      }, 20),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
