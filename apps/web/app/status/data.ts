// SPDX-License-Identifier: Apache-2.0
import { unstable_cache } from "next/cache";
import { recordings } from "../../../../packages/status/src/recorded";
import { readHistory } from "../../../../packages/status/src/remote";
import { publicFetch } from "../../lib/security/transport";
export const pageHistory = unstable_cache(() => readHistory(recordings, publicFetch), ["service-status-history-v1"], {
  revalidate: 300,
});
