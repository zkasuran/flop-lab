// SPDX-License-Identifier: Apache-2.0

/**
 * One entry per suite tool. The `flop` command runs the tool's own CLI, so each package keeps one binary and one API.
 * Add your tool here when its package lands on main: name (the subcommand), the workspace package and its bin name.
 *
 * Example: { name: "verify", pkg: "@flop-lab/verifier", bin: "flop-verify", section: "verify", summary: "..." }
 */
export type Section = "observe" | "verify" | "build" | "operate" | "agents" | "identity";

export type Command = {
  readonly name: string;
  readonly pkg: string;
  readonly bin: string;
  readonly section: Section;
  readonly summary: string;
};

export const commands: readonly Command[] = [
  {
    name: "mcp",
    pkg: "@flop-lab/mcp-server",
    bin: "flop-lab-mcp",
    section: "agents",
    summary: "Serve read-only suite tools over schema-checked stdio MCP",
  },
  {
    name: "watch",
    pkg: "@flop-lab/watch",
    bin: "flop-watch",
    section: "operate",
    summary: "Watch dated network changes with persisted rules and bounded delivery",
  },
  {
    name: "upgrades",
    pkg: "@flop-lab/upgrades",
    bin: "flop-upgrades",
    section: "observe",
    summary: "Compare dated spec revisions and observe package release history",
  },
  {
    name: "knowledge",
    pkg: "@flop-lab/knowledge",
    bin: "flop-knowledge",
    section: "build",
    summary: "Browse catalog relationships, cited requirements and agent-pack responses",
  },
  {
    name: "spec-read",
    pkg: "@flop-lab/yellowpaper",
    bin: "flop-yellowpaper",
    section: "build",
    summary: "Read pinned sections, terms and parameters beside dated catalog evidence",
  },
  {
    name: "metering",
    pkg: "@flop-lab/metering",
    bin: "flop-metering",
    section: "verify",
    summary: "Calculate reference-work units and inspect dated calibration lease evidence",
  },
  {
    name: "invariants",
    pkg: "@flop-lab/invariants",
    bin: "flop-invariants",
    section: "verify",
    summary: "Map quoted security rules to scoped checks and public evidence gaps",
  },
  {
    name: "swap",
    pkg: "@flop-lab/swaps",
    bin: "flop-swaps",
    section: "agents",
    summary: "Plan HTLC timing, generate local hash locks and inspect dated swaps",
  },
  {
    name: "finality",
    pkg: "@flop-lab/finality",
    bin: "flop-finality",
    section: "observe",
    summary: "Measure linked block times and compare reported finality lag with pinned rules",
  },
  {
    name: "proofs",
    pkg: "@flop-lab/proofs",
    bin: "flop-proofs",
    section: "verify",
    summary: "Inspect proof submissions and explain settlement coverage limits",
  },
  {
    name: "did",
    pkg: "@flop-lab/did",
    bin: "flop-did",
    section: "identity",
    summary: "Follow signed artifacts and verify their exact bytes",
  },
  {
    name: "economics",
    pkg: "@flop-lab/economics",
    bin: "flop-economics",
    section: "verify",
    summary: "Model exact emission and compare dated settlement fees with the paper",
  },
  {
    name: "sessions",
    pkg: "@flop-lab/sessions",
    bin: "flop-sessions",
    section: "observe",
    summary: "Classify compute channel lifecycle states with dated evidence",
  },
  {
    name: "models",
    pkg: "@flop-lab/models",
    bin: "flop-models",
    section: "observe",
    summary: "Join model listings, registry hashes and dated price sources",
  },
  {
    name: "call",
    pkg: "@flop-lab/console",
    bin: "flop-console",
    section: "build",
    summary: "Call read-only MCP tools and compare dated devnet cost estimates",
  },
  {
    name: "start",
    pkg: "@flop-lab/create-flop-agent",
    bin: "create-flop-agent",
    section: "build",
    summary: "Generate a devnet-only agent with fixture-backed dry runs",
  },
  {
    name: "indexer",
    pkg: "@flop-lab/indexer-audit",
    bin: "flop-indexer-audit",
    section: "verify",
    summary: "Audit indexer totals, block links and settlement accounting",
  },
  {
    name: "tclk",
    pkg: "@flop-lab/tclk-inspect",
    bin: "flop-tclk",
    section: "agents",
    summary: "Inspect signed agent deals against the pinned TCLK protocol",
  },
  {
    name: "contracts",
    pkg: "@flop-lab/mcpaudit",
    bin: "flop-mcpaudit",
    section: "verify",
    summary: "Audit advertised MCP schemas and inspect dated trust material",
  },
  {
    name: "history",
    pkg: "@flop-lab/recorder",
    bin: "flop-recorder",
    section: "observe",
    summary: "Record devnet snapshots and compare reset signals and claim changes",
  },
  {
    name: "explore",
    pkg: "@flop-lab/explorer",
    bin: "flop-explorer",
    section: "observe",
    summary: "Search devnet entities and inspect dated query evidence",
  },
  {
    name: "doctor",
    pkg: "@flop-lab/doctor",
    bin: "flop-doctor",
    section: "operate",
    summary: "Check local operator readiness against sourced requirements",
  },
  {
    name: "spec",
    pkg: "@flop-lab/spec",
    bin: "flop-spec",
    section: "verify",
    summary: "Compare the pinned yellowpaper with dated public observations",
  },
  {
    name: "verify",
    pkg: "@flop-lab/verifier",
    bin: "flop-verify",
    section: "verify",
    summary: "Cross-check settlements, receipts and attestation evidence offline",
  },
  {
    name: "harness",
    pkg: "@flop-lab/harness",
    bin: "flop-harness",
    section: "verify",
    summary: "Check documented network claims against public responses",
  },
  {
    name: "score",
    pkg: "@flop-lab/scoreboard",
    bin: "flop-scoreboard",
    section: "agents",
    summary: "Rank miners by observed settlement evidence",
  },
  {
    name: "guard",
    pkg: "@flop-lab/spendguard",
    bin: "flop-spendguard",
    section: "agents",
    summary: "Evaluate an agent's spend against a budget policy",
  },
  {
    name: "challenge",
    pkg: "@flop-lab/challenger",
    bin: "flop-challenger",
    section: "agents",
    summary: "Find settlements that need a challenge-window review",
  },
  {
    name: "x402",
    pkg: "@flop-lab/x402kit",
    bin: "flop-x402",
    section: "build",
    summary: "Diagnose pay-per-call payment headers",
  },
  {
    name: "sdk",
    pkg: "@flop-lab/sdkconf",
    bin: "flop-sdkconf",
    section: "build",
    summary: "Check published SDK behaviour with offline request traces",
  },
  {
    name: "stake",
    pkg: "@flop-lab/staking",
    bin: "flop-staking",
    section: "operate",
    summary: "Model quoted stake requirements and inspect indexed stake evidence",
  },
];

/** Find a command by name. Example: findCommand(commands, "verify")?.bin === "flop-verify". */
export function findCommand(list: readonly Command[], name: string): Command | undefined {
  return list.find((command) => command.name === name);
}

/** The help text, grouped by suite section in a fixed order. */
export function helpText(list: readonly Command[]): string {
  const order: Section[] = ["observe", "verify", "build", "operate", "agents", "identity"];
  const width = Math.max(...list.map((command) => command.name.length));
  const lines = ["flop <command> [arguments]   Runs the flop-lab tool with that name.", ""];
  for (const section of order) {
    const inSection = list.filter((command) => command.section === section);
    if (!inSection.length) continue;
    lines.push(section);
    for (const command of inSection) lines.push(`  ${command.name.padEnd(width)}  ${command.summary}`);
    lines.push("");
  }
  lines.push("flop <command> --help shows that tool's own options. flop list --json prints this list as JSON.");
  return lines.join("\n");
}
