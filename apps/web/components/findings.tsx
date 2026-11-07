// SPDX-License-Identifier: Apache-2.0
import { MotionLink, ObservedNumber, ReadingReveal } from "./motion";
import type { Snapshot } from "@/lib/devnet";
import type { ClaimRun, SettlementTape } from "@/lib/evidence";
import { compareSample } from "@/lib/observation-view";
import { statusLabel } from "@/lib/status";
import { repository } from "@/content/tools";
import models from "../tests/fixtures/models.json";
import { parseModels } from "../../../packages/scoreboard/src/schema";
import { ArrowRight, ArrowUpRight } from "./icons";
import { OutcomeBar } from "./home/outcome-bar";
import { SectionHeading } from "./home/section-heading";
import { SettlementSpecimen } from "./home/settlement-specimen";
import styles from "./home/home.module.css";

const prices = parseModels({
  kind: "models",
  source: models.source,
  measuredAt: models.measuredAt,
  raw: JSON.parse(models.raw),
});
const nominal = prices.length > 0 && prices.every((price) => price.source === "devnet-nominal");

function RecordedAt({ at, href, label }: { at: string; href: string; label: string }) {
  return (
    <p className={styles.recorded}>
      <time className="mono" dateTime={at}>
        {at.replace("T", " ").replace("Z", " UTC")}
      </time>
      <MotionLink href={href}>
        {label} <ArrowUpRight size={13} />
      </MotionLink>
    </p>
  );
}

/** Explain recorded results with the same inputs and checks as the tools. Example: <Findings snapshot={snapshot} run={run} tape={tape} />. */
export function Findings({ snapshot, run, tape }: { snapshot: Snapshot; run: ClaimRun | null; tape: SettlementTape }) {
  const comparison = compareSample(snapshot.miners.value, snapshot.settlements.value);
  const addresses = snapshot.miners.value ?? [];
  const sampled = new Set(comparison?.matches ?? []);
  const failures = run?.claims.filter((claim) => claim.status === "FAIL") ?? [];
  return (
    <section className="section" id="findings" aria-labelledby="findings-heading">
      <SectionHeading
        index="01"
        eyebrow="What we found so far"
        id="findings-heading"
        title="Three findings, each dated."
      >
        Dated observations from a disposable devnet. These samples describe what the tools saw at the times below.
      </SectionHeading>
      <div className={styles.bento}>
        <ReadingReveal className={styles.bentoWide}>
          <article className={`${styles.finding} ${styles.findingSplit} frame`}>
            <div className={styles.findingCopy}>
              <p className="eyebrow">Settlement verifier / recorded tape</p>
              <h3>A settlement can add up.</h3>
              <p className="muted">
                <ObservedNumber value={tape.rows.length} /> recorded settlements gave{" "}
                <ObservedNumber value={tape.pass} /> passing escrow and display-price checks.{" "}
                <ObservedNumber value={tape.fail} /> failed.
              </p>
              <p className="muted">
                That checks the arithmetic. Agreed pricing, transcript inclusion, hardware quotes and the exact
                challenge window still need evidence.
              </p>
              <div className={styles.findingFoot}>
                <RecordedAt at={tape.measuredAt} href={tape.recording} label="Recorded MCP settlement page" />
                <MotionLink className="text-link" href="/verify">
                  Check a settlement <ArrowRight />
                </MotionLink>
              </div>
            </div>
            <SettlementSpecimen tape={tape} />
          </article>
        </ReadingReveal>
        <ReadingReveal order={1} className={styles.bentoSide}>
          <article className={`${styles.finding} frame`}>
            <p className="eyebrow">Conformance harness / recorded run</p>
            <h3>A documented claim can fail.</h3>
            {run ? (
              <>
                <p className="muted">
                  Of <ObservedNumber value={run.claims.length} /> claims in a harness run,{" "}
                  <ObservedNumber value={run.counts.PASS} /> passed, <ObservedNumber value={run.counts.FAIL} /> failed,{" "}
                  <ObservedNumber value={run.counts.UNVERIFIABLE} /> could not be verified from outside and{" "}
                  <ObservedNumber value={run.counts.SKIPPED} /> were skipped.
                </p>
                <OutcomeBar counts={run.counts} />
                <ul className={styles.failList}>
                  {failures.map((claim) => (
                    <li key={claim.id}>
                      <span className={styles.statusChip} data-status={claim.status}>
                        {statusLabel(claim.status)}
                      </span>
                      <span>
                        <code>{claim.title}</code>
                        <span className="muted">{claim.reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Recorded harness results are unavailable. Open the harness for its evidence.</p>
            )}
            <p className="muted">
              One failure is filed upstream:{" "}
              <MotionLink href="https://github.com/flop-labs/network/issues/87">
                a tool returns fields its own schema forbids <ArrowUpRight size={13} />
              </MotionLink>
            </p>
            <div className={styles.findingFoot}>
              {run && <RecordedAt at={run.measuredAt} href={run.recording} label="Recorded gateway and MCP checks" />}
              <MotionLink className="text-link" href="/harness">
                Inspect the claims <ArrowRight />
              </MotionLink>
            </div>
          </article>
        </ReadingReveal>
        <ReadingReveal order={2} className={styles.bentoSide}>
          <article className={`${styles.finding} frame`}>
            <p className="eyebrow">Gateway / price sources</p>
            <h3>A listed miner is not an uptime record.</h3>
            <p className="muted">
              The {snapshot.miners.stale ? "last-known" : "observed"} gateway response lists{" "}
              <ObservedNumber value={snapshot.miners.value?.length} /> price-source addresses.{" "}
              {comparison ? (
                <>
                  <ObservedNumber value={comparison.matches.length} /> of them appear in the sampled settlement page.
                </>
              ) : (
                "The settlement sample is unavailable for comparison."
              )}
            </p>
            {addresses.length > 0 && (
              <div
                className={styles.addressDots}
                role="img"
                aria-label={`${addresses.length} price-source addresses. ${comparison ? `${comparison.matches.length} in the settlement sample.` : "Sample unavailable."}`}
              >
                {addresses.map((address) => (
                  <span key={address} title={address} data-sampled={sampled.has(address)} />
                ))}
              </div>
            )}
            <p className="muted">
              {nominal
                ? "Every price source in the earlier recorded response was marked devnet-nominal."
                : "The earlier recorded response preserves the gateway's price-source labels."}{" "}
              A scoreboard can rank settlement evidence. It cannot rank uptime.
            </p>
            <div className={styles.findingFoot}>
              {snapshot.miners.measuredAt && (
                <RecordedAt
                  at={snapshot.miners.measuredAt}
                  href={snapshot.miners.source}
                  label="Public gateway model list"
                />
              )}
              <RecordedAt
                at={models.measuredAt}
                href={`${repository}/blob/main/apps/web/tests/fixtures/models.json`}
                label="Recorded price-source labels"
              />
              <MotionLink className="text-link" href="/scoreboard">
                Compare the evidence <ArrowRight />
              </MotionLink>
            </div>
          </article>
        </ReadingReveal>
      </div>
    </section>
  );
}
