// SPDX-License-Identifier: Apache-2.0
import type { Snapshot } from "@/lib/devnet";
import type { ClaimRun, SettlementTape } from "@/lib/evidence";
import { compareSample } from "@/lib/observation-view";
import { Disclosure, MotionLink } from "../motion";
import { ArrowRight, ArrowUpRight } from "../icons";
import { OutcomeBar } from "../home/outcome-bar";
import { BlockHeading } from "./block-heading";
import styles from "./landing.module.css";

function day(at: string): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Three findings, one number each, with the limits one click away. The full evidence lives on /findings.
 * Example: <FindingsHighlights snapshot={snapshot} run={run} tape={tape} />.
 */
export function FindingsHighlights({
  snapshot,
  run,
  tape,
}: {
  snapshot: Snapshot;
  run: ClaimRun | null;
  tape: SettlementTape;
}) {
  const comparison = compareSample(snapshot.miners.value, snapshot.settlements.value);
  const addresses = snapshot.miners.value ?? [];
  const sampled = new Set(comparison?.matches ?? []);
  return (
    <section className={styles.block} aria-labelledby="highlights-title">
      <BlockHeading
        id="highlights-title"
        eyebrow="What the tools found"
        title={
          <>
            The arithmetic passes. <span className="signal-text">The questions stay open.</span>
          </>
        }
        lede="Dated observations from a disposable devnet. Each number links to the recording it came from."
        action={
          <MotionLink className="text-link" href="/findings">
            All findings and their evidence <ArrowRight />
          </MotionLink>
        }
      />
      <div className={styles.findings}>
        <article className={`${styles.finding} reveal`} data-spotlight>
          <p className="eyebrow">Settlement verifier</p>
          <p className={styles.findingNumber}>
            <span className="mono">{tape.pass}</span>
            <span className={styles.findingOf}>/ {tape.checks}</span>
          </p>
          <h3>Recorded settlements add up.</h3>
          <p className="muted">
            {tape.rows.length} recorded settlements gave {tape.pass} passing escrow and display-price checks.{" "}
            {tape.fail} failed.
          </p>
          <Disclosure title="What this does not prove">
            <p className={styles.limit}>
              It checks the arithmetic. Agreed pricing, transcript inclusion, hardware quotes and the exact challenge
              window still need evidence.
            </p>
          </Disclosure>
          <div className={styles.findingFoot}>
            <a className="source-chip" href={tape.recording}>
              Recorded <time dateTime={tape.measuredAt}>{day(tape.measuredAt)}</time> <ArrowUpRight size={12} />
            </a>
            <MotionLink className="text-link" href="/verify">
              Check a settlement <ArrowRight />
            </MotionLink>
          </div>
        </article>
        <article className={`${styles.finding} reveal`} data-spotlight>
          <p className="eyebrow">Conformance harness</p>
          {run ? (
            <>
              <p className={styles.findingNumber}>
                <span className="mono">{run.counts.FAIL}</span>
                <span className={styles.findingOf}>failed of {run.claims.length}</span>
              </p>
              <h3>A documented claim can fail.</h3>
              <OutcomeBar counts={run.counts} />
              <p className="muted">
                {run.counts.PASS} passed, {run.counts.UNVERIFIABLE} could not be verified from outside and{" "}
                {run.counts.SKIPPED} were skipped.
              </p>
              <Disclosure title="What this does not prove">
                <p className={styles.limit}>
                  A pass covers only the stated claim with the named inputs. Unverifiable means public data cannot
                  settle the claim either way.
                </p>
              </Disclosure>
              <div className={styles.findingFoot}>
                <a className="source-chip" href={run.recording}>
                  Recorded <time dateTime={run.measuredAt}>{day(run.measuredAt)}</time> <ArrowUpRight size={12} />
                </a>
                <MotionLink className="text-link" href="/harness">
                  Inspect the claims <ArrowRight />
                </MotionLink>
              </div>
            </>
          ) : (
            <p className="muted">Recorded harness results are unavailable. Open the harness for its evidence.</p>
          )}
        </article>
        <article className={`${styles.finding} reveal`} data-spotlight>
          <p className="eyebrow">Gateway price sources</p>
          <p className={styles.findingNumber}>
            <span className="mono">{addresses.length}</span>
            <span className={styles.findingOf}>
              {comparison ? `${comparison.matches.length} in the sample` : "sample unavailable"}
            </span>
          </p>
          <h3>A listed miner is not an uptime record.</h3>
          {addresses.length > 0 && (
            <div
              className={styles.dots}
              role="img"
              aria-label={`${addresses.length} price-source addresses. ${comparison ? `${comparison.matches.length} in the settlement sample.` : "Sample unavailable."}`}
            >
              {addresses.map((address) => (
                <span key={address} title={address} data-sampled={sampled.has(address)} />
              ))}
            </div>
          )}
          <p className="muted">
            The {snapshot.miners.stale ? "last-known" : "observed"} gateway response lists these addresses as price
            sources. A scoreboard can rank settlement evidence. It cannot rank uptime.
          </p>
          <div className={styles.findingFoot}>
            {snapshot.miners.measuredAt && (
              <a className="source-chip" href={snapshot.miners.source}>
                {snapshot.miners.stale ? "Last known" : "Observed"}{" "}
                <time dateTime={snapshot.miners.measuredAt}>{day(snapshot.miners.measuredAt)}</time>{" "}
                <ArrowUpRight size={12} />
              </a>
            )}
            <MotionLink className="text-link" href="/scoreboard">
              Compare the evidence <ArrowRight />
            </MotionLink>
          </div>
        </article>
      </div>
    </section>
  );
}
