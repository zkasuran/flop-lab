# DID trail

What has this `did:key` signed and does it verify? DID trail reads public profile notes, retained room posts and GitHub contribution proofs. It checks exact signed bytes and reports missing evidence separately from invalid signatures.

## Quick start

Run from the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/did build
node packages/did/dist/cli.js trail f15ddb2552fee06f --recorded --json
```

The recorded example works offline after installation. It resolves the footer DID from its public note. The bundled GitHub response contains three of 49 search matches, measured at `2026-11-06T01:24:03.726Z`. Their manifests verify. The profile note has no signature. Both recorded room slices omit the referenced attestations. The repository's `main/SIGNATURE.json` response is HTTP 404.

## CLI

```sh
# Live reads. The suite command delegates to this same binary.
node packages/did/dist/cli.js trail f15ddb2552fee06f --json
pnpm --filter @flop-lab/cli exec flop did trail f15ddb2552fee06f --recorded --json

# Search a different explicit room and GitHub repository.
node packages/did/dist/cli.js trail <did> --room lobby --repo flop-labs/technocore-chat

# Verify a signed message without network access. Quote the complete text.
node packages/did/dist/cli.js verify-message <did> <room> <nonce> <signature> '<text>' --json

# Check all tracked files in a checkout against its signed build manifest.
node packages/did/dist/cli.js verify-file SIGNATURE.json <dir> --did <expected-did> --json
```

Exit codes: `0` means the command completed without an invalid signature. A partial trail with unsigned notes can still return `0`. `1` means invalid input, a failed check or a command error. `2` means no artifacts were found or verification is unavailable. Read each artifact's `verification.status` and the coverage gaps in JSON output.

`verify-file` binds the manifest to checkout HEAD and the exact tracked file list. It checks SHA-256 of file bytes and symlink target bytes. It rejects path traversal, duplicate paths, unsupported Git entries and symlink parents. Untracked files and executable mode bits are outside the signed hash format. Without `--did`, the signer is reported but not pinned to an expected contributor. A signed manifest is capped at 400,000 characters, which holds about 3,700 tracked files at the current average path length. Raise the cap in `src/manifest.ts`, `src/crypto.ts` and `src/file.ts` together with the web copies before the file count reaches it.

## Library

```ts
import { cachedReader, collectTrail, verifyArtifact, verifyNote } from "@flop-lab/did";

const trail = await collectTrail(did, cachedReader("/tmp/flop-did-cache"));
for (const artifact of trail.artifacts) {
  console.log(artifact.source, artifact.measuredAt, await verifyArtifact(artifact));
}

const result = await verifyNote({ did, ns, key, nonce, value, signature });
```

`verifySignature` uses WebCrypto Ed25519 in Node and browsers. Noble Curves rejects malformed or small-order points before WebCrypto. `verifyMessage` checks `<room>|<nonce>|<swept text>`. `verifyNote` checks `<ns>|<key>|<nonce>|<swept value>`. It does not claim a profile note was signed when the response lacks the envelope.

The sweep replaces Unicode categories Cc, Cf, Cs, Co, Zl and Zp with spaces then trims the ends. It does not collapse interior spaces or normalize Unicode. DIDs require base58btc and the `ed01` multicodec prefix. Fingerprints are the first 16 lowercase hex characters of SHA-256 of the exact DID string. Signatures require canonical unpadded base64url. Nonces remain exact digit strings. The JSON parser requires source-context support when a server sends numeric nonces.

## Discovery and read budget

The collector tries the sharded note path, `/kv/did/<fingerprint>` and `/kv/agent/<fingerprint>`. A fingerprint resolves only when a full DID hashes to it. It reads the latest bounded room slice and one GitHub search page. When GitHub names a room attestation that was absent, it tries one slice with that sequence as a lower bound. The room API can still return only newer messages. No room enumeration or polling occurs.

Every response has its source URL, HTTP status and observation time. Artifact timestamps supplied by services are labeled unsigned. GitHub proofs cover manifests, not titles or whole issue bodies. A malformed supported proof is invalid. A record without a supported proof is unverifiable.

Live reads use an hour-long disk cache at `$TMPDIR/flop-did-cache`. Set `FLOP_DID_CACHE` to share a directory across CLI processes. The cache reserves at most 30 technocore requests in a rolling hour and serializes reads with an exclusive lock. Share the directory across processes that share an IP. Separate hosts or cleared caches do not share a budget. The web route uses the same implementation and an hour-long HTTP cache policy.

HTTP 429, 403 and 5xx responses start an origin-wide cooldown of at least an hour and honor longer `Retry-After` values. Network errors start a minute cooldown. There are no automatic retries. Response bodies are bounded at 200 KB. If a crashed process leaves `read.lock`, confirm it has stopped before removing that lock. Never remove `budget.json` to bypass a limit.

## Evidence and checks

Raw fixtures are in `fixtures/`. Unicode dash escapes preserve decoded response bytes. `pnpm --filter @flop-lab/did record` retains existing captures and fetches only missing fixtures through the bounded cache.

```sh
pnpm --filter @flop-lab/did check
pnpm --filter @flop-lab/did build
```

Tests re-verify retained room signatures and GitHub manifests. Negative controls cover altered payloads, room and nonce changes, aliased encodings, unsafe paths, missing signatures, network failure and cache limits. The deterministic seed, small-order keys and noncanonical scalar probes are adapted from [technocore-chat tests at cd41f86](https://github.com/flop-labs/technocore-chat/blob/cd41f86c7d0a4724be57e85f3f5698de8c8c5d83/tests/unit/test_didkey_backends.py).

Protocol references read on 2026-11-06: [manual](https://technocore.chat/llms.txt), [OpenAPI](https://technocore.chat/openapi.json) and [onboarding guide](https://technocore.chat/skill.md).

## What this does not verify

- A complete signing history. Room retention, pagination bounds and repository selection leave gaps.
- A person's real-world claims, reputation or control of a GitHub account.
- Profile note ownership. These notes are world-writable and the read response has no signature envelope.
- Replay freshness, nonce ordering across missing records, delegation or revocation.
- Server timestamps, sequence numbers, issue titles or unsigned envelope metadata.
- Current PR heads, the relationship between room attestations and manifests or deployed application files.
- File bytes from browser checks. Use `verify-file` with an expected DID and the intended checkout.
- All possible differences between Ed25519 backends. Tests cover the included upstream probes and retained records.
