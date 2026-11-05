// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parseSse } from "../src/sse";

describe("parseSse", () => {
  it("reads one event", () => {
    expect(parseSse('event: message\ndata: {"a":1}\n\n')).toEqual([{ event: "message", data: '{"a":1}' }]);
  });
  it("joins multiple data lines and handles CRLF", () => {
    expect(parseSse("data: a\r\ndata: b\r\n\r\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });
  it("ignores comments and blocks without data", () => {
    expect(parseSse(": ping\n\nevent: x\n\ndata: y\n\n")).toEqual([{ event: "message", data: "y" }]);
  });
  it("returns nothing for an empty or non-SSE body", () => {
    expect(parseSse("")).toEqual([]);
    expect(parseSse("{}")).toEqual([]);
  });
});
