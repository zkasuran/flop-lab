// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import { z } from "zod";
import { createSuite, listTools, type ToolDefinition } from "../src/index";
import { examples } from "../src/examples";
import { envelope } from "../src/schema";

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

describe("stdio MCP contract", () => {
  const client = new Client({ name: "flop-lab-test", version: "1" });
  let transport: StdioClientTransport;
  let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];
  let stderr = "";
  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: process.env.FLOP_MCP_TEST_BUILT
        ? ["dist/cli.js", "--recorded"]
        : ["--import", "tsx", "src/cli.ts", "--recorded"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    await client.connect(transport);
    tools = (await client.listTools()).tools;
  });
  afterAll(async () => {
    await client.close();
    expect(stderr).toBe("");
  });

  it("lists exactly the implemented tools with strict schemas", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(examples).sort());
    expect(tools).toEqual(listTools().tools);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema?.additionalProperties).toBe(false);
      ajv.compile(tool.inputSchema);
      ajv.compile(tool.outputSchema!);
    }
  });

  for (const [name, args] of Object.entries(examples)) {
    it(`calls ${name} and validates its declared output`, async () => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      const validate = ajv.compile(tools.find((t) => t.name === name)!.outputSchema!);
      expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
      const output = result.structuredContent as Record<string, unknown>;
      expect(output.tool).toBe(name);
      expect(output.requests).toBe(0);
      expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toEqual(output);
      if (name !== "lab_spendguard_evaluate") expect(output.mode).toBe("recorded");
    });
  }

  it("rejects unknown tools and extra inputs without execution", async () => {
    await expect(client.callTool({ name: "lab_shell", arguments: {} })).rejects.toThrow();
    await expect(
      client.callTool({ name: "lab_verify_tape", arguments: { mode: "recorded", limit: 100000 } }),
    ).rejects.toThrow();
    await expect(client.callTool({ name: "lab_doctor", arguments: { command: "touch /tmp/no" } })).rejects.toThrow();
  });
});

describe("admission and result validation", () => {
  it("fails closed on a malformed or extended output", async () => {
    const malformed: ToolDefinition = {
      name: "bad",
      description: "test",
      input: z.strictObject({}),
      output: envelope(z.strictObject({ value: z.number() })),
      run: async () => ({
        mode: "recorded",
        evidence: [{ source: "fixture", measuredAt: "2026-11-05T00:00:00.000Z" }],
        limitations: ["fixture"],
        data: { value: 1, undeclared: true },
      }),
    };
    await expect(createSuite({ definitions: [malformed] }).call("bad")).rejects.toThrow();
  });
  it("denies a request above the supplied budget", async () => {
    const r = await createSuite({ recorded: true }).call("lab_spendguard_evaluate", examples.lab_spendguard_evaluate);
    expect(r.data).toMatchObject({ decision: "deny" });
  });
  it("never routes an expired recorded quote as a live admission", async () => {
    const r = await createSuite({ recorded: true }).call("lab_score_route", examples.lab_score_route);
    expect(r.data).toMatchObject({ status: "no-eligible-miner", miner: null });
  });
  it("preserves evidence dates on cache hits and expires the cache", async () => {
    let now = Date.now();
    const suite = createSuite({ recorded: true, now: () => now });
    const first = await suite.call("lab_verify_tape", { limit: 1 });
    const second = await suite.call("lab_verify_tape", { limit: 1 });
    expect(second.cacheHit).toBe(true);
    expect(second.evidence).toEqual(first.evidence);
    now += 30001;
    expect((await suite.call("lab_verify_tape", { limit: 1 })).cacheHit).toBe(false);
  });
  it("does not substitute a recorded entity for another identifier", async () => {
    await expect(createSuite({ recorded: true }).call("lab_explorer_lookup", { query: "block:1" })).rejects.toThrow(
      "outside",
    );
  });
});
