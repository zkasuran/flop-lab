#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cachedReader } from "./reader.js";
import { recordedReader } from "./recorded.js";
import { collectTrail, verifyArtifact } from "./trail.js";
import { verifyMessage } from "./crypto.js";
import { verifyFile } from "./file.js";

const help = `flop-did trail <did|fingerprint> [--json] [--recorded] [--room technocore] [--repo zkasuran/flop-lab]
flop-did verify-message <did> <room> <nonce> <signature> <text> [--json]
flop-did verify-file SIGNATURE.json <dir> [--did expected-did] [--json]

Live reads use an hour cache. Set FLOP_DID_CACHE to share a cache directory.
Trail discovery is partial. A signature covers bytes, not trust or completeness.`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      recorded: { type: "boolean" },
      room: { type: "string" },
      repo: { type: "string" },
      did: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...args] = positionals;
  if (values.help || !command) console.log(help);
  else if (command === "trail" && args.length === 1) {
    if (values.did) throw new Error("--did belongs to verify-file");
    const trail = await collectTrail(
      args[0]!,
      values.recorded ? recordedReader : cachedReader(process.env.FLOP_DID_CACHE ?? join(tmpdir(), "flop-did-cache")),
      { room: values.room, repo: values.repo },
    );
    const results = await Promise.all(
      trail.artifacts.map(async (artifact) => ({ ...artifact, verification: await verifyArtifact(artifact) })),
    );
    if (values.json) console.log(JSON.stringify({ ...trail, artifacts: results }, null, 2));
    else {
      console.log(
        `DID trail: ${trail.did ?? "unresolved"}\nFingerprint: ${trail.fingerprint}\nSearch: ${trail.searchedAt}`,
      );
      if (!results.length) console.log("No artifacts found in the requested sources.");
      for (const item of results)
        console.log(
          `\n${item.verification.status.toUpperCase()} ${item.title}\n${item.verification.reason}\n${item.source}\nObserved: ${item.measuredAt}\n${item.content}`,
        );
      for (const gap of trail.gaps) console.log(`\nCoverage: ${gap}`);
    }
    if (results.some((item) => item.verification.status === "invalid")) process.exitCode = 1;
    else if (!results.length) process.exitCode = 2;
  } else if (command === "verify-message" && args.length === 5) {
    if (values.recorded || values.room || values.repo || values.did)
      throw new Error("Unsupported verify-message option");
    const verdict = await verifyMessage({
      did: args[0]!,
      room: args[1]!,
      nonce: args[2]!,
      signature: args[3]!,
      text: args[4]!,
    });
    console.log(values.json ? JSON.stringify(verdict) : `${verdict.status.toUpperCase()}: ${verdict.reason}`);
    if (verdict.status !== "verified") process.exitCode = verdict.status === "invalid" ? 1 : 2;
  } else if (command === "verify-file" && args.length === 2) {
    if (values.recorded || values.room || values.repo) throw new Error("Unsupported verify-file option");
    const result = await verifyFile(args[0]!, args[1]!, values.did);
    console.log(
      values.json
        ? JSON.stringify(result)
        : `VERIFIED: ${result.files} tracked files at ${result.commit}\nSigner: ${result.did}\nObserved: ${result.measuredAt}\nSource: ${result.source}`,
    );
  } else throw new Error(help);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
