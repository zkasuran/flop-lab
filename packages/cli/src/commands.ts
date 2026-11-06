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
  readonly tagline?: string;
};

export const commands: readonly Command[] = [
  {
    name: "api",
    tagline: "How do I read the suite's results as an API?",
    pkg: "@flop-lab/openapi",
    bin: "flop-openapi",
    section: "build",
    summary: "Read dated suite results and generate their OpenAPI contract",
  },
  {
    name: "mcp",
    tagline: "How does my agent call every flop-lab tool?",
    pkg: "@flop-lab/mcp-server",
    bin: "flop-lab-mcp",
    section: "agents",
    summary: "Serve read-only suite tools over schema-checked stdio MCP",
  },
  {
    name: "status",
    tagline: "Are FLOP's public services answering?",
    pkg: "@flop-lab/status",
    bin: "flop-status",
    section: "observe",
    summary: "Probe public service responses and inspect measured availability",
  },
  {
    name: "export",
    tagline: "How do I get devnet data into a spreadsheet or notebook?",
    pkg: "@flop-lab/export",
    bin: "flop-export",
    section: "build",
    summary: "Export dated devnet rows with hashes and resumable parts",
  },
  {
    name: "community",
    tagline: "What are operators and builders asking for?",
    pkg: "@flop-lab/community",
    bin: "flop-community",
    section: "observe",
    summary: "Inspect dated public requests, response times and access-form fields",
  },
  {
    name: "watch",
    tagline: "How do I get told when something on the network changes?",
    pkg: "@flop-lab/watch",
    bin: "flop-watch",
    section: "operate",
    summary: "Watch dated network changes with persisted rules and bounded delivery",
  },
  {
    name: "upgrades",
    tagline: "What changed in the runtime and in the spec?",
    pkg: "@flop-lab/upgrades",
    bin: "flop-upgrades",
    section: "observe",
    summary: "Compare dated spec revisions and observe package release history",
  },
  {
    name: "knowledge",
    tagline: "What does the network's own knowledge catalog say?",
    pkg: "@flop-lab/knowledge",
    bin: "flop-knowledge",
    section: "build",
    summary: "Browse catalog relationships, cited requirements and agent-pack responses",
  },
  {
    name: "spec-read",
    tagline: "What does the yellowpaper say beside the observed value?",
    pkg: "@flop-lab/yellowpaper",
    bin: "flop-yellowpaper",
    section: "build",
    summary: "Read pinned sections, terms and parameters beside dated catalog evidence",
  },
  {
    name: "metering",
    tagline: "How is effective FLOP measured and calibrated?",
    pkg: "@flop-lab/metering",
    bin: "flop-metering",
    section: "verify",
    summary: "Calculate reference-work units and inspect dated calibration lease evidence",
  },
  {
    name: "invariants",
    tagline: "Which security invariants and failure cases can be checked from outside?",
    pkg: "@flop-lab/invariants",
    bin: "flop-invariants",
    section: "verify",
    summary: "Map quoted security rules to scoped checks and public evidence gaps",
  },
  {
    name: "swap",
    tagline: "Is this atomic swap safe to start?",
    pkg: "@flop-lab/swaps",
    bin: "flop-swaps",
    section: "agents",
    summary: "Plan HTLC timing, generate local hash locks and inspect dated swaps",
  },
  {
    name: "finality",
    tagline: "Is the chain producing and finalizing blocks on time?",
    pkg: "@flop-lab/finality",
    bin: "flop-finality",
    section: "observe",
    summary: "Measure linked block times and compare reported finality lag with pinned rules",
  },
  {
    name: "proofs",
    tagline: "What proofs are miners submitting and what do they cover?",
    pkg: "@flop-lab/proofs",
    bin: "flop-proofs",
    section: "verify",
    summary: "Inspect proof submissions and explain settlement coverage limits",
  },
  {
    name: "did",
    tagline: "What has this did:key signed and does it verify?",
    pkg: "@flop-lab/did",
    bin: "flop-did",
    section: "identity",
    summary: "Follow signed artifacts and verify their exact bytes",
  },
  {
    name: "economics",
    tagline: "Do rewards, emission and fees follow the spec?",
    pkg: "@flop-lab/economics",
    bin: "flop-economics",
    section: "verify",
    summary: "Model exact emission and compare dated settlement fees with the paper",
  },
  {
    name: "sessions",
    tagline: "Where is each compute channel in its lifecycle?",
    pkg: "@flop-lab/sessions",
    bin: "flop-sessions",
    section: "observe",
    summary: "Classify compute channel lifecycle states with dated evidence",
  },
  {
    name: "models",
    tagline: "Which models are served, at what price and are they registered?",
    pkg: "@flop-lab/models",
    bin: "flop-models",
    section: "observe",
    summary: "Join model listings, registry hashes and dated price sources",
  },
  {
    name: "call",
    tagline: "What does each public tool return and how is its devnet cost estimated?",
    pkg: "@flop-lab/console",
    bin: "flop-console",
    section: "build",
    summary: "Call read-only MCP tools and compare dated devnet cost estimates",
  },
  {
    name: "start",
    tagline: "How do I start a FLOP agent that is safe by default?",
    pkg: "@flop-lab/create-flop-agent",
    bin: "create-flop-agent",
    section: "build",
    summary: "Generate a devnet-only agent with fixture-backed dry runs",
  },
  {
    name: "indexer",
    tagline: "Do the indexer's totals agree with their parts?",
    pkg: "@flop-lab/indexer-audit",
    bin: "flop-indexer-audit",
    section: "verify",
    summary: "Audit indexer totals, block links and settlement accounting",
  },
  {
    name: "tclk",
    tagline: "Did this agent-to-agent deal follow the protocol?",
    pkg: "@flop-lab/tclk-inspect",
    bin: "flop-tclk",
    section: "agents",
    summary: "Inspect signed agent deals against the pinned TCLK protocol",
  },
  {
    name: "contracts",
    tagline: "Do the network's tools return what they advertise?",
    pkg: "@flop-lab/mcpaudit",
    bin: "flop-mcpaudit",
    section: "verify",
    summary: "Audit advertised MCP schemas and inspect dated trust material",
  },
  {
    name: "history",
    tagline: "How has the devnet changed day by day?",
    pkg: "@flop-lab/recorder",
    bin: "flop-recorder",
    section: "observe",
    summary: "Record devnet snapshots and compare reset signals and claim changes",
  },
  {
    name: "explore",
    tagline: "Which query explains this block, account or channel?",
    pkg: "@flop-lab/explorer",
    bin: "flop-explorer",
    section: "observe",
    summary: "Search devnet entities and inspect dated query evidence",
  },
  {
    name: "doctor",
    tagline: "Is this machine ready to mine or validate?",
    pkg: "@flop-lab/doctor",
    bin: "flop-doctor",
    section: "operate",
    summary: "Check local operator readiness against sourced requirements",
  },
  {
    name: "spec",
    tagline: "Which yellowpaper clauses can public devnet evidence settle?",
    pkg: "@flop-lab/spec",
    bin: "flop-spec",
    section: "verify",
    summary: "Compare the pinned yellowpaper with dated public observations",
  },
  {
    name: "verify",
    tagline: "Do the settlement, receipt and attestation agree?",
    pkg: "@flop-lab/verifier",
    bin: "flop-verify",
    section: "verify",
    summary: "Cross-check settlements, receipts and attestation evidence offline",
  },
  {
    name: "harness",
    tagline: "Which documented claims have public evidence?",
    pkg: "@flop-lab/harness",
    bin: "flop-harness",
    section: "verify",
    summary: "Check documented network claims against public responses",
  },
  {
    name: "score",
    tagline: "Which miner has reliability evidence over time?",
    pkg: "@flop-lab/scoreboard",
    bin: "flop-scoreboard",
    section: "agents",
    summary: "Rank miners by observed settlement evidence",
  },
  {
    name: "guard",
    tagline: "Will my policy hold when agents share one budget?",
    pkg: "@flop-lab/spendguard",
    bin: "flop-spendguard",
    section: "agents",
    summary: "Evaluate an agent's spend against a budget policy",
  },
  {
    name: "challenge",
    tagline: "Which challenge windows close next and what evidence is missing?",
    pkg: "@flop-lab/challenger",
    bin: "flop-challenger",
    section: "agents",
    summary: "Find settlements that need a challenge-window review",
  },
  {
    name: "x402",
    tagline: "Does my API speak FLOP's 402 protocol correctly?",
    pkg: "@flop-lab/x402kit",
    bin: "flop-x402",
    section: "build",
    summary: "Diagnose pay-per-call payment headers",
  },
  {
    name: "sdk",
    tagline: "Do the FLOP SDKs behave as documented?",
    pkg: "@flop-lab/sdkconf",
    bin: "flop-sdkconf",
    section: "build",
    summary: "Check published SDK behaviour with offline request traces",
  },
  {
    name: "stake",
    tagline: "What stake does my miner or validator need and what can it lose?",
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

/** The help text in section then name order. Example: helpText(commands). */
export function helpText(list: readonly Command[]): string {
  const order: Section[] = ["observe", "verify", "build", "operate", "agents", "identity"];
  const width = Math.max(0, ...list.map((command) => command.name.length));
  const lines = [
    "flop <command> [arguments]",
    "Find a FLOP devnet tool and run its own CLI.",
    "",
    "Suite commands",
    "  help [command]          Show suite help or a tool's options",
    "  list [--json]           List registered suite commands",
    "  which <words> [--json]  Search names, summaries and question taglines",
    "  completions <shell>    Print bash, zsh or fish completion script",
    "",
  ];
  for (const section of order) {
    const inSection = list
      .filter((command) => command.section === section)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    if (!inSection.length) continue;
    lines.push(section);
    for (const command of inSection) lines.push(`  ${command.name.padEnd(width)}  ${command.summary}`);
    lines.push("");
  }
  lines.push(
    "Examples: flop help verify | flop which miner reliability | flop list --json",
    "Put --json last. JSON-native operations accept it through the wrapper. Child exit codes are preserved.",
    "Suite exits: 0 success, 1 no search match, 2 usage or missing installation.",
  );
  return lines.join("\n");
}
