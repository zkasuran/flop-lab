// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parsePolicyText } from "../src/policy";
const yaml = readFileSync(new URL("../examples/policy.yaml", import.meta.url), "utf8");
const json = readFileSync(new URL("../examples/policy.json", import.meta.url), "utf8");
it("reads the same policy from JSON and strict YAML without rounding amounts", () => {
  expect(parsePolicyText(yaml)).toEqual(parsePolicyText(json));
  expect(parsePolicyText(yaml.replace('task: "0.03"', 'task: "0.000000000000000001"')).budgets.task).toBe(
    "0.000000000000000001",
  );
});
it.each([
  `${yaml}\ncooldown: 5`,
  yaml.replace('task: "0.03"', 'task: "0.03"\n  task: "100"'),
  yaml.replace('task: "0.03"', "task: 0.03"),
  yaml.replace("  task:", "\ttask:"),
  yaml.replace("  task:", "    task:"),
  yaml.replace('maxEscrowPerSession: "0.02"', 'maxEscrowPerSession: &limit "0.02"'),
  yaml.replace('maxEscrowPerSession: "0.02"', "maxEscrowPerSession: *limit"),
  yaml.replace('maxEscrowPerSession: "0.02"', "maxEscrowPerSession: !!str 0.02"),
  yaml.replace('maxEscrowPerSession: "0.02"', "maxEscrowPerSession: |"),
])("refuses ambiguous or unsupported YAML", (input) => expect(() => parsePolicyText(input)).toThrow());
it("accepts quoted mapping keys and YAML single-quoted text", () => {
  const input = yaml.replace("modelCaps: {}", "modelCaps:\n  'wallet:transfer': '0.02'");
  expect(parsePolicyText(input).modelCaps["wallet:transfer"]).toBe("0.02");
});
it("refuses block children after an inline value", () => {
  const input = yaml.replace('allowMiners: ["demo-miner"]', 'allowMiners: ["demo-miner"]\n  - another-miner');
  expect(() => parsePolicyText(input)).toThrow();
});
it("bounds text before parsing and rejects empty documents", () => {
  expect(() => parsePolicyText(" ".repeat(65_537))).toThrow();
  expect(() => parsePolicyText("\n".repeat(513))).toThrow();
  expect(() => parsePolicyText("")).toThrow();
});
