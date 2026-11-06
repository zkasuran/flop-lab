// SPDX-License-Identifier: Apache-2.0
import { unstable_cache } from "next/cache";
import { recordings } from "../../../../packages/status/src/recorded";
import { readHistory } from "../../../../packages/status/src/remote";
export const pageHistory = unstable_cache(() => readHistory(recordings), ["service-status-history-v1"], {
  revalidate: 300,
});
