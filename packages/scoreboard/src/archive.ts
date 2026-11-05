// SPDX-License-Identifier: Apache-2.0
import { parseIndex, parseSnapshot as parseArchiveSnapshot } from "../../recorder/src/schema";
import { DATA_URL, readJson } from "../../recorder/src/feed";
import { list, object, parseSettlements, SOURCES, text, timestamp } from "./schema";

export interface SettlementHistory {
  source: string;
  measuredAt: string;
  genesis: string | null;
  raw: Record<string, unknown>;
}
export interface ArchiveHistory {
  source: string;
  checkedAt: string;
  state: "recorded" | "empty" | "unavailable";
  error: string | null;
  snapshots: SettlementHistory[];
}
/** Validate a genesis observation. @example genesisHash(indexerResponse) */
export function genesisHash(raw: Record<string, unknown>): string | null {
  if (raw.block === undefined || raw.block === null) return null;
  const block = object(raw.block, "genesis block");
  if (block.number !== 0 || typeof block.hash !== "string" || !/^0x[\da-f]{64}$/i.test(block.hash))
    throw new Error("Invalid genesis observation");
  return block.hash;
}
/** Validate normalized archive evidence before scoring. @example parseArchive(recordedHistory) */
export function parseArchive(input: unknown): ArchiveHistory {
  const o = object(input, "archive");
  if (o.source !== `${DATA_URL}index.json` || !["recorded", "empty", "unavailable"].includes(String(o.state)))
    throw new Error("Invalid archive source or state");
  const checkedAt = timestamp(o.checkedAt, "archive.checkedAt");
  const snapshots = list(o.snapshots, "archive.snapshots").map((v) => {
    const r = object(v, "archive snapshot");
    const source = text(r.source, "archive.source");
    if (
      !source.startsWith(`${DATA_URL}snapshots/`) ||
      !/^snapshots\/[\d/.-]+Z-[a-f0-9]{64}\.json$/.test(source.slice(DATA_URL.length))
    )
      throw new Error("Invalid archive path");
    const measuredAt = timestamp(r.measuredAt, "archive.measuredAt");
    if (Date.parse(measuredAt) > Date.parse(checkedAt)) throw new Error("Future archive observation");
    const genesis = r.genesis === null ? null : text(r.genesis, "archive.genesis");
    if (genesis !== null && !/^0x[\da-f]{64}$/i.test(genesis)) throw new Error("Invalid archive genesis");
    const raw = object(r.raw, "archive settlements");
    parseSettlements({ source: SOURCES.settlements, kind: "settlements", measuredAt, raw });
    return { source, measuredAt, genesis, raw };
  });
  if (snapshots.length > 8 || new Set(snapshots.map((s) => s.source)).size !== snapshots.length)
    throw new Error("Invalid archive sample count");
  return {
    source: o.source,
    checkedAt,
    state: o.state as ArchiveHistory["state"],
    error: o.error === null ? null : text(o.error, "archive.error"),
    snapshots,
  };
}

/** Read up to eight content-checked recorder snapshots. Missing archives use indexer history. @example await fetchScoreHistory() */
export async function fetchScoreHistory(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
  windowMs = 7 * 86_400_000,
): Promise<ArchiveHistory> {
  const result: ArchiveHistory = {
    source: `${DATA_URL}index.json`,
    checkedAt: new Date(now).toISOString(),
    state: "empty",
    error: null,
    snapshots: [],
  };
  const signal = AbortSignal.timeout(8000);
  try {
    const response = await fetcher(result.source, { signal });
    if (response.status === 404) {
      await response.body?.cancel();
      return result;
    }
    const index = parseIndex(await readJson(response, 4_000_000));
    const entries = index.entries
      .filter((e) => Date.parse(e.measuredAt) <= now && Date.parse(e.measuredAt) >= now - windowMs)
      .slice(-8);
    for (const entry of entries) {
      const source = `${DATA_URL}${entry.path}`;
      const snapshot = await parseArchiveSnapshot(await readJson(await fetcher(source, { signal }), 100_000));
      if (snapshot.id !== entry.id || snapshot.startedAt !== entry.measuredAt)
        throw new Error("Archive index disagrees with snapshot");
      const settlements = snapshot.observations.settlements,
        indexer = snapshot.observations.indexer;
      if (settlements.status !== "ok" || indexer.status !== "ok") continue;
      const genesis = genesisHash(object(indexer.value, "archive indexer"));
      result.snapshots.push({
        source,
        measuredAt: settlements.measuredAt,
        genesis,
        raw: object(settlements.value, "archive settlements"),
      });
    }
    result.state = result.snapshots.length ? "recorded" : "empty";
    return parseArchive(result);
  } catch (error) {
    return {
      ...result,
      snapshots: [],
      state: "unavailable",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    };
  }
}
