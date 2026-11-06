// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { initialConfig, recordedAddress, recordedReplay } from "./data";
import { WatchView } from "./view";
export const metadata: Metadata = {
  title: "Watcher",
  description: "Build local network alert rules and replay dated FLOP devnet observations.",
};
export default function WatchPage() {
  return <WatchView initial={recordedReplay(initialConfig)} address={recordedAddress} />;
}
