// SPDX-License-Identifier: Apache-2.0
import { getCachedSnapshot } from "@/lib/devnet-server";
import { readClaimRun, readPromiseLedger, readSettlementTape } from "@/lib/evidence";
import { languageMetadata } from "./routes";
import { home } from "./translations/home";
import { ChineseHome } from "./home-view";

export const revalidate = 30;
export const metadata = { ...languageMetadata("/", "zh"), title: home.zh.subtitle, description: home.zh.intro };
export default async function Page() {
  const snapshot = await getCachedSnapshot();
  const run = readClaimRun();
  const tape = readSettlementTape();
  const ledger = await readPromiseLedger(run);
  return <ChineseHome snapshot={snapshot} run={run} tape={tape} ledger={ledger} />;
}
