// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shell } from "@/app/zh/translations/shell";
import type { Observation, Stats } from "@/lib/devnet";
import { age, isStale } from "@/lib/observation-view";
import { SwapValue } from "../motion";
import { pathLocale } from "./locale";
import styles from "./header.module.css";

type Pulse = { stats: Observation<Stats>; renderedAt: string };

function text(value: unknown, max = 400): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Validate the same-origin pulse response before it reaches the page. Example: parsePulse(await response.json()). */
export function parsePulse(input: unknown): Pulse | null {
  if (!input || typeof input !== "object") return null;
  const { stats, renderedAt } = input as Record<string, unknown>;
  if (!stats || typeof stats !== "object" || !text(renderedAt)) return null;
  const observation = stats as Record<string, unknown>;
  const raw = observation.value as Record<string, unknown> | null | undefined;
  const block = raw ? count(raw.block) : null;
  const accounts = raw ? count(raw.accounts) : null;
  const measuredAt = text(observation.measuredAt);
  if (measuredAt && !Number.isFinite(Date.parse(measuredAt))) return null;
  return {
    renderedAt: text(renderedAt)!,
    stats: {
      value: block !== null && accounts !== null ? { block, accounts } : null,
      measuredAt,
      source: text(observation.source) ?? "unknown source",
      stale: observation.stale !== false,
      error: text(observation.error),
    },
  };
}

const PULSE_MS = 30_000;
const STORE = "flop-pulse";

/** The last valid reading in this tab, re-validated on read. Storage is optional. Example: recall()?.pulse. */
function recall(): { at: number; pulse: Pulse } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as { at?: unknown; pulse?: unknown } | null;
    const pulse = parsePulse(saved?.pulse);
    const at = saved?.at;
    return pulse && typeof at === "number" && Number.isFinite(at) && at <= Date.now() ? { at, pulse } : null;
  } catch {
    return null;
  }
}
function remember(pulse: Pulse) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ at: Date.now(), pulse }));
  } catch {
    /* Storage is optional. */
  }
}

/**
 * The latest devnet block as a header reading. It reads at most once every 30 seconds per tab, reuses that reading
 * across page loads and skips requests while hidden. A failed read keeps the last value, labelled last known.
 * It is a dated observation, not a liveness claim. Example: <LiveBlock />.
 */
export function LiveBlock({ className }: { className?: string }) {
  const { locale } = pathLocale(usePathname());
  const t = shell[locale];
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let timer: number | undefined;
    // A reading hidden by the layout, such as the header's on a phone, never spends the request budget.
    const shown = () => ref.current !== null && ref.current.getClientRects().length > 0;
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void read(), Math.max(1000, ms));
    };
    const read = async () => {
      if (document.hidden || !shown()) return schedule(PULSE_MS);
      const kept = recall();
      if (kept && Date.now() - kept.at < PULSE_MS) {
        // A page load inside the refresh window reuses the last reading instead of asking again.
        if (active) {
          setPulse(kept.pulse);
          setFailed(false);
          setNow(Date.now());
        }
        return schedule(PULSE_MS - (Date.now() - kept.at));
      }
      controller?.abort();
      controller = new AbortController();
      let wait = PULSE_MS;
      try {
        const response = await fetch("/api/pulse", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) {
          const retry = Number(response.headers.get("retry-after"));
          if (Number.isFinite(retry) && retry > 0) wait = Math.max(wait, retry * 1000);
          throw new Error(`Pulse HTTP ${response.status}`);
        }
        const next = parsePulse(await response.json());
        if (!next) throw new Error("Invalid pulse");
        remember(next);
        if (active) {
          setPulse(next);
          setFailed(false);
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        // Keep the last reading on screen, labelled last known, rather than blanking it.
        const fallback = recall();
        if (active) {
          if (fallback) setPulse(fallback.pulse);
          setFailed(true);
        }
      }
      if (active) setNow(Date.now());
      schedule(wait);
    };
    void read();
    const onVisible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const block = pulse?.stats.value?.block;
  const stale = !pulse || failed || isStale(pulse.stats, now);
  const state = block === undefined ? (failed ? "Unavailable" : "Reading") : stale ? "Last known" : "Observed";
  const label =
    block === undefined
      ? failed
        ? "Devnet block unavailable. Open the network page."
        : "Reading the latest devnet block. Open the network page."
      : `${state} devnet block ${block.toLocaleString("en-US")}, ${age(pulse?.stats.measuredAt ?? null, now)}. Open the network page.`;
  return (
    <Link
      ref={ref}
      href="/network"
      prefetch={false}
      className={className ? `${styles.live} ${className}` : styles.live}
      data-stale={stale}
      data-ready={block !== undefined}
      aria-label={label}
      title={pulse ? `${state} / ${age(pulse.stats.measuredAt, now)} / ${pulse.stats.source}` : undefined}
    >
      <span className="status-dot" aria-hidden="true" />
      <span className={styles.liveState} aria-hidden="true">
        {state === "Unavailable" ? t.blockUnavailable : state === "Last known" ? t.lastKnown : t.block}
      </span>
      {block !== undefined ? (
        <span className={`mono ${styles.liveValue}`} aria-hidden="true">
          <SwapValue value={block.toLocaleString("en-US")} />
        </span>
      ) : state === "Reading" ? (
        <span className={styles.liveSkeleton} aria-hidden="true" />
      ) : null}
    </Link>
  );
}
