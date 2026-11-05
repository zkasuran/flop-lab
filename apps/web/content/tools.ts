// SPDX-License-Identifier: Apache-2.0
export type Tool = {
  slug: string;
  name: string;
  tagline: string;
  status: "planned" | "alpha" | "live";
  href: string;
  repoPath: string;
};

export const repository = "https://github.com/zkasuran/flop-lab";
export const tools: readonly Tool[] = [
  {
    slug: "scoreboard",
    name: "Miner scoreboard",
    tagline: "Compare miners using observed settlements and price sources.",
    status: "alpha",
    href: "/scoreboard",
    repoPath: "packages/scoreboard",
  },
  {
    slug: "harness",
    name: "Conformance harness",
    tagline: "Run repeatable checks against devnet protocol claims.",
    status: "planned",
    href: "/harness",
    repoPath: "packages/harness",
  },
  {
    slug: "verify",
    name: "Settlement verifier",
    tagline: "Check settlement arithmetic and replay the evidence in your browser.",
    status: "alpha",
    href: "/verify",
    repoPath: "packages/verifier",
  },
  {
    slug: "spendguard",
    name: "Spend guard",
    tagline: "Apply explicit budget limits to throwaway agent wallets.",
    status: "planned",
    href: "/spendguard",
    repoPath: "packages/spendguard",
  },
  {
    slug: "x402",
    name: "Pay-per-call kit",
    tagline: "Replay payment headers and inspect the missing chain evidence.",
    status: "alpha",
    href: "/x402",
    repoPath: "packages/x402kit",
  },
  {
    slug: "challenger",
    name: "Challenge watcher",
    tagline: "Track challenge windows and prepare evidence for review.",
    status: "planned",
    href: "/challenger",
    repoPath: "packages/challenger",
  },
];

/** Resolve a card destination. Example: toolHref(tools[0]). */
export function toolHref(tool: Tool): string {
  return tool.status === "planned" ? `${repository}/tree/main/${tool.repoPath}` : tool.href;
}
