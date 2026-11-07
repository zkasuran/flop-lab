// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { runChecks } from "../../../../packages/invariants/src/index";
import { Matrix } from "./matrix";

export const metadata: Metadata = {
  title: "Security invariants",
  description: "Read quoted security rules beside scoped suite checks and the evidence that public APIs do not expose.",
};

export default async function InvariantsPage() {
  return <Matrix initial={await runChecks()} />;
}
