// SPDX-License-Identifier: Apache-2.0
import { clockInterval } from "./parse.js";
import { sources as s, timingMaxClockSkewMs } from "./requirements.js";
import type { Evidence, Inventory, Report, Requirement, Role, Source, Status } from "./types.js";

/** Failures dominate missing evidence. Example: overall(["READY", "UNKNOWN"]) === "UNKNOWN". */
export function overall(statuses: Status[]): Status {
  return statuses.includes("NOT_READY")
    ? "NOT_READY"
    : statuses.length > 0 && statuses.every((s) => s === "READY")
      ? "READY"
      : "UNKNOWN";
}

/** Compare two independent coarse Date observations. Example: assessClock(inventory.clocks). */
export function assessClock(clocks: Inventory["clocks"]): { status: Status; detail: string } {
  const intervals = clocks.map((c) => (c.value ? clockInterval(c.value) : null));
  const distinct = new Set(
    clocks.map((c) => {
      try {
        return new URL(c.source).hostname;
      } catch {
        return "";
      }
    }),
  );
  if (intervals.length !== 2 || distinct.size !== 2 || distinct.has("") || intervals.some((i) => !i))
    return {
      status: "UNKNOWN",
      detail: "Need uncached Date headers from two distinct public HTTPS hosts. This is not an NTP measurement.",
    };
  const valid = intervals as [number, number][];
  const sameSide =
    valid.every(([low]) => low > timingMaxClockSkewMs) || valid.every(([, high]) => high < -timingMaxClockSkewMs);
  const overlap = Math.max(...valid.map(([low]) => low)) <= Math.min(...valid.map(([, high]) => high));
  return {
    status: sameSide && overlap ? "NOT_READY" : "UNKNOWN",
    detail: `Server minus local intervals: ${valid.map(([low, high]) => `[${low}, ${high}] ms`).join("; ")}. Spec timing_max_clock_skew_ms = ${timingMaxClockSkewMs} ms. HTTP Date has second precision and cannot certify this bound or the miner-agent clock difference. ${sameSide && overlap ? "Both hosts indicate an offset outside the bound. Check time synchronization." : "No precise clock verdict. Check time synchronization."}`,
  };
}

