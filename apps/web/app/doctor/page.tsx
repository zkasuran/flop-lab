// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import miner from "../../../../packages/doctor/test/fixtures/example-miner.json";
import validator from "../../../../packages/doctor/test/fixtures/example-validator.json";
import type { Report } from "../../../../packages/doctor/src/types";
import { Doctor } from "./doctor";

export const metadata: Metadata = {
  title: "Operator doctor",
  description: "Check local FLOP operator readiness with sourced requirements and bounded read-only probes.",
};

export default function DoctorPage() {
  return <Doctor reports={{ miner: miner as Report, validator: validator as Report }} />;
}
