// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { writeFile, readdir, stat } from "node:fs/promises";
const path = new URL("../dist/cli.js", import.meta.url).href;
const runs = [["--help"], ["list", "--json"], ["history", "--json"]].map((args) => {
  const code = `let requests=0; globalThis.fetch=async()=>{requests++;throw new Error('Unexpected network call')}; process.on('exit',()=>console.error(JSON.stringify({requests}))); process.argv=['node',${JSON.stringify(path)},...${JSON.stringify(args)}]; await import(${JSON.stringify(path)});`;
  const start = performance.now();
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  const durationMs = performance.now() - start;
  if (result.status !== 0) throw new Error(result.stderr);
  return {
    args,
    durationMs,
    ...(JSON.parse(result.stderr.trim()) as { requests: number }),
    outputBytes: Buffer.byteLength(result.stdout),
  };
});
const dir = new URL("../fixtures/", import.meta.url);
const sizes = await Promise.all(
  (await readdir(dir)).map(async (name) => ({ name, bytes: (await stat(new URL(name, dir))).size })),
);
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  source: "Fresh local Node processes using the built flop-proofs CLI",
  runs,
  largestFixture: sizes.sort((a, b) => b.bytes - a.bytes)[0],
};
console.log(JSON.stringify(report, null, 2));
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