/** Evaluate sourced host preflight, not on-chain admission. Example: evaluate("validator", inventory). */
export function evaluate(role: Role, i: Inventory): Requirement[] {
  const rows: Requirement[] = [];
  const add = (
    id: string,
    title: string,
    status: Status,
    detail: string,
    source: Source,
    evidence: Evidence<unknown>[] = [],
  ) => rows.push({ id, title, status, detail, source, evidence });
  const os = i.os.value;
  add(
    "os",
    "Supported host OS",
    !os ? "UNKNOWN" : os.platform === "linux" && os.arch === "x64" ? "READY" : "NOT_READY",
    os ? `${os.platform}/${os.arch}. This profile checks the documented Linux amd64 deployment path.` : i.os.reason!,
    role === "miner" ? s.osMiner : s.osValidator,
    [i.os],
  );
  if (role === "miner") {
    const gpu = i.gpu.value;
    add(
      "gpu",
      "GPU participation floor",
      gpu === null ? "UNKNOWN" : gpu.some((g) => g.totalBytes >= 16_000_000_000) ? "READY" : "NOT_READY",
      gpu === null
        ? i.gpu.reason!
        : `${gpu.length} NVIDIA device(s). ${gpu.map((g) => `${g.name}: ${g.totalBytes} total bytes, ${g.freeBytes} free bytes`).join("; ")}. Compare each device with the quoted 16 GB floor using decimal GB. Memory is not pooled.`,
      s.gpu,
      [i.gpu],
    );
    add(
      "model-fit",
      "Exact model fit and TOPLOC",
      "UNKNOWN",
      `Catalogue: ${i.models.value?.join(", ") || "no data"}. No exact checkpoint, KV cache budget or runtime memory measurement was supplied. A GPU name or aggregate VRAM does not establish fit.`,
      s.gpuFit,
      [i.gpu, i.models],
    );
    add(
      "cpu",
      "CPU guidance",
      "UNKNOWN",
      `${i.cpu.value ?? "Unknown"} available logical processors. The quoted recommendation is specific to two RTX 5090 cards, not a generic minimum.`,
      s.minerCpu,
      [i.cpu],
    );
    add(
      "ram",
      "RAM guidance",
      "UNKNOWN",
      `${i.memory.value?.totalBytes ?? "Unknown"} total bytes; ${i.memory.value?.availableBytes ?? "unknown"} available bytes. The quoted guidance is for RTX 5090 builds. Generic miner RAM minimum is unspecified.`,
      s.minerMemory,
      [i.memory],
    );
  } else {
    add(
      "gpu",
      "GPU requirement",
      "READY",
      "Validators do not need a GPU. GPU probe failures do not fail this requirement.",
      s.noGpu,
    );
    add(
      "cpu",
      "Validator CPU reference",
      i.cpu.value === null ? "UNKNOWN" : i.cpu.value < 8 ? "NOT_READY" : "UNKNOWN",
      `${i.cpu.value ?? "Unknown"} available logical processors. Reference: 8 physical cores at 3.4 GHz with SMT off. nproc cannot verify dedicated cores, SMT or sustained frequency. This is a production reference, not a measured devnet minimum.`,
      s.profile,
      [i.cpu],
    );
    add(
      "ram",
      "Validator RAM reference",
      i.memory.value === null ? "UNKNOWN" : i.memory.value.totalBytes < 32_000_000_000 ? "NOT_READY" : "UNKNOWN",
      `${i.memory.value?.totalBytes ?? "Unknown"} total bytes; ${i.memory.value?.availableBytes ?? "unknown"} available bytes. Reference: 32 GB ECC. ECC is not observable through meminfo. This is a production reference, not a measured devnet minimum.`,
      s.profile,
      [i.memory],
    );
  }
  add(
    "disk",
    role === "miner" ? "Checkpoint disk capacity" : "Validator storage reference",
    "UNKNOWN",
    `${i.disk.value?.totalBytes ?? "Unknown"} filesystem capacity bytes; ${i.disk.value?.availableBytes ?? "unknown"} available bytes at the selected path. df does not measure installed device capacity or NVMe quality. ${role === "validator" ? "The 4 TB reference includes chain state and DA custody; the source does not specify whether this means free or installed space." : "Required space depends on the exact checkpoint plus headroom. Neither checkpoint allocation nor persistence is verified."}`,
    role === "miner" ? s.diskMiner : s.profile,
    [i.disk],
  );
  for (const [id, evidence] of [
    ["docker", i.docker],
    ["compose", i.compose],
  ] as const)
    add(
      id,
      id === "docker" ? "Docker daemon access" : "Docker Compose availability",
      evidence.value ? "READY" : "UNKNOWN",
      evidence.value ? `Observed version ${evidence.value}. No container was started.` : evidence.reason!,
      role === "miner" ? s.dockerMiner : s.dockerValidator,
      [evidence],
    );
  if (role === "miner")
    add(
      "container-gpu",
      "GPU inside the runtime",
      "UNKNOWN",
      "Host nvidia-smi does not verify NVIDIA Container Toolkit or GPU visibility inside the backend. No container was started.",
      s.dockerMiner,
      [i.gpu],
    );
  for (const name of role === "miner" ? ["worker", "backend"] : ["node", "da"]) {
    const evidence = i.images[name];
    const value = evidence?.value;
    add(
      `image-${name}`,
      `${name} image pin and local digest`,
      !value ? "UNKNOWN" : value.pinned && value.digestPresent ? "READY" : "NOT_READY",
      !value
        ? (evidence?.reason ?? "No image evidence")
        : value.pinned && value.digestPresent
          ? "Versioned sha256 pin matches a locally installed RepoDigest. Release approval and image contents are not verified."
          : "A versioned sha256 pin and matching local RepoDigest are required. No image was pulled.",
      role === "miner" ? s.imagesMiner : s.imagesValidator,
      evidence ? [evidence] : [],
    );
  }
  add(
    "ports",
    "Local port binding",
    "UNKNOWN",
    `${i.ports.map((p) => `${p.source}: ${p.value?.bound ? "bind succeeded and closed" : p.reason}`).join("; ") || "No role-specific port bind was recorded"}. Binding tests availability only. A busy port can already belong to the intended service. It does not prove firewall, NAT or ingress. ${role === "validator" ? "DA port is release-specific: 7000 in the old devnet profile and 7001 in the prepared profile. Select --da-port only from your approved release." : "Public HTTPS can use your own tunnel; raw worker port 8645 stays on loopback."}`,
    role === "miner" ? s.portsMiner : s.portsValidator,
    i.ports,
  );
  add(
    "reachability",
    "Inbound peer reachability",
    "UNKNOWN",
    role === "miner"
      ? "Run the external HTTPS command from a second host after deployment. An unauthenticated 401 shows the session path, not admission."
      : "Run TCP checks from an authorized peer outside this machine. Local binding cannot prove peer-route reachability. Keep RPC and metrics private.",
    role === "miner" ? s.portsMiner : s.portsValidator,
  );
  const clock = assessClock(i.clocks);
  add("clock", "Clock offset diagnostic", clock.status, clock.detail, s.clock, i.clocks);
  add(
    "admission",
    role === "miner" ? "Registration and calibration" : "Devnet activation",
    "UNKNOWN",
    role === "miner"
      ? "Hardware readiness does not establish stake, accepted calibration, model identity, DA retention or paid-session admission."
      : "Host checks do not establish release availability, funding, registration, promotion, live session keys or advancing finality.",
    role === "miner" ? s.calibration : s.admission,
  );
  return rows;
}

