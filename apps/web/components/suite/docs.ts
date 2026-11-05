// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cache } from "react";
import { repository, tools } from "../../content/tools";
import { docHeadings, navigationEntries } from "./catalogue";

/** Index local README headings at render/build time without public requests. @example await paletteEntries() */
export const paletteEntries = cache(async () => {
  const documents = [
    { path: "apps/web", title: "Website guide" },
    ...tools.map((tool) => ({ path: tool.repoPath, title: tool.name })),
  ];
  const docs = await Promise.all(
    documents.map(async (document) => {
      try {
        const markdown = await readFile(resolve(process.cwd(), "../..", document.path, "README.md"), "utf8");
        return docHeadings(markdown, document.title, `${repository}/blob/main/${document.path}/README.md`);
      } catch {
        return [];
      }
    }),
  );
  return [...navigationEntries(), ...docs.flat()];
});
