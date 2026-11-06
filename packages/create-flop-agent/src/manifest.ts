// SPDX-License-Identifier: Apache-2.0
export const templateFiles = [
  ["src/main.ts", "The bounded loop. Dry run is the default."],
  ["src/guards.ts", "Reject unknown chains and cap the full amount at risk."],
  ["src/agent.ts", "Discover, route, admit spend and check settlement evidence."],
  ["src/inputs.ts", "Replay recorded inputs or request public read-only observations."],
  ["src/init-ledger.ts", "Create a local ledger once. Existing files are refused."],
  ["test/agent.test.ts", "Prove the devnet guard rejects other chains."],
  ["README.md", "Run the project and understand the limits."],
  [".gitignore", "Keep wallet files, local keys and the ledger out of Git."],
  ["package.json", "Link to the installed flop-lab workspace."],
  ["tsconfig.json", "Type-check source and tests in strict mode."],
  ["pnpm-workspace.yaml", "Isolate the generated install from any parent workspace."],
] as const;
