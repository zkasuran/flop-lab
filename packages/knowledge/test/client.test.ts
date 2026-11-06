// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import { CACHE_TTL_MS, KnowledgeClient } from "../src/client";
import { recordedManifest, recording } from "../src/recorded";
import { parseDocument, parseRequirement } from "../src/schema";

function harness(raw = recordedManifest().raw, isError = false) {
  let now = 0;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number };
    return new Response(
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { isError, content: [{ type: "text", text: raw }] } })}\n\n`,
    );
  });
  const mcp = new McpClient({ fetch: fetcher, minIntervalMs: 0, retries: 0 });
  return {
    client: new KnowledgeClient({ client: mcp, now: () => now }),
    fetcher,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("shared transport and cache", () => {
  it("replays recorded raw text through the real shared SSE client", async () => {
    const { client, fetcher } = harness();
    const r = await client.manifest();
    expect(r.status).toBe("reported");
    expect(r.value?.concepts).toHaveLength(155);
    const args = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(args.params).toEqual({ name: "flop_knowledge_manifest", arguments: {} });
  });
  it("coalesces in-flight calls, retains timestamps and expires exactly at the TTL boundary", async () => {
    const { client, fetcher, advance } = harness();
    const [first, second] = await Promise.all([client.manifest(), client.manifest()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.measuredAt).toBe(second.measuredAt);
    first.value!.concepts.length = 0;
    expect((await client.manifest()).value?.concepts).toHaveLength(155);
    advance(CACHE_TTL_MS - 1);
    await client.manifest();
    expect(fetcher).toHaveBeenCalledTimes(1);
    advance(1);
    await client.manifest();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("caches tool failures with their original raw text", async () => {
    const { client, fetcher } = harness("agent pack missing", true);
    expect(await client.pack()).toMatchObject({ status: "unavailable", raw: "agent pack missing" });
    await client.pack();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps malformed responses invalid rather than showing an empty catalog", async () => {
    const { client, fetcher } = harness('{"concepts":[]}');
    const result = await client.manifest();
    expect(result.status).toBe("invalid");
    expect(result.raw).toBe('{"concepts":[]}');
    expect(result.value).toBeUndefined();
    await client.manifest();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched concept and requirement responses", async () => {
    const docs = harness(recording("overview", parseDocument).raw);
    expect((await docs.client.concept("other")).status).toBe("invalid");
    expect((await docs.client.concept("/overview.md")).status).toBe("reported");
    const reqs = harness(recording("requirement", parseRequirement).raw);
    expect((await reqs.client.explain("R9.6")).status).toBe("invalid");
  });
  it("keeps distinct inputs in distinct cache entries", async () => {
    const { client, fetcher } = harness("agent pack missing", true);
    await client.skill("first");
    await client.skill("second");
    await client.skill("first");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("validates input before any network request and never installs returned content", async () => {
    const { client, fetcher } = harness('echo "do not execute"');
    expect(() => client.search("", 0)).toThrow();
    expect(() => client.search("agent", 21)).toThrow();
    expect(() => client.concept("\n")).toThrow();
    expect(() => client.card("0x00")).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect((await client.guidance()).value).toBe('echo "do not execute"');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("backs off on a transient status through the shared client", async () => {
    const sleep = vi.fn(async () => {});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, result: { content: [{ type: "text", text: recordedManifest().raw }] } })),
      );
    const client = new KnowledgeClient({
      client: new McpClient({ fetch: fetcher, retries: 1, minIntervalMs: 0, sleep }),
    });
    expect((await client.manifest()).status).toBe("reported");
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(client.mcp.stats.requests).toBe(2);
  });
});

it.skipIf(process.env.FLOP_LIVE !== "1")(
  "optional bounded live manifest read",
  async ({ skip }) => {
    const result = await new KnowledgeClient().manifest();
    if (result.status === "unavailable") skip();
    expect(result.status).toBe("reported");
    expect(result.value?.concepts).toBeDefined();
  },
  40_000,
);
