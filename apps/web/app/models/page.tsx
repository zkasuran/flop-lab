// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import recorded from "../../../../packages/models/test/fixtures/devnet.json";
import seedA from "../../../../packages/recorder/test/fixtures/seed/snapshots/2026/11/05/21-23-37.342Z-6d4ce0af9956856d65c2025259b7f6b4cd63e8b2897b5c6a6f3c141b225c7d81.json";
import seedB from "../../../../packages/recorder/test/fixtures/seed/snapshots/2026/11/05/21-24-20.273Z-bbf22ec5d76af626e448d855803f2e3eb1d3bd41444ce393a2927592b25c7f57.json";
import { catalogue } from "../../../../packages/models/src/catalogue";
import { loadPriceHistory, pricePoints } from "../../../../packages/models/src/history";
import { ModelsView } from "./view";

export const metadata: Metadata = {
  title: "Model registry",
  description:
    "Compare dated gateway listings with registry hashes. Inspect advertised sources, expiry checks and recorder quotes.",
};
const history = unstable_cache(loadPriceHistory, ["model-price-history-v1"], { revalidate: 300 });

export default async function ModelsPage() {
  const archive = await history();
  const fallback = archive.points.length === 0;
  return (
    <ModelsView
      report={catalogue(recorded)}
      history={{ ...archive, points: fallback ? await pricePoints([seedA, seedB]) : archive.points }}
      historyMode={fallback ? "Bundled recorder observations" : "Public recorder archive"}
      viewedAt={new Date().toISOString()}
    />
  );
}
