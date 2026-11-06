// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Observation, Stats } from "@/lib/devnet";
import { age, isStale } from "@/lib/observation-view";
import { SwapValue } from "../motion";
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

/**
 * The latest devnet block as a header reading. It refreshes every 30 seconds while the tab is visible.
 * It is a dated observation, not a liveness claim. Example: <LiveBlock />.
 */
export function LiveBlock({ className }: { className?: string }) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const read = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/pulse", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Pulse HTTP ${response.status}`);
        const next = parsePulse(await response.json());
        if (!next) throw new Error("Invalid pulse");
        if (active) {
          setPulse(next);
          setFailed(false);
        }
      } catch (cause) {
        if (active && !(cause instanceof DOMException && cause.name === "AbortError")) setFailed(true);
      }
      if (active) setNow(Date.now());
    };
    void read();
    const timer = setInterval(() => void read(), 30_000);
    const onVisible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
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
      href="/network"
      className={className ? `${styles.live} ${className}` : styles.live}
      data-stale={stale}
      data-ready={block !== undefined}
      aria-label={label}
      title={pulse ? `${state} / ${age(pulse.stats.measuredAt, now)} / ${pulse.stats.source}` : undefined}
    >
      <span className="status-dot" aria-hidden="true" />
      <span className={styles.liveState} aria-hidden="true">
        {state === "Unavailable" ? "Block unavailable" : state === "Last known" ? "Last known" : "Block"}
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
