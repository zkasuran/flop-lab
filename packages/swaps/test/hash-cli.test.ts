// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import { generateHashLock, normalizeHashLock } from "../src/hash";

it("generates random local preimages and hashes their raw bytes without network access", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not call"));
  try {
    const a = await generateHashLock(),
      b = await generateHashLock();
    expect(a.preimage).toMatch(/^[a-f0-9]{64}$/);
    expect(a.hashLock).toMatch(/^[a-f0-9]{64}$/);
    expect(a.preimage).not.toBe(b.preimage);
    expect(a.hashLock).toBe(createHash("sha256").update(Buffer.from(a.preimage, "hex")).digest("hex"));
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
it("validates hash locks without trimming or accepting ambiguous lengths", () => {
  expect(normalizeHashLock("0x" + "AA".repeat(32))).toBe("aa".repeat(32));
  for (const value of ["", "aa".repeat(31), "gg".repeat(32), " " + "aa".repeat(32)])
    expect(() => normalizeHashLock(value)).toThrow();
});
const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
it("CLI reports failures, missing assumptions and malformed flags with distinct exit codes", () => {
  const args = ["plan", "--flop-blocks", "7200", "--other-blocks", "6", "--other-block-ms", "600000"];
  const unknown = cli(...args);
  expect(unknown.status).toBe(2);
  expect(JSON.parse(unknown.stdout).status).toBe("UNKNOWN");
  const pass = cli(...args, "--lag", "0", "--refund-head", "finalized", "--counter-refund-first");
  expect(pass.status).toBe(0);
  const fail = cli(...args, "--lag", "120");
  expect(fail.status).toBe(1);
  expect(cli("generate", "--preimage", "bad").status).toBe(2);
  expect(cli("observe", "--recorded").status).toBe(0);
  expect(cli("--help").stdout).toContain("No wallets or transactions");
});
