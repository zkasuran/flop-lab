// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

const commit =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })();

const docsFiles = ["../../packages/*/package.json", "../../packages/*/README.md", "../../apps/web/README.md"];
const buildTime = new Date().toISOString();

const config: NextConfig = {
  poweredByHeader: false,
  // Pages that read package files at request time need those files in the deployed function.
  // The docs pages render per request so each response can carry its own CSP nonce.
  outputFileTracingIncludes: {
    "/SIGNATURE.json": ["../../SIGNATURE.json"],
    "/docs": docsFiles,
    "/docs/[package]": docsFiles,
    "/zh/docs": docsFiles,
    "/": docsFiles,
  },
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: /^[a-f0-9]{40}$/.test(commit) ? commit : "unknown",
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  experimental: { cpus: 2 },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};
export default config;
