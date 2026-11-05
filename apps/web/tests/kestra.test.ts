// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { observed, observeFlow, recordedRequests, stages, watchFlow } from "../app/kestra/data";

describe("Kestra execution evidence", () => {
  it("copies the installed plugin examples without changing references or task order", () => {
    const example = (name: string) =>
      readFileSync(new URL(`../../../plugins/kestra-flop/examples/${name}.yml`, import.meta.url), "utf8");
    expect(observeFlow).toBe(example("observe"));
    expect(watchFlow).toBe(example("watch"));
  });

  it("keeps partial output separate from the original tape count and total", () => {
    expect(observed.tape.rows.length).toBeLessThan(observed.tape.count);
    expect(observed.tape.count).toBeLessThan(observed.tape.total);
    expect(observed.tape.truncated).toBe(true);
    expect(observed.tape.nextOffset).toBe(observed.tape.count);
    expect(observed.verify.count).toBe(observed.tape.count);
    expect(observed.excerpts.tape).toContain("First row only");
    expect(observed.excerpts.verify).toContain("First result only");
    expect(recordedRequests).toBe(3);
    const row = observed.tape.rows[0]!;
    expect(BigInt(row.minerPaid) + BigInt(row.unusedEscrow) + BigInt(row.burned)).toBe(BigInt(row.escrow));
  });

  it("shows original times and labels the mock and replay as distinct evidence", () => {
    for (const stage of stages) {
      expect(Number.isFinite(Date.parse(stage.measuredAt))).toBe(true);
      expect(stage.source).toMatch(/^(https:\/\/(mcp|api)\.flop\.network\/|http:\/\/127\.0\.0\.1:3370\/)/);
      expect(stage.yaml).toContain(`type: io.kestra.plugin.flop.${stage.type}`);
    }
    expect(stages[4].label).toBe("Controlled cursor replay");
    expect(stages[4].note).toContain("No new settlement arrival was observed");
    expect(stages[5].label).toBe("Local mock only");
    expect(stages[5].yaml).toContain("gatewayUrl: http://127.0.0.1:3370/v1");
    expect(stages[5].note).toContain("Not run against the live gateway");
    expect(observed.excerpts.models).toContain("not the current time");
  });
});
