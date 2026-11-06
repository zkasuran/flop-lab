// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { offences, parameters, recordedReport } from "../../../../packages/staking/src/recorded";
import { StakeBuilder } from "./builder";

export const metadata: Metadata = {
  title: "Staking",
  description: "Build a quoted miner stake scenario. Inspect dated balances, unbonding periods and slashing exposure.",
};

export default function StakingPage() {
  const report = recordedReport();
  return (
    <StakeBuilder
      parameters={parameters}
      offences={offences}
      report={{ ...report, sources: report.sources.map(({ source, measuredAt }) => ({ source, measuredAt })) }}
    />
  );
}
