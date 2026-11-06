// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { createTools, listTools } from "../src/index";

it("keeps the generated site tool list equal to the server declaration", () => {
  const record = z
    .object({ measuredAt: z.iso.datetime(), source: z.string(), tools: z.array(z.unknown()) })
    .parse(JSON.parse(readFileSync(new URL("../../../apps/web/app/mcp/tool-list.json", import.meta.url), "utf8")));
  expect(record.tools).toEqual(listTools().tools);
});

it("shows an example that satisfies the actual server output schema", () => {
  const record = z
    .object({ result: z.unknown() })
    .parse(JSON.parse(readFileSync(new URL("../../../apps/web/app/mcp/example.json", import.meta.url), "utf8")));
  const schema = createTools().find((tool) => tool.name === "lab_verify_tape")!.output;
  expect(schema.safeParse(record.result).success).toBe(true);
});
