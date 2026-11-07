// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { inspectRepository, packRepository, writePreview } from "./repository";

try {
  const { positionals, values } = parseArgs({
    options: { root: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(
      "release plan [--root PATH] [--out NEW_EXTERNAL_DIR]\nrelease pack --out NEW_EXTERNAL_DIR [--root PATH]\nRepository development command. Dry-run versions and unsigned tarballs only.",
    );
  } else {
    const root = resolve(values.root ?? "../..");
    const [operation] = positionals;
    if (positionals.length !== 1 || !["plan", "pack"].includes(operation ?? ""))
      throw new Error("Expected plan or pack. Use --help.");
    if (operation === "pack" && !values.out) throw new Error("Pack requires --out");
    const plan =
      operation === "pack"
        ? packRepository(root, resolve(values.out!))
        : values.out
          ? writePreview(root, resolve(values.out))
          : inspectRepository(root);
    console.log(JSON.stringify(plan, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
