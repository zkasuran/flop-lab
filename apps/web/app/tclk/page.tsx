// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { inspectTranscript } from "../../../../packages/tclk-inspect/src/inspect";
import { simulate } from "../../../../packages/tclk-inspect/src/simulate";
import { parseHtlcs } from "../../../../packages/tclk-inspect/src/chain";
import recorded from "../../../../packages/tclk-inspect/fixtures/htlcs.json";
import check from "../../../../packages/tclk-inspect/fixtures/check-observed.json";
import { Workbench } from "./workbench";

export const metadata: Metadata = {
  title: "Deal inspector",
  description: "Replay signed TCLK agent deals. Inspect the first protocol violation and dated HTLC observations.",
};
export default function TclkPage() {
  return (
    <Workbench
      initial={inspectTranscript(simulate("wrong-preimage"), "synthetic wrong-preimage rehearsal")}
      chain={{
        rows: parseHtlcs(JSON.parse(recorded.raw)),
        measuredAt: recorded.measuredAt,
        source: recorded.source,
        query: recorded.query,
        check: check.raw,
        checkedAt: check.measuredAt,
      }}
    />
  );
}
