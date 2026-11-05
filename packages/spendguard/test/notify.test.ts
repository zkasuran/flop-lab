// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { webhook } from "../src/notify";
it("sends generic JSON with bounded retry on transient failures", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("busy", { status: 429 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValue(new Response("ok"));
  const promise = webhook(
    "https://example.test/alerts",
    fetcher,
  )({ type: "deny", source: "test", measuredAt: new Date(0).toISOString(), details: {} });
  await vi.runAllTimersAsync();
  await promise;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
  vi.useRealTimers();
});
it("does not retry client errors or insecure destinations", async () => {
  expect(() => webhook("http://example.test")).toThrow();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 400 }));
  await expect(
    webhook(
      "https://example.test",
      fetcher,
    )({ type: "deny", source: "test", measuredAt: new Date(0).toISOString(), details: {} }),
  ).rejects.toThrow("400");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
