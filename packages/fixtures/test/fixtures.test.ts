// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readFixture, writeFixture } from "../src/index";

const roots: string[] = [];
const meta = {
  source: "https://api.flop.network/v1/models",
  measuredAt: "2026-11-06T05:23:46.897Z",
  httpStatus: 200,
  contentType: "application/json",
};
function temporary() {
  const root = mkdtempSync(join(tmpdir(), "flop-fixtures-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

it("shares exact recorded bodies without merging observations", () => {
  const first = readFixture("status-2026-11-06T05-23-46.400Z-mcp");
  const second = readFixture("status-2026-11-06T05-29-43.883Z-mcp");
  expect(first.sha256).toBe(second.sha256);
  expect(first.measuredAt).not.toBe(second.measuredAt);
  expect(first.source).toBe("https://mcp.flop.network/mcp");
  expect(first.body).toContain('"protocolVersion":"2024-11-05"');
});
it("verifies every bundled observation", () => {
  const records = readdirSync(new URL("../records/", import.meta.url));
  expect(records.length).toBeGreaterThan(0);
  for (const record of records) expect(readFixture(record.replace(/\.json$/, "")).bytes).toBeGreaterThanOrEqual(0);
});
it("deduplicates bodies and preserves empty and Unicode text exactly", () => {
  const root = temporary();
  for (const body of ["", `a${String.fromCharCode(0x2014)}b\r\n`]) {
    const id = body ? "unicode" : "empty";
    writeFixture(id, meta, body, root);
    writeFixture(`${id}-again`, { ...meta, measuredAt: "2026-11-06T06:00:00.000Z" }, body, root);
    expect(readFixture(id, root).body).toBe(body);
  }
  expect(readdirSync(join(root, "bodies"))).toHaveLength(2);
  expect(() => writeFixture("empty", meta, "", root)).toThrow();
});
it("rejects body tampering, changed byte counts and unsafe references", () => {
  const root = temporary();
  writeFixture("test", meta, "real", root);
  const original = readFixture("test", root);
  const path = join(root, "bodies", `${original.sha256}.json`);
  writeFileSync(path, JSON.stringify("fake"));
  expect(() => readFixture("test", root)).toThrow("mismatch");
  writeFileSync(path, JSON.stringify("real"));
  const recordPath = join(root, "records", "test.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
  writeFileSync(recordPath, JSON.stringify({ ...record, bytes: 0 }));
  expect(() => readFixture("test", root)).toThrow("mismatch");
  writeFileSync(recordPath, JSON.stringify({ ...record, sha256: "../../etc/passwd" }));
  expect(() => readFixture("test", root)).toThrow("reference");
});
it("rejects invalid metadata, oversized input and path traversal", () => {
  const root = temporary();
  for (const id of ["../test", "", "a/b"]) expect(() => readFixture(id, root)).toThrow("id");
  for (const changed of [{ measuredAt: "yesterday" }, { source: "file:///etc/passwd" }, { httpStatus: 600 }]) {
    expect(() => writeFixture("test", { ...meta, ...changed }, "", root)).toThrow();
  }
  expect(() => writeFixture("test", meta, "x".repeat(200_000), root)).toThrow("limit");
});
