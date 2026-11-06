// SPDX-License-Identifier: Apache-2.0
import type { SettlementTape, TapeRow } from "@/lib/evidence";
import { statusLabel } from "@/lib/status";
import { ArrowUpRight } from "../icons";
import styles from "./landing.module.css";

function shortChannel(id: string | null): string {
  return id ? `${id.slice(0, 8)}…${id.slice(-6)}` : "unknown channel";
}

function Item({ row }: { row: TapeRow }) {
  return (
    <li className={styles.tickerItem}>
      <span className={styles.tickerBlock}>
        <span className={styles.tickerLabel}>Block</span>
        <span className="mono">{row.block === null ? "unknown" : row.block.toLocaleString("en-US")}</span>
      </span>
      <span className={`mono ${styles.tickerChannel}`} title={row.channel ?? undefined}>
        {shortChannel(row.channel)}
      </span>
      <span className={styles.tickerChip} data-status={row.conservation}>
        Escrow {statusLabel(row.conservation)}
      </span>
      <span className={styles.tickerChip} data-status={row.ratio}>
        Price {statusLabel(row.ratio)}
      </span>
    </li>
  );
}

/**
 * The recorded settlement tape as a slow ticker. Each item is one recorded settlement with the verifier's two
 * arithmetic results. It pauses on hover and focus. Reduced motion shows a scrollable row.
 * Example: <SettlementTicker tape={readSettlementTape()} />.
 */
export function SettlementTicker({ tape }: { tape: SettlementTape }) {
  if (!tape.rows.length) return null;
  return (
    <section className={styles.ticker} aria-labelledby="ticker-title">
      <div className={`${styles.tickerHead} container`}>
        <h2 id="ticker-title" className="eyebrow">
          Recorded settlement tape / {tape.rows.length} settlements
        </h2>
        <a className="source-chip" href={tape.recording}>
          Recorded <time dateTime={tape.measuredAt}>{tape.measuredAt.slice(0, 16).replace("T", " ")} UTC</time>
          <ArrowUpRight size={12} />
        </a>
      </div>
      <div className={styles.tickerViewport} role="region" tabIndex={0} aria-label="Recorded settlements">
        <ul className={styles.tickerTrack}>
          {tape.rows.map((row, index) => (
            <Item key={`${row.channel ?? "row"}-${index}`} row={row} />
          ))}
        </ul>
        <ul className={`${styles.tickerTrack} ${styles.tickerCopy}`} aria-hidden="true">
          {tape.rows.map((row, index) => (
            <Item key={`copy-${row.channel ?? "row"}-${index}`} row={row} />
          ))}
        </ul>
      </div>
    </section>
  );
}
