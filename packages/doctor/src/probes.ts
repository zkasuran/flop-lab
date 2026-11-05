// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { arch, platform } from "node:os";
import { performance } from "node:perf_hooks";
import {
  clockInterval,
  isPinnedImage,
  parseCpu,
  parseDigests,
  parseDisk,
  parseGpu,
  parseMemory,
  parseModels,
} from "./parse.js";
import type { ClockSample, Evidence, Inventory, Role } from "./types.js";

const timeoutMs = 5000;
const limit = 65536;
const modelsUrl = "https://api.flop.network/v1/models";
const clockUrl = "https://explorer.devnet.flop.network";

class HttpFailure extends Error {
  constructor(status: number, retryAfter: string | null) {
    const delay =
      retryAfter && /^\d{1,8}$/.test(retryAfter)
        ? ` Wait at least ${retryAfter} seconds before another run.`
        : " Wait before another run; inspect the service Retry-After header.";
    super(`HTTP ${status}. No retry attempted.${delay}`);
  }
}

export interface ProbeOptions {
  role: Role;
  offline?: boolean;
  diskPath?: string;
  images?: Record<string, string>;
  /** Override the release-specific DA port. Default stays unresolved. */
  daPort?: number;
  /** For isolated tests or restricted operator environments. */
  skipPorts?: boolean;
}

function reason(error: unknown): string {
  if (error instanceof HttpFailure) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z_0-9]+$/.test(error.code)
  )
    return `Probe unavailable (${error.code})`;
  return "Probe unavailable, timed out or returned invalid data";
}

/** Run a bounded local executable with no shell. Example: command("nproc", []). */
export function command(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: limit,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
        windowsHide: true,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

async function observe<T>(source: string, run: () => Promise<T>): Promise<Evidence<T>> {
  const measuredAt = new Date().toISOString();
  const start = performance.now();
  try {
    const value = await run();
    return { source, measuredAt, durationMs: Math.round(performance.now() - start), value, reason: null };
  } catch (error) {
    return {
      source,
      measuredAt,
      durationMs: Math.round(performance.now() - start),
      value: null,
      reason: reason(error),
    };
  }
}

function unavailable<T>(source: string, why: string): Evidence<T> {
  return { source, measuredAt: new Date().toISOString(), durationMs: 0, value: null, reason: why };
}

/** Temporarily bind loopback and close immediately. This never tests inbound reachability. Example: bindPort(3429). */
export function bindPort(port: number): Promise<{ port: number; bound: boolean }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Port probe timed out"));
    }, timeoutMs);
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () =>
      server.close((error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve({ port, bound: true });
      }),
    );
  });
}

async function fetchPublic(
  url: string,
  method: "GET" | "HEAD",
): Promise<{ clock: ClockSample; raw: string; status: number }> {
  const startMs = Date.now();
  const start = performance.now();
  const response = await fetch(url, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "flop-lab-doctor/0.1 (read-only preflight)", "cache-control": "no-cache" },
  });
  const endMs = Date.now();
  const clock = {
    date: response.headers.get("date") ?? "",
    age: response.headers.get("age"),
    startMs,
    endMs,
    elapsedMs: performance.now() - start,
  };
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpFailure(response.status, response.headers.get("retry-after"));
  }
  let raw = "";
  if (method === "GET" && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) throw new Error("Response too large");
        chunks.push(part.value);
      }
      raw = Buffer.concat(chunks).toString("utf8");
    } finally {
      await reader.cancel();
    }
  }
  return { clock, raw, status: response.status };
}

/** Collect read-only evidence. No retries or persistent cache. Example: await collect({role: "miner", offline: true}). */
export async function collect(options: ProbeOptions): Promise<{ inventory: Inventory; requests: number }> {
  const os = await observe("node:os platform/arch", async () => ({ platform: platform(), arch: arch() }));
  const gpu = await observe(
    "nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits",
    async () =>
      parseGpu(
        await command("nvidia-smi", ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"]),
      ),
  );
  const disk = await observe("df -B1 --output=size,avail -- [selected path redacted]", async () =>
    parseDisk(await command("df", ["-B1", "--output=size,avail", "--", options.diskPath ?? "."])),
  );
  const memory = await observe("/proc/meminfo: MemTotal and MemAvailable", async () =>
    parseMemory(await readFile("/proc/meminfo", { encoding: "utf8", signal: AbortSignal.timeout(timeoutMs) })),
  );
  const cpu = await observe("nproc", async () => parseCpu(await command("nproc", [])));
  const docker = await observe("docker version --format {{.Server.Version}}", async () => {
    const raw = (await command("docker", ["version", "--format", "{{.Server.Version}}"])).trim();
    if (!/^\d+\.\d+\.\d+[\w.+-]*$/.test(raw)) throw new Error("Invalid Docker version");
    return raw;
  });
  const compose = await observe("docker compose version --short", async () => {
    const raw = (await command("docker", ["compose", "version", "--short"])).trim();
    if (!/^v?\d+\.\d+\.\d+[\w.+-]*$/.test(raw)) throw new Error("Invalid Compose version");
    return raw;
  });
  const images: Inventory["images"] = {};
  for (const name of options.role === "miner" ? ["worker", "backend"] : ["node", "da"]) {
    const ref = options.images?.[name];
    images[name] = !ref
      ? unavailable(`docker image inspect: ${name}`, "No image reference supplied")
      : !isPinnedImage(ref)
        ? {
            source: `image argument: ${name}`,
            measuredAt: new Date().toISOString(),
            durationMs: 0,
            value: { pinned: false, digestPresent: false },
            reason: null,
          }
        : await observe(`docker image inspect: ${name} RepoDigests only`, async () => ({
            pinned: true,
            digestPresent: parseDigests(
              await command("docker", ["image", "inspect", "--format", "{{json .RepoDigests}}", ref]),
              ref,
            ),
          }));
  }
  const ports = [];
  for (const port of options.role === "miner"
    ? [80, 443, 8645]
    : [30333, ...(options.daPort ? [options.daPort] : [])]) {
    ports.push(
      options.skipPorts
        ? unavailable<{ port: number; bound: boolean }>(`loopback TCP ${port}`, "Port probes disabled")
        : await observe(`loopback TCP ${port}`, () => bindPort(port)),
    );
  }
  const clocks: Inventory["clocks"] = [];
  let models: Inventory["models"] = unavailable(modelsUrl, "Offline mode: catalogue not requested");
  let requests = 0;
  for (const url of [modelsUrl, clockUrl]) {
    if (options.offline) {
      clocks.push(unavailable(url, "Offline mode: HTTPS Date not requested"));
      continue;
    }
    requests++;
    const network = await observe(url, () => fetchPublic(url, url === modelsUrl ? "GET" : "HEAD"));
    const value = network.value;
    const clock = value && clockInterval(value.clock) ? value.clock : null;
    clocks.push({
      ...network,
      value: clock,
      reason: clock ? null : (network.reason ?? "Missing, cached or invalid HTTPS Date"),
    });
    if (url === modelsUrl) {
      try {
        models = { ...network, value: value ? parseModels(JSON.parse(value.raw) as unknown) : null };
      } catch {
        models = { ...network, value: null, reason: "Invalid model catalogue response" };
      }
    }
  }
  return { inventory: { os, gpu, disk, memory, cpu, docker, compose, images, ports, clocks, models }, requests };
}