/** Exact second-host commands with placeholders. Example: externalCommands("miner"). */
export function externalCommands(role: Role): string {
  return role === "miner"
    ? "curl --connect-timeout 5 --max-time 10 -sS -o /dev/null -w '%{http_code}\\n' 'https://REPLACE_WITH_PUBLIC_DNS/session/info'"
    : "nc -vz -w 5 REPLACE_WITH_PEER_HOST 30333\nnc -vz -w 5 REPLACE_WITH_PEER_HOST REPLACE_WITH_APPROVED_DA_PORT";
}

/** Render the same sourced result as Markdown or readable terminal text. Example: markdown(report). */
export function markdown(report: Report): string {
  const escape = (text: string) => text.replace(/[<>`]/g, "").replace(/[\r\n]+/g, " ");
  return (
    [
      `# FLOP ${report.role} preflight: ${report.status}`,
      `Measured: ${report.measuredAt}. Read-only local evidence.`,
      ...report.requirements.map(
        (r) =>
          `\n## ${r.status}: ${r.title}\n${escape(r.detail)}\n\nSource: [${r.source.locator}](${r.source.url})\n> ${escape(r.source.quote)}\n\nProbe records: ${r.evidence.map((e) => `${e.source} at ${e.measuredAt}${e.reason ? `: ${escape(e.reason)}` : ""}`).join("; ") || "No local probe can establish this requirement."}`,
      ),
      "\n## From a second host",
      `\`\`\`sh\n${externalCommands(report.role)}\n\`\`\``,
      "\nREADY applies only to the named check. Overall NOT_READY dominates UNKNOWN; UNKNOWN dominates READY. This report does not certify network admission.",
    ].join("\n\n") + "\n"
  );
}

/** Draft the public access form without host details unless present by explicit opt-in. Example: accessRequest(report). */
export function accessRequest(report: Report): string {
  return `# Access request draft\n\nTemplate: https://github.com/flop-labs/network/issues/new?template=access.yml\n\n### Request\nother\n\n### Network\ndevnet\n\n### Public identifiers\n${report.host ? `Hostname: ${report.host}\n` : "Host details omitted.\n"}Add the relevant public SS58 address manually.\n\n### Details\nRole: ${report.role}.\nDescribe the specific operator action you need. This draft does not request access automatically. Devnet miner sponsorship does not need a request while automatic sponsorship has room.\n\n${markdown(report)}`;
}
