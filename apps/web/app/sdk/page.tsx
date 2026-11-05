// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { readReport } from "./data";
import { Workbench } from "./workbench";

export const metadata: Metadata = {
  title: "SDK conformance",
  description:
    "Check published FLOP SDK behaviour against documented expectations. Inspect offline request traces and copy a reproduction.",
};

export default function SdkPage() {
  return <Workbench report={readReport()} />;
}
