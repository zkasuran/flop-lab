// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { pageHistory } from "../history/data";
import { initialObservation } from "./data";
import { FinalityView } from "./view";

export const revalidate = 15;
export const metadata: Metadata = {
  title: "Finality monitor",
  description: "Measure linked block times, inspect reported finality lag and follow dated recorder history.",
};
export default async function FinalityPage() {
  const [initial, history] = await Promise.all([initialObservation(), pageHistory()]);
  return (
    <FinalityView initial={initial} history={{ index: history.index, mode: history.mode, source: history.source }} />
  );
}
