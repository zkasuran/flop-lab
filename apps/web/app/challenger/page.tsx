// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { challenger } from "./server";
import { pageData } from "./data";
import { Challenger } from "./challenger";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Challenge watcher",
  description:
    "Read the settlement clock, inspect public evidence and prepare a dry-run review dossier on FLOP devnet.",
};

export default async function ChallengerPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const snapshot = await challenger.read();
  const { channel } = await searchParams;
  const selected = typeof channel === "string" && channel.length > 0 ? channel : null;
  const reply = selected ? await challenger.dossier(snapshot, selected) : { dossier: null, error: null };
  return (
    <Challenger data={pageData(snapshot)} selected={selected} dossier={reply.dossier} dossierError={reply.error} />
  );
}
