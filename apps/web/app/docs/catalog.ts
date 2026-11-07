// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cache } from "react";
import { commands } from "../../../../packages/cli/src/commands";
import { repository, tools } from "../../content/tools";
import { parseReadme, plain, type SearchDoc } from "./model";

const root = existsSync(resolve(process.cwd(), "packages/cli/README.md"))
  ? process.cwd()
  : resolve(process.cwd(), "../..");

/** Read every workspace package README at build time. Example: readCatalog().docs.find((doc) => doc.slug === "verifier"). */
export const readCatalog = cache(() => {
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
  const revision = commit && /^[a-f0-9]{40}$/.test(commit) ? commit : "main";
  const docs = readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(root, "packages", entry.name, "package.json")))
    .map((entry) => {
      const repoPath = `packages/${entry.name}`;
      const raw = readFileSync(resolve(root, repoPath, "README.md"), "utf8");
      const pkg: unknown = JSON.parse(readFileSync(resolve(root, repoPath, "package.json"), "utf8"));
      if (!pkg || typeof pkg !== "object" || !("name" in pkg) || typeof pkg.name !== "string")
        throw new Error(`Missing package name: ${repoPath}`);
      const tool = tools.find((item) => item.repoPath === repoPath);
      const command = commands.find((item) => item.pkg === pkg.name);
      const blocks = parseReadme(raw);
      const headings = blocks.filter((block) => block.kind === "heading");
      const firstParagraph = blocks.find((block) => block.kind === "paragraph");
      const doc: SearchDoc & {
        raw: string;
        source: string;
        sha256: string;
        toolHref: string | null;
        blocks: typeof blocks;
      } = {
        slug: entry.name,
        title: tool?.name ?? headings[0]?.title ?? pkg.name,
        question:
          firstParagraph?.kind === "paragraph"
            ? plain(firstParagraph.text)
            : (tool?.tagline ?? "Package documentation."),
        section: tool?.section ?? "build",
        packageName: pkg.name,
        command: command ? `flop ${command.name}` : pkg.name === "@flop-lab/cli" ? "flop --help" : null,
        headings,
        raw,
        source: `${repository}/blob/${revision}/${repoPath}/README.md`,
        sha256: createHash("sha256").update(raw).digest("hex"),
        toolHref: tool?.href ?? (entry.name === "mcp" ? "/console" : null),
        blocks,
      };
      return doc;
    });
  // The build time, not the request time: these pages render per request but the catalog is a build-time snapshot.
  return { docs, generatedAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString(), revision };
});
