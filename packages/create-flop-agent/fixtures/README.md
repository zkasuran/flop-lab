# Recorded devnet inputs

`devnet.json` stores raw MCP tool text for health and model discovery. It also stores the scoreboard collector's raw gateway and MCP observations. Each observation has its source and capture time. Run `pnpm --filter @flop-lab/create-flop-agent record` to replace it with a fresh capture.

The generated project replays these observations at their capture time. They are not current offers. Discovery prices and latency fields are not accepted as spending quotes or performance evidence.
