// SPDX-License-Identifier: Apache-2.0
import type { ClockSample, Disk, Gpu, Memory } from "./types.js";
const integer = (text: string): number => {
  if (!/^\d+$/.test(text)) throw new Error("Expected an unsigned integer");
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error("Integer outside safe range");
  return value;
};
const bytes = (text: string, scale: number) => {
  const value = integer(text) * scale;
  if (!Number.isSafeInteger(value)) throw new Error("Byte count outside safe range");
  return value;
};

/** Parse nvidia-smi nounits CSV. Example: parseGpu("NVIDIA A40, 46068, 45000"). */
export function parseGpu(raw: string): Gpu[] {
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([\w ()+./-]{1,100}),\s*(\d+),\s*(\d+)$/.exec(line.trim());
      if (!match) throw new Error("Invalid GPU CSV");
      const totalBytes = bytes(match[2]!, 1024 ** 2);
      const freeBytes = bytes(match[3]!, 1024 ** 2);
      if (freeBytes > totalBytes || totalBytes === 0) throw new Error("Invalid GPU capacity");
      return { name: match[1]!, totalBytes, freeBytes };
    });
}

/** Parse GNU df --output=size,avail -B1. Example: parseDisk("1B-blocks Avail\n100 20"). */
export function parseDisk(raw: string): Disk {
  const lines = raw.trim().split(/\r?\n/);
  const match = lines.length === 2 ? /^\s*(\d+)\s+(\d+)\s*$/.exec(lines[1]!) : null;
  if (!match) throw new Error("Invalid df capacity output");
  const totalBytes = integer(match[1]!);
  const availableBytes = integer(match[2]!);
  if (totalBytes === 0 || availableBytes > totalBytes) throw new Error("Invalid disk capacity");
  return { totalBytes, availableBytes };
}

/** Parse Linux capacity fields only. Example: parseMemory("MemTotal: 4096 kB\nMemAvailable: 2048 kB"). */
export function parseMemory(raw: string): Memory {
  const field = (key: string) => {
    const matches = [...raw.matchAll(new RegExp(`^${key}:\\s+(\\d+) kB$`, "gm"))];
    if (matches.length !== 1) throw new Error(`Missing or duplicate ${key}`);
    return bytes(matches[0]![1]!, 1024);
  };
  const totalBytes = field("MemTotal");
  const availableBytes = field("MemAvailable");
  if (!totalBytes || availableBytes > totalBytes) throw new Error("Invalid RAM capacity");
  return { totalBytes, availableBytes };
}

/** Parse a positive logical CPU count. Example: parseCpu("8\n") === 8. */
export function parseCpu(raw: string): number {
  const count = integer(raw.trim());
  if (count < 1) throw new Error("No available processors");
  return count;
}

/** Validate the public model catalogue boundary. Example: parseModels({data: []}). */
export function parseModels(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || !("data" in raw) || !Array.isArray(raw.data))
    throw new Error("Invalid model catalogue");
  return raw.data.map((model: unknown) => {
    if (
      !model ||
      typeof model !== "object" ||
      !("id" in model) ||
      typeof model.id !== "string" ||
      !/^[a-zA-Z0-9._/-]{1,160}$/.test(model.id)
    )
      throw new Error("Invalid model identifier");
    return model.id;
  });
}

/** Bound server minus local time, including Date quantization and request duration. Example: clockInterval(sample). */
export function clockInterval(sample: ClockSample): [number, number] | null {
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(sample.date)) return null;
  const date = Date.parse(sample.date);
  if (!Number.isFinite(date) || new Date(date).toUTCString() !== sample.date) return null;
  const { startMs, endMs, elapsedMs } = sample;
  if (
    ![date, startMs, endMs, elapsedMs].every(Number.isFinite) ||
    endMs < startMs ||
    elapsedMs < 0 ||
    Math.abs(endMs - startMs - elapsedMs) > 100 ||
    (sample.age !== null && sample.age !== "0")
  )
    return null;
  return [date - endMs, date + 1000 - startMs];
}

/** Accept only a versioned sha256 pin, never a tag alone. Example: isPinnedImage("repo:v1.2.3@sha256:" + "a".repeat(64)). */
export function isPinnedImage(ref: string): boolean {
  return /^[a-zA-Z0-9./:_-]+:v?\d+\.\d+\.\d+[a-zA-Z0-9._-]*@sha256:[a-f0-9]{64}$/.test(ref);
}

/** Inspect only RepoDigests and match the requested digest. Example: parseDigests('["repo@sha256:..."]', ref). */
export function parseDigests(raw: string, ref: string): boolean {
  const digests: unknown = JSON.parse(raw);
  if (
    !Array.isArray(digests) ||
    !digests.every((v: unknown) => typeof v === "string" && /^[\w./:-]+@sha256:[a-f0-9]{64}$/.test(v))
  )
    throw new Error("Invalid RepoDigests");
  const expected = ref.slice(ref.indexOf("@") + 1);
  return digests.some((digest: string) => digest.endsWith(`@${expected}`));
}
