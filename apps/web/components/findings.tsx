// SPDX-License-Identifier: Apache-2.0
import { MotionLink, ObservedNumber, ReadingReveal } from "./motion";
import type { Snapshot } from "@/lib/devnet";
import { readRecording } from "@/app/harness/data";
import { counts } from "@/app/harness/model";
import { checkArithmetic } from "../../../packages/verifier/src/checks/index";
import { array, object } from "../../../packages/verifier/src/schema";
import tape from "../../../packages/verifier/fixtures/settlements-0.json";
import models from "../tests/fixtures/models.json";
import { parseModels } from "../../../packages/scoreboard/src/schema";

const rows = array(object(JSON.parse(tape.raw), "recorded tape").data, "settlements").slice(0, 20);
const checks = rows.flatMap((row) => checkArithmetic(row));
const prices = parseModels({
  kind: "models",
  source: models.source,
  measuredAt: models.measuredAt,
  raw: JSON.parse(models.raw),
});
const nominal = prices.length > 0 && prices.every((price) => price.source === "devnet-nominal");

function RecordedAt({ at, href, label }: { at: string; href: string; label: string }) {
  return (
    <p className="muted">
      <time dateTime={at}>{at.replace("T", " ").replace("Z", " UTC")}</time>
      <br />
      <MotionLink href={href}>{label} ↗</MotionLink>
    </p>
  );
}

/** Explain recorded results with the same inputs and checks as the tools. Example: <Findings snapshot={snapshot} />. */
export function Findings({ snapshot }: { snapshot: Snapshot }) {
  const report = readRecording();
  const outcomes = report ? counts(report.results) : null;
  return (
    <section className="section" aria-labelledby="findings-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">What we found so far</p>
          <h2 id="findings-heading">The arithmetic passes. The questions stay open.</h2>
        </div>
        <p className="muted">
          Dated observations from a disposable devnet. These samples describe what the tools saw at the times below.
        </p>
      </div>
      <div className="tool-grid">
        <ReadingReveal>
          <article className="tool-card">
            <h3>A settlement can add up.</h3>
            <p>
              <ObservedNumber value={rows.length} /> recorded settlements gave{" "}
              <ObservedNumber value={checks.filter((check) => check.status === "PASS").length} /> passing escrow and
              display-price checks. <ObservedNumber value={checks.filter((check) => check.status === "FAIL").length} />{" "}
              failed.
            </p>
            <p>
              That checks the arithmetic. Agreed pricing, transcript inclusion, hardware quotes and the exact challenge
              window still need evidence.
            </p>
            <RecordedAt
              at={tape.measuredAt}
              href="https://github.com/zkasuran/flop-lab/blob/main/packages/verifier/fixtures/settlements-0.json"
              label="Recorded MCP settlement page"
            />
            <MotionLink className="card-link" href="/verify">
              Check a settlement →
            </MotionLink>
          </article>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <article className="tool-card">
            <h3>A documented claim can fail.</h3>
            {report && outcomes ? (
              <>
                <p>
                  Of <ObservedNumber value={report.results.length} /> claims in a harness run,{" "}
                  <ObservedNumber value={outcomes.PASS} /> passed, <ObservedNumber value={outcomes.FAIL} /> failed,{" "}
                  <ObservedNumber value={outcomes.UNVERIFIABLE} /> could not be verified from outside and{" "}
                  <ObservedNumber value={outcomes.SKIPPED} /> were skipped.
                </p>
                <RecordedAt
                  at={report.measuredAt}
                  href="https://github.com/zkasuran/flop-lab/blob/main/packages/harness/last-run.json"
                  label="Recorded gateway and MCP checks"
                />
              </>
            ) : (
              <p>Recorded harness results are unavailable. Open the harness for its evidence.</p>
            )}
            <p>
              One failure is filed upstream:{" "}
              <MotionLink href="https://github.com/flop-labs/network/issues/87">
                a tool returns fields its own schema forbids ↗
              </MotionLink>
              .
            </p>
            <MotionLink className="card-link" href="/harness">
              Inspect the claims →
            </MotionLink>
          </article>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <article className="tool-card">
            <h3>A listed miner is not an uptime record.</h3>
            <p>
              The {snapshot.miners.stale ? "last-known" : "observed"} gateway response lists{" "}
              <ObservedNumber value={snapshot.miners.value?.length} /> price-source addresses. The map above shows which
              appear in the sampled settlements.
            </p>
            {snapshot.miners.measuredAt && (
              <RecordedAt
                at={snapshot.miners.measuredAt}
                href={snapshot.miners.source}
                label="Public gateway model list"
              />
            )}
            <p>
              {nominal
                ? "Every price source in the earlier recorded response was marked devnet-nominal."
                : "The earlier recorded response preserves the gateway's price-source labels."}{" "}
              A scoreboard can rank settlement evidence. It cannot rank uptime.
            </p>
            <RecordedAt
              at={models.measuredAt}
              href="https://github.com/zkasuran/flop-lab/blob/main/apps/web/tests/fixtures/models.json"
              label="Recorded price-source labels"
            />
            <MotionLink className="card-link" href="/scoreboard">
              Compare the evidence →
            </MotionLink>
          </article>
        </ReadingReveal>
      </div>
    </section>
  );
}
