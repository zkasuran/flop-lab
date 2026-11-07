// SPDX-License-Identifier: Apache-2.0
"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { ClaimRun, ClaimStatus } from "@/lib/evidence";
import { STATUS_ORDER, statusLabel } from "@/lib/status";
import { utc } from "@/app/harness/model";
import { EASE_OUT, MotionButton, MotionLink } from "../motion";
import { ArrowRight, ArrowUpRight } from "../icons";
import styles from "./home.module.css";

const PAGE_SIZE = 64;

/** Columns follow the CSS breakpoint so arrow keys move by visual rows. */
function useColumns() {
  const [columns, setColumns] = useState(16);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setColumns(query.matches ? 8 : 16);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return columns;
}

/**
 * One cell per documented claim in the recorded conformance run. Sorting moves cells, it never changes a result.
 * Example: <ClaimMatrix run={readClaimRun()!} />.
 */
export function ClaimMatrix({ run }: { run: ClaimRun }) {
  const reduced = useReducedMotion() !== false;
  const columns = useColumns();
  const [sorted, setSorted] = useState(false);
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<ClaimStatus | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const ordered = useMemo(
    () =>
      sorted ? STATUS_ORDER.flatMap((status) => run.claims.filter((claim) => claim.status === status)) : run.claims,
    [sorted, run.claims],
  );
  const position = useMemo(() => new Map(run.claims.map((claim, index) => [claim.id, index + 1])), [run.claims]);
  const activeId = hovered ?? selected;
  const active = run.claims.find((claim) => claim.id === activeId) ?? null;
  const total = run.claims.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * PAGE_SIZE;
  const visible = ordered.slice(start, start + PAGE_SIZE);
  const changePage = (next: number) => {
    setPage(next);
    setCursor(0);
    setSelected(null);
    setHovered(null);
  };

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape") {
      setSelected(null);
      return;
    }
    const last = visible.length - 1;
    const steps: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: last,
    };
    const next = steps[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = Math.max(0, Math.min(last, next));
    setCursor(target);
    cells.current[target]?.focus();
  };

  return (
    <div className={`${styles.matrixCard} frame`}>
      <div className={styles.matrixHead}>
        <div>
          <p className="eyebrow">Conformance harness / recorded run</p>
          <h2 className={styles.matrixTitle}>
            <span className="mono">{total}</span> documented claims, checked from outside.
          </h2>
        </div>
        <dl className={styles.matrixMeta}>
          <div>
            <dt>Requests</dt>
            <dd className="mono">{run.requests}</dd>
          </div>
          <div>
            <dt>FLOP spent</dt>
            <dd className="mono">{run.spentFlop}</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd className="mono">
              <time dateTime={run.measuredAt}>{utc(run.measuredAt).slice(0, 16)} UTC</time>
            </dd>
          </div>
        </dl>
        <span className="badge warning">Recorded / not live</span>
      </div>
      <div className={styles.matrixBody}>
        <div className={styles.matrixPane}>
          <div
            className={styles.matrix}
            role="group"
            aria-label={`Claims ${total ? start + 1 : 0} to ${start + visible.length} of ${total} from the recorded run`}
            aria-describedby="matrix-hint"
            onPointerLeave={() => setHovered(null)}
          >
            {visible.map((claim, index) => (
              <motion.button
                key={claim.id}
                ref={(node) => {
                  cells.current[index] = node;
                }}
                type="button"
                layout={!reduced}
                layoutDependency={`${sorted}:${currentPage}`}
                transition={{
                  layout: {
                    duration: reduced ? 0 : 0.48,
                    ease: EASE_OUT,
                    delay: reduced ? 0 : Math.min(index * 0.0016, 0.1),
                  },
                }}
                className={styles.cell}
                data-status={claim.status}
                data-dim={focus !== null && focus !== claim.status}
                data-active={activeId === claim.id}
                tabIndex={index === Math.min(cursor, visible.length - 1) ? 0 : -1}
                aria-label={`Claim ${position.get(claim.id)} of ${total}. ${claim.title}. ${claim.kind}. ${statusLabel(claim.status)}.`}
                onPointerEnter={() => setHovered(claim.id)}
                onFocus={() => {
                  setCursor(index);
                  setSelected(claim.id);
                }}
                onClick={() => setSelected(claim.id)}
                onKeyDown={(event) => move(event, index)}
              >
                <span className={styles.cellFace} style={{ "--i": position.get(claim.id) ?? 0 } as CSSProperties} />
              </motion.button>
            ))}
          </div>
          <div className={styles.matrixControls}>
            <div className={styles.segmented} role="group" aria-label="Cell order">
              <LayoutGroup id="matrix-order">
                {[
                  { value: false, label: "Catalogue order" },
                  { value: true, label: "By outcome" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={sorted === option.value}
                    onClick={() => {
                      setSorted(option.value);
                      changePage(0);
                    }}
                  >
                    {sorted === option.value && (
                      <motion.span
                        layoutId="matrix-order-pill"
                        className={styles.segmentPill}
                        transition={{ duration: reduced ? 0 : 0.26, ease: EASE_OUT }}
                      />
                    )}
                    <span>{option.label}</span>
                  </button>
                ))}
              </LayoutGroup>
            </div>
            <p className={styles.matrixHint} id="matrix-hint">
              One cell per claim. Arrow keys move between claims.
            </p>
            <div className={styles.segmented} role="group" aria-label="Claim pages">
              <MotionButton disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>
                Previous claims
              </MotionButton>
              <MotionButton disabled={currentPage === pages - 1} onClick={() => changePage(currentPage + 1)}>
                Next claims
              </MotionButton>
            </div>
            <p className={styles.matrixHint} role="status">
              Showing {total ? start + 1 : 0} to {start + visible.length} of {total}. Page {currentPage + 1} of {pages}.
            </p>
          </div>
        </div>
        <div className={styles.matrixSide}>
          <div className={styles.readout}>
            {active ? (
              <>
                <p className={styles.readoutMeta}>
                  <span className={styles.statusChip} data-status={active.status}>
                    {statusLabel(active.status)}
                  </span>
                  <span className="mono">
                    {active.kind} / claim {String(position.get(active.id)).padStart(2, "0")} of {total}
                  </span>
                </p>
                <p className={styles.readoutTitle}>{active.title}</p>
                <p className={styles.readoutReason}>{active.reason}</p>
              </>
            ) : (
              <>
                <p className={styles.readoutMeta}>
                  <span className="mono">Readout</span>
                </p>
                <p className={styles.readoutTitle}>Each cell is one claim from the public docs.</p>
                <p className={styles.readoutReason}>
                  Hover or focus a cell to read its result and reason. Unverifiable means public data cannot settle it.
                </p>
              </>
            )}
          </div>
          <div className={styles.legend} role="group" aria-label="Highlight one result">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                className={styles.legendItem}
                data-status={status}
                aria-pressed={focus === status}
                onClick={() => setFocus(focus === status ? null : status)}
              >
                <span className={styles.swatch} aria-hidden="true" />
                <span className="mono">{run.counts[status]}</span>
                <span>{statusLabel(status)}</span>
              </button>
            ))}
          </div>
          <div className={styles.cardFoot}>
            <MotionLink className="text-link" href="/harness">
              Inspect every claim <ArrowRight />
            </MotionLink>
            <MotionLink className={styles.quietLink} href={run.recording}>
              Raw recording <ArrowUpRight size={14} />
            </MotionLink>
          </div>
        </div>
      </div>
    </div>
  );
}
