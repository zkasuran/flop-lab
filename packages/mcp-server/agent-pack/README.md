# flop-lab agent pack

This follows the network catalog's documented layout: `manifest.json`, `skills/<id>/SKILL.md`, MCP connection metadata and catalog pointers.

Fresh hosted manifest and skill calls are retained in `../fixtures/pack.json` and `../fixtures/skill.json`. Both returned `agent pack missing`. The documented layout is retained in `../fixtures/layout.json`. No successful hosted manifest was available to establish field-level compatibility. The local manifest is a documented adapter, not a claim of upstream validation.

Build the workspace package. Replace the absolute path in `mcp-config.json` with your checkout path. The skill file can be read by any agent client that supports local skills.

## What this does not verify

It does not verify a hosted installation, compatibility with an unavailable upstream manifest schema or installation into a particular agent client.
