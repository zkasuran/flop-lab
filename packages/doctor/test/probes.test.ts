// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { collect, command } from "../src/probes.js";

const mock = vi.hoisted(() => ({ run: vi.fn(), read: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mock.run }));
vi.mock("node:fs/promises", () => ({ readFile: mock.read }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function localFixtures() {
  mock.run.mockImplementation(
    (
      file: string,
      args: string[],
      options: { timeout: number; maxBuffer: number; env: { LC_ALL: string } },
      callback: (error: unknown, stdout: string) => void,
    ) => {
      expect(options.timeout).toBe(5000);
      expect(options.maxBuffer).toBe(65536);
      expect(options.env.LC_ALL).toBe("C");
      const raw =
        file === "nvidia-smi"
          ? "NVIDIA A40, 46068, 45000"
          : file === "df"
            ? "size avail\n100000000000 1000000000"
            : file === "nproc"
              ? "8"
              : args[0] === "image"
                ? "[]"
                : "28.0.1";
      callback(null, raw);
    },
  );
  mock.read.mockResolvedValue("MemTotal: 64000000 kB\nMemAvailable: 32000000 kB\n");
}

describe("bounded collector", () => {
  it("skips network explicitly and avoids unrequested image inspection", async () => {
    localFixtures();
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const result = await collect({ role: "miner", offline: true, skipPorts: true });
    expect(result.requests).toBe(0);
    expect(network).not.toHaveBeenCalled();
    expect(result.inventory.models.reason).toContain("Offline");
    expect(mock.run.mock.calls.some((call) => call[1][0] === "image")).toBe(false);
  });
  it("degrades missing commands and denied files without leaking stderr or paths", async () => {
    mock.run.mockImplementation((_f: string, _a: string[], _o: unknown, cb: (e: unknown, raw: string) => void) =>
      cb({ code: "ENOENT", message: "private-host at /home/operator" }, ""),
    );
    mock.read.mockRejectedValue(new Error("private-host"));
    const { inventory } = await collect({ role: "validator", offline: true, skipPorts: true });
    expect(inventory.gpu.value).toBeNull();
    expect(inventory.gpu.reason).toContain("ENOENT");
    expect(inventory.memory.value).toBeNull();
    expect(JSON.stringify(inventory)).not.toContain("private-host");
  });
  it("makes only two requests and reports 429 backoff without a retry", async () => {
    localFixtures();
    const network = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 429, headers: { "retry-after": "60" } }));
    vi.stubGlobal("fetch", network);
    const result = await collect({ role: "miner", skipPorts: true });
    expect(network).toHaveBeenCalledTimes(2);
    expect(result.inventory.clocks[0]?.reason).toContain("Wait at least 60 seconds");
    expect(result.inventory.models.value).toBeNull();
  });
  it("validates network bodies independently from Date and rejects oversized data", async () => {
    localFixtures();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async () => new Response("x".repeat(65537), { headers: { date: new Date().toUTCString() } }),
        ),
    );
    const result = await collect({ role: "miner", skipPorts: true });
    expect(result.inventory.models.value).toBeNull();
  });
  it("passes filesystem paths as a literal argument and rejects unpinned image without executing it", async () => {
    localFixtures();
    const path = "/tmp/with spaces;touch file";
    const result = await collect({
      role: "miner",
      offline: true,
      skipPorts: true,
      diskPath: path,
      images: { worker: "repo:latest" },
    });
    expect(mock.run.mock.calls.find((call) => call[0] === "df")?.[1]).toEqual([
      "-B1",
      "--output=size,avail",
      "--",
      path,
    ]);
    expect(result.inventory.images.worker?.value?.pinned).toBe(false);
    expect(JSON.stringify(result)).not.toContain(path);
  });
  it("propagates command timeout to the collector without returning partial data", async () => {
    mock.run.mockImplementation((_f: string, _a: string[], _o: unknown, cb: (e: unknown, raw: string) => void) =>
      cb({ killed: true }, "partial"),
    );
    await expect(command("nproc", [])).rejects.toEqual({ killed: true });
  });
});
