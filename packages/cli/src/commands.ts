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
    name: "history",
    pkg: "@flop-lab/recorder",
    bin: "flop-recorder",
    section: "observe",
    summary: "Record devnet snapshots and compare reset signals and claim changes",
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
    summary: "Check settlement arithmetic and save evidence to replay offline",
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
