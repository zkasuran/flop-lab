# Recorded indexer audit

`devnet.json` is a raw public observation envelope from `createAuditor().run({ limit: 3 })`.
Every response includes its source, request and received time. The test suite evaluates the raw JSON again.
The short page is intentionally incomplete. It must not pass whole-network sums.

The capture script is `scripts/record.ts`. It makes live read-only calls when run explicitly.
