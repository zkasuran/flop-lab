// SPDX-License-Identifier: Apache-2.0
"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type KeyboardEvent } from "react";
import type { SettlementTape } from "@/lib/evidence";
import { statusLabel } from "@/lib/status";
import { EASE_OUT, SwapValue } from "../motion";
import styles from "./home.module.css";

/** Group raw integer strings without converting them to floating point. Example: grouped("5220000") is "5,220,000". */
function grouped(value: string | null): string {
  if (value === null) return "missing";
  if (!/^\d+$/.test(value)) return value;
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function shortChannel(id: string | null): string {
  return id ? `${id.slice(0, 10)}…${id.slice(-6)}` : "unknown channel";
}

/**
 * Step through recorded settlements and read the escrow equation each one satisfies or breaks.
 * Values swap as a whole. Example: <SettlementSpecimen tape={readSettlementTape()} />.
 */
export function SettlementSpecimen({ tape }: { tape: SettlementTape }) {
  const reduced = useReducedMotion() !== false;
  const [index, setIndex] = useState(0);
  const ticks = useRef<(HTMLButtonElement | null)[]>([]);
  const row = tape.rows[index];
  if (!row) return <p className="muted">The recorded tape has no rows.</p>;
  const choose = (next: number) => {
    const target = (next + tape.rows.length) % tape.rows.length;
    setIndex(target);
    ticks.current[target]?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (event.key === "Home") choose(0);
    else if (event.key === "End") choose(tape.rows.length - 1);
    else if (step) choose(index + step);
    else return;
    event.preventDefault();
  };
  const lines = [
    { op: "", label: "minerPaid", value: row.minerPaid },
    { op: "+", label: "unusedEscrow", value: row.unusedEscrow },
    { op: "+", label: "burned", value: row.burned },
  ];
  return (
    <div className={styles.specimen}>
      <div className={styles.specimenBar}>
        <span className="mono">
          Settlement <SwapValue value={String(index + 1).padStart(2, "0")} /> of {tape.rows.length}
        </span>
        <span className="mono muted">
          Block <SwapValue value={row.block === null ? "unknown" : row.block.toLocaleString("en-US")} />
        </span>
        <span className="mono muted" title={row.channel ?? undefined}>
          <SwapValue value={shortChannel(row.channel)} />
        </span>
      </div>
      <div className={styles.equation}>
        <span className="sr-only">
          Settlement {index + 1} of {tape.rows.length}. Miner paid {grouped(row.minerPaid)}, plus unused escrow{" "}
          {grouped(row.unusedEscrow)}, plus burned {grouped(row.burned)}, equals {grouped(row.escrow)} escrow.
          Difference {row.difference ?? "unknown"}. Escrow conservation {statusLabel(row.conservation)}.
        </span>
        <div aria-hidden="true">
          {lines.map((line) => (
            <div className={styles.eqRow} key={line.label}>
              <span className={styles.eqOp}>{line.op}</span>
              <span className={styles.eqLabel}>{line.label}</span>
              <SwapValue className={styles.eqValue} value={grouped(line.value)} />
            </div>
          ))}
          <div className={styles.eqRule} />
          <div className={`${styles.eqRow} ${styles.eqTotal}`}>
            <span className={styles.eqOp}>=</span>
            <span className={styles.eqLabel}>escrow</span>
            <SwapValue className={styles.eqValue} value={grouped(row.escrow)} />
          </div>
        </div>
      </div>
      <div className={styles.verdict}>
        <span className="mono muted">
          difference <b className={styles.verdictValue}>{row.difference ?? "unknown"}</b> raw units
        </span>
        <span className={styles.statusChip} data-status={row.conservation}>
          Escrow {statusLabel(row.conservation)}
        </span>
        <span className={styles.statusChip} data-status={row.ratio}>
          Price ratio {statusLabel(row.ratio)}
        </span>
      </div>
      <div className={styles.tape} role="group" aria-label="Recorded settlements">
        <LayoutGroup id="tape">
          {tape.rows.map((item, position) => (
            <button
              key={`${item.channel ?? "row"}-${position}`}
              ref={(node) => {
                ticks.current[position] = node;
              }}
              type="button"
              className={styles.tick}
              tabIndex={position === index ? 0 : -1}
              aria-pressed={position === index}
              aria-label={`Settlement ${position + 1} of ${tape.rows.length}. Escrow ${statusLabel(item.conservation)}. Price ratio ${statusLabel(item.ratio)}.`}
              onClick={() => setIndex(position)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setIndex(position);
              }}
              onKeyDown={onKey}
            >
              <span className={styles.tickCheck} data-status={item.conservation} />
              <span className={styles.tickCheck} data-status={item.ratio} />
              {position === index && (
                <motion.span
                  layoutId="tape-cursor"
                  className={styles.tickCursor}
                  transition={{ duration: reduced ? 0 : 0.24, ease: EASE_OUT }}
                />
              )}
            </button>
          ))}
        </LayoutGroup>
      </div>
      <p className={styles.tapeCaption}>
        <span className="mono">
          {tape.pass} of {tape.checks}
        </span>{" "}
        arithmetic checks pass. <span className="mono">{tape.fail}</span> fail. Each tick is one settlement: escrow on
        top, price ratio below.
      </p>
    </div>
  );
}
