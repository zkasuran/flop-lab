// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { collectTrail, DEFAULT_DID } from "../../../../packages/did/src/trail";
import { recordedReader } from "../../../../packages/did/src/recorded";
import { TrailBoard } from "./trail-board";

export const metadata: Metadata = {
  title: "DID trail",
  description:
    "Follow signed FLOP contributions. Check exact artifact bytes in your browser and see what the sources cannot prove.",
};
export const revalidate = 3600;

export default async function DidPage() {
  return <TrailBoard initial={await collectTrail(DEFAULT_DID, recordedReader)} />;
}
