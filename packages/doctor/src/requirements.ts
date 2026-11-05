// SPDX-License-Identifier: Apache-2.0
import type { Source } from "./types.js";
const miner = "https://docs.flop.network/docs/run-miner";
const validator = "https://docs.flop.network/docs/run-validator";
const economics = "https://docs.flop.network/docs/miner-and-validator-economics";
const paper = "https://github.com/flop-labs/yellowpaper/blob/main/yellowpaper.md";
export const sources = {
  osMiner: {
    url: miner,
    locator: "Run a FLOP miner on a GPU host",
    quote: "The runnable path is both services on one Docker-capable NVIDIA VM or owned Linux host",
  },
  osValidator: {
    url: validator,
    locator: "Join the current devnet",
    quote: "follow its README on a dedicated Linux amd64 host",
  },
  gpu: {
    url: economics,
    locator: "Are H100s required?",
    quote: "The minimum miner spec is any GPU with at least 16GB of VRAM.",
  },
  gpuFit: {
    url: miner,
    locator: "Choose a host",
    quote: "Other NVIDIA cards may work if they fit the model, but each needs its own throughput and TOPLOC check.",
  },
  noGpu: { url: validator, locator: "Run a FLOP validator", quote: "No GPU or TEE is needed." },
  diskMiner: {
    url: miner,
    locator: "Choose a host",
    quote: "Enough disk for the exact checkpoint; persistent env, seed and worker volume",
  },
  profile: {
    url: paper,
    locator: "15.3 Duties and resource intensity",
    quote:
      "8 physical cores at\n≥3.4 GHz with SMT off, 32 GB ECC RAM, 4 TB enterprise NVMe (chain state plus DA custody",
  },
  guidance: {
    url: validator,
    locator: "Prepare the host",
    quote: "These are planning estimates, not measured devnet minimums.",
  },
  minerMemory: {
    url: economics,
    locator: "Recommended build for one or two RTX 5090s",
    quote: "64GB of system RAM for one card, 128GB for two; a 2TB NVMe drive",
  },
  minerCpu: {
    url: economics,
    locator: "Recommended build for one or two RTX 5090s",
    quote: "a 16-core CPU for two cards",
  },
  dockerMiner: {
    url: miner,
    locator: "Choose a host",
    quote: "Full VM or owned host with Docker, Compose, NVIDIA driver and Container Toolkit",
  },
  dockerValidator: {
    url: validator,
    locator: "Prepare the host",
    quote: "Use Linux with Docker Engine, the Docker Compose plugin",
  },
  imagesMiner: {
    url: miner,
    locator: "Operate and troubleshoot",
    quote:
      "For deployment, use the version-and-digest-qualified references from the operator's reviewed release bundle",
  },
  imagesValidator: {
    url: validator,
    locator: "Other networks and disposable rehearsals",
    quote: "Two pinned images from one release",
  },
  portsMiner: {
    url: miner,
    locator: "Set up with your agent",
    quote: "The DNS name must resolve to this host and inbound ports 80 and 443 must reach it.",
  },
  portsValidator: {
    url: validator,
    locator: "Join the current devnet",
    quote: "configuration uses private-network P2P TCP 30333 and host DA TCP 7000, mapped to container TCP 7000",
  },
  clock: {
    url: `${paper}#param-timing_max_clock_skew_ms`,
    locator: "Compute-channel timing bounds",
    quote:
      "Maximum clock skew (in ms) tolerated between miner and agent wall clocks when classifying timing as Eligible vs Ambiguous.",
  },
  calibration: {
    url: paper,
    locator: "7.1 Entry",
    quote: "The capacity deposit **MUST** be present before cap activation.",
  },
  admission: {
    url: validator,
    locator: "Join the current devnet",
    quote: "The existing devnet still needs operations approval, funding and promotion.",
  },
} satisfies Record<string, Source>;

// Sourced specification value, not a measurement of the deployed runtime.
export const timingMaxClockSkewMs = 250;
