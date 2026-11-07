// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { parseOptions, runChecks } from "../../../../packages/action/src/index";
import { ActionView } from "./view";

export const metadata: Metadata = {
  title: "CI checks",
  description: "Configure bounded FLOP evidence checks and inspect their dated recorded results.",
};

export default async function ActionPage() {
  const report = await runChecks(parseOptions({ checks: "tape,spec,contracts", mode: "recorded", maxRequests: "0" }));
  return <ActionView report={report} />;
}
