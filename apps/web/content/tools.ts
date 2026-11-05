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
    tagline: "Which miner has settlement evidence I can compare?",
    status: "alpha",
    href: "/scoreboard",
    repoPath: "packages/scoreboard",
  },
  {
    slug: "harness",
    name: "Conformance harness",
    tagline: "Does the network do what its docs say?",
    status: "alpha",
    href: "/harness",
    repoPath: "packages/harness",
  },
  {
    slug: "verify",
    name: "Settlement verifier",
    tagline: "Does this settlement add up?",
    status: "alpha",
    href: "/verify",
    repoPath: "packages/verifier",
  },
  {
    slug: "spendguard",
    name: "Spend guard",
    tagline: "Would my budget policy stop this request?",
    status: "alpha",
    href: "/spendguard",
    repoPath: "packages/spendguard",
  },
  {
    slug: "x402",
    name: "Pay-per-call kit",
    tagline: "How does an API charge per call in FLOP?",
    status: "planned",
    href: "/x402",
    repoPath: "packages/x402kit",
  },
  {
    slug: "kestra",
    name: "FLOP for Kestra",
    tagline: "Read the devnet and check settlements in a dated Kestra flow.",
    status: "alpha",
    href: "/kestra",
    repoPath: "plugins/kestra-flop",
  },
  {
    slug: "challenger",
    name: "Challenge watcher",
    tagline: "Which settlements need a challenge-window review?",
    status: "alpha",
    href: "/challenger",
    repoPath: "packages/challenger",
  },
];

/** Resolve a card destination. Example: toolHref(tools[0]). */
export function toolHref(tool: Tool): string {
  return tool.status === "planned" ? `${repository}/tree/main/${tool.repoPath}` : tool.href;
}
