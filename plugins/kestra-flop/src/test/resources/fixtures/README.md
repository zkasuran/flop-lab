# Recorded inputs

The SSE files are byte-for-byte copies from `packages/mcp/fixtures` recorded on
2026-11-05 from `https://mcp.flop.network/mcp`. Tests prefer that repository-root
directory. SHA-256 checks pin the fallback bytes for the isolated Docker gate,
which mounts only this plugin. No synthetic row is presented as a live observation.

`models.json` is a raw public GET response. `models.metadata.json` records its
receipt time and source. The chat quote extension and completion in tests are
synthetic. No live chat request was made.
