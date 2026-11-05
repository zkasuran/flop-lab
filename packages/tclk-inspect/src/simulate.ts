// SPDX-License-Identifier: Apache-2.0
import fixture from "../fixtures/simulations.json";
import type { SignedRecord } from "./model";
export const simulationPaths = fixture.cases.map((entry) => entry.path);
/** Return a detached rehearsal transcript. Example: simulate("wrong-preimage").records. */
export function simulate(path: string): {
  source: string;
  measuredAt: string;
  simulated: true;
  records: SignedRecord[];
} {
  const entry = fixture.cases.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`unknown path ${path}; choose ${simulationPaths.join(", ")}`);
  return {
    source: fixture.source,
    measuredAt: fixture.measuredAt,
    simulated: true,
    records: structuredClone(entry.records),
  };
}
