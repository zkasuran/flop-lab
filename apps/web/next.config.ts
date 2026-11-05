// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import type { NextConfig } from 'next';

const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
})();

const config: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD_COMMIT: /^[a-f0-9]{40}$/.test(commit) ? commit : 'unknown' },
  experimental: { cpus: 2 },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
