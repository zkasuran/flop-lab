// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appendIndex } from "./analysis";
import { parseIndex, parseSnapshot, snapshotPath, type Index, type Snapshot } from "./schema";

function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Read a validated local index. Absence means no data yet. @example await readIndex("./archive") */
export async function readIndex(directory: string): Promise<Index> {
  try {
    return parseIndex(JSON.parse(await readFile(join(directory, "index.json"), "utf8")));
  } catch (error) {
    if (missing(error)) return { version: 1, entries: [] };
    throw error;
  }
}

/** Append under an exclusive lock. Only the index is replaced atomically. @example await storeSnapshot("./archive", snapshot) */
export async function storeSnapshot(directory: string, input: Snapshot): Promise<Index> {
  const snapshot = await parseSnapshot(input);
  await mkdir(directory, { recursive: true });
  const lock = join(directory, ".recorder-lock");
  await mkdir(lock);
  try {
    const index = appendIndex(await readIndex(directory), snapshot);
    const path = join(directory, snapshotPath(snapshot));
    await mkdir(dirname(path), { recursive: true });
    const raw = JSON.stringify(snapshot) + "\n";
    try {
      await writeFile(path, raw, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      if ((await parseSnapshot(JSON.parse(await readFile(path, "utf8")))).id !== snapshot.id)
        throw new Error("Archive collision", { cause: error });
    }
    const temporary = join(lock, "index.json");
    await writeFile(temporary, JSON.stringify(index) + "\n");
    await rename(temporary, join(directory, "index.json"));
    return index;
  } finally {
    await rm(lock, { recursive: true });
  }
}
