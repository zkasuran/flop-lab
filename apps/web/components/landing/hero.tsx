// SPDX-License-Identifier: Apache-2.0
import type { CSSProperties } from "react";
import type { Snapshot } from "@/lib/devnet";
import type { ClaimRun, SettlementTape } from "@/lib/evidence";
import { compareSample } from "@/lib/observation-view";
import { tools } from "@/content/tools";
import { Magnetic, MotionLink } from "../motion";
import { ArrowDown, ArrowRight } from "../icons";
import { Constellation } from "./constellation";
import { HeroStats, type HeroFigure } from "./hero-stats";
import styles from "./landing.module.css";

/**
 * The landing hero: the pitch, two actions, the live constellation and a strip of dated readings.
 * Example: <Hero snapshot={snapshot} tape={tape} run={run} />.
 */
export function Hero({ snapshot, tape, run }: { snapshot: Snapshot; tape: SettlementTape; run: ClaimRun | null }) {
  const available = tools.filter((tool) => tool.status !== "planned").length;
  const comparison = compareSample(snapshot.miners.value, snapshot.settlements.value);
  const figures: HeroFigure[] = [
    {
      label: "Arithmetic checks on the tape",
      value: `${tape.pass}/${tape.checks}`,
      note: `${tape.fail} failed`,
      recordedAt: tape.measuredAt,
      href: tape.recording,
    },
  ];
  if (run)
    figures.push({
      label: "Documented claims checked",
      value: String(run.claims.length),
      note: `${run.counts.FAIL} failed, ${run.counts.UNVERIFIABLE} unverifiable`,
      recordedAt: run.measuredAt,
      href: run.recording,
    });
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroField} aria-hidden="true">
        <span className={styles.orbA} />
        <span className={styles.orbB} />
        <span className={styles.heroGrid} />
      </div>
      <div className={styles.heroCopy}>
        <p className={styles.badge}>
          <span className={styles.badgeMark} aria-hidden="true" />
          Built on FLOP
          <span className={styles.badgeRule} aria-hidden="true" />
          <span className={styles.badgeSoft}>Independent devnet observatory</span>
        </p>
        <h1 id="hero-title" className={styles.heroTitle}>
          <span className="split-word">
            <span style={{ "--i": 0 } as CSSProperties}>See the network.</span>
          </span>
          <span className="split-word">
            <span className="signal-text" style={{ "--i": 1 } as CSSProperties}>
              Check it yourself.
            </span>
          </span>
        </h1>
        <p className={styles.heroLede}>
          Open tools that read the FLOP devnet in public. They show what holds, what fails and what is still unproven.
          No wallet, no key, no account.
        </p>
        <div className={styles.heroActions}>
          <Magnetic>
            <MotionLink className="button" href="/verify">
              Check a settlement <ArrowRight />
            </MotionLink>
          </Magnetic>
          <a className={styles.heroSecondary} href="#tools">
            Explore {available} tools <ArrowDown />
          </a>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <Constellation
          miners={snapshot.miners.value ?? []}
          settlements={(snapshot.settlements.value ?? []).map((row) => ({ miner: row.miner, channel: row.channel }))}
          block={snapshot.stats.value?.block ?? null}
        />
      </div>
      <HeroStats
        stats={snapshot.stats}
        renderedAt={snapshot.renderedAt}
        miners={{
          count: snapshot.miners.value?.length ?? null,
          inSample: comparison ? comparison.matches.length : null,
          observation: snapshot.miners,
        }}
        figures={figures}
      />
    </section>
  );
}
