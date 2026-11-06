// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedReport } from "../../../../packages/metering/src/recorded";
import { parameters, rules } from "../../../../packages/metering/src/rules";
import { MeteringBoard } from "./board";
export const metadata: Metadata = {
  title: "Metering and calibration",
  description:
    "Calculate declared reference work, inspect renewable calibration windows and see dated public evidence gaps.",
};
export default function MeteringPage() {
  return <MeteringBoard report={recordedReport()} parameters={parameters} rules={rules} />;
}
