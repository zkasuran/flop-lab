// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const LIMIT = 200_000;
export interface Provenance {
  source: string;
  measuredAt: string;
  httpStatus: number;
  contentType: string;
}
export interface RecordedResponse extends Provenance {
  body: string;
  sha256: string;
  bytes: number;
}

function safeId(id: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,150}$/i.test(id)) throw new Error("Invalid fixture id");
}
function provenance(value: unknown): Provenance {
  if (!value || typeof value !== "object") throw new Error("Missing provenance");
  const p = value as Record<string, unknown>;
  if (
    typeof p.source !== "string" ||
    !p.source.startsWith("https://") ||
    typeof p.measuredAt !== "string" ||
    !Number.isFinite(Date.parse(p.measuredAt)) ||
    new Date(p.measuredAt).toISOString() !== p.measuredAt ||
    !Number.isInteger(p.httpStatus) ||
    Number(p.httpStatus) < 100 ||
    Number(p.httpStatus) > 599 ||
    typeof p.contentType !== "string"
  )
    throw new Error("Invalid provenance");
  const url = new URL(p.source);
  if (url.username || url.password || url.hash) throw new Error("Invalid source URL");
  return { source: p.source, measuredAt: p.measuredAt, httpStatus: Number(p.httpStatus), contentType: p.contentType };
}
function hash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
function encode(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u2013\u2014]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`) + "\n";
}
function boundedRead(path: string): string {
  const text = readFileSync(path, "utf8");
  if (Buffer.byteLength(text) > LIMIT) throw new Error("Fixture exceeds repository limit");
  return text;
}

/** Read and hash-check an observation. Example: readFixture("status-2026-11-06T05-23-46.400Z-mcp").body. */
export function readFixture(id: string, root = defaultRoot): RecordedResponse {
  safeId(id);
  const record: unknown = JSON.parse(boundedRead(join(root, "records", `${id}.json`)));
  const meta = provenance(record);
  const r = record as Record<string, unknown>;
  if (typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.sha256) || !Number.isSafeInteger(r.bytes)) {
    throw new Error("Invalid content reference");
  }
  const body: unknown = JSON.parse(boundedRead(join(root, "bodies", `${r.sha256}.json`)));
  if (typeof body !== "string" || hash(body) !== r.sha256 || Buffer.byteLength(body) !== r.bytes) {
    throw new Error("Fixture content mismatch");
  }
  return { ...meta, body, sha256: r.sha256, bytes: Number(r.bytes) };
}

/** Store a new observation without replacing old evidence. Example: writeFixture("capture-1", meta, rawText, root). */
export function writeFixture(id: string, meta: Provenance, body: string, root = defaultRoot): void {
  safeId(id);
  const checked = provenance(meta);
  if (typeof body !== "string") throw new Error("Expected response text");
  const encoded = encode(body);
  const sha256 = hash(body);
  const record = encode({ ...checked, sha256, bytes: Buffer.byteLength(body) });
  if (Buffer.byteLength(encoded) > LIMIT || Buffer.byteLength(record) > LIMIT)
    throw new Error("Fixture exceeds repository limit");
  mkdirSync(join(root, "bodies"), { recursive: true });
  mkdirSync(join(root, "records"), { recursive: true });
  try {
    writeFileSync(join(root, "bodies", `${sha256}.json`), encoded, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (JSON.parse(boundedRead(join(root, "bodies", `${sha256}.json`))) !== body)
      throw new Error("Existing body mismatch", { cause: error });
  }
  writeFileSync(join(root, "records", `${id}.json`), record, { flag: "wx" });
}
