// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { readScoreboard, recordedHistory } from "./server";
import { Scoreboard } from "./scoreboard";

export const metadata: Metadata = {
  title: "Miner scoreboard",
  description:
    "Compare observed FLOP devnet settlement history. Inspect score terms, dated prices and miner routing decisions.",
};
export const revalidate = 60;

export default async function ScoreboardPage() {
  return <Scoreboard initial={await readScoreboard()} history={recordedHistory} evaluatedAt={Date.now()} />;
}
