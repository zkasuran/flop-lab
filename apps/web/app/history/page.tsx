// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { pageHistory } from "./data";
import { HistoryView } from "./view";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Network history",
  description: "Compare dated FLOP devnet snapshots, reset signals and conformance claim changes.",
};
export default async function HistoryPage() {
  const history = await pageHistory();
  return <HistoryView index={history.index} mode={history.mode} error={history.error} source={history.source} />;
}
