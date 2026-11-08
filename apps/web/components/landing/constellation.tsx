// SPDX-License-Identifier: Apache-2.0
"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import styles from "./landing.module.css";

export type ConstellationSettlement = { miner: string; channel: string };
type Palette = { accent: string; accent2: string; fg: string; muted: string; bg: string };
type Node = { address: string; sampled: boolean; angle: number; ring: number; x: number; y: number; depth: number };
type Pulse = { node: Node | null; angle: number };

/** Orbit radii as a share of the drawing radius, their drift in radians per second and the view tilt. */
const RINGS = [0.34, 0.6, 0.86] as const;
const DRIFT = [0.05, -0.03, 0.02] as const;
const TILT = 0.56;
/** A replayed settlement travels for TRAVEL seconds. Replays start GAP seconds apart. */
const TRAVEL = 1.5;
const GAP = 1.9;

/** FNV-1a, the same address ordering the devnet map uses. Example: hash("5Grw..."). */
function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}
function rgba(hex: string, alpha: number): string {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!match) return `rgba(194, 240, 127, ${alpha})`;
  return `rgba(${parseInt(match[1]!, 16)}, ${parseInt(match[2]!, 16)}, ${parseInt(match[3]!, 16)}, ${alpha})`;
}
function readPalette(node: Element): Palette {
  const style = getComputedStyle(node);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: get("--accent", "#c2f07f"),
    accent2: get("--accent-2", "#74e3ef"),
    fg: get("--foreground", "#eef3ea"),
    muted: get("--muted", "#a3afa6"),
    bg: get("--background", "#060807"),
  };
}
function ease(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}
function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * The hero visual. One node per price-source address from the gateway, placed on an orbit by address hash, not
 * geography or performance. Filled nodes appear in the sampled settlement page. Pulses replay that page from the
 * core to each miner. They are not live traffic. A ripple marks a new block reading. The loop pauses off-screen,
 * in hidden tabs and under reduced motion, which draws one still frame.
 * Example: <Constellation miners={addresses} settlements={page} block={3015131} />.
 */
export function Constellation({
  miners,
  settlements,
  block,
}: {
  miners: readonly string[];
  settlements: readonly ConstellationSettlement[];
  block: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const tipAddress = useRef<HTMLSpanElement>(null);
  const tipState = useRef<HTMLSpanElement>(null);
  const rippleAt = useRef<number | null>(null);
  const lastBlock = useRef<number | null>(block);
  const reduced = useReducedMotion() !== false;
  // Refreshed pages pass new arrays with the same content. Restart only when the content changes.
  const key = useMemo(
    () => `${miners.join(",")}|${settlements.map((row) => `${row.channel}:${row.miner}`).join(",")}`,
    [miners, settlements],
  );

  useEffect(() => {
    if (block !== null && lastBlock.current !== null && block !== lastBlock.current)
      rippleAt.current = performance.now();
    lastBlock.current = block;
  }, [block]);

  useEffect(() => {
    const wrap = host.current;
    const plate = stage.current;
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!wrap || !plate || !element || !context) return;
    const ctx = context;
    // The effect restarts when the content key changes, so these props always match the key.
    const sampled = new Set(settlements.map((row) => row.miner));
    const nodes: Node[] = [...new Set(miners)]
      .sort((a, b) => hash(a) - hash(b) || a.localeCompare(b))
      .map((address) => {
        const value = hash(address);
        return {
          address,
          sampled: sampled.has(address),
          angle: ((value % 3600) / 3600) * Math.PI * 2,
          ring: 1 + ((value >>> 12) & 1),
          x: 0,
          y: 0,
          depth: 0,
        };
      });
    const pulses: Pulse[] = settlements.map((row) => ({
      node: nodes.find((node) => node.address === row.miner) ?? null,
      angle: ((hash(row.miner) % 3600) / 3600) * Math.PI * 2,
    }));
    let palette = readPalette(wrap);
    let width = 0;
    let height = 0;
    let offsetX = 0;
    let offsetY = 0;
    let targetX = 0;
    let targetY = 0;
    let hovered: Node | null = null;
    let raf = 0;
    let running = false;
    let inView = true;
    let visible = !document.hidden;
    const start = performance.now();
    if (!reduced) rippleAt.current = start + 300;

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width / 2, height / (2 * TILT)) * 0.92;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.46);
      glow.addColorStop(0, rgba(palette.accent, 0.26));
      glow.addColorStop(0.5, rgba(palette.accent2, 0.07));
      glow.addColorStop(1, rgba(palette.accent2, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.46, 0, Math.PI * 2);
      ctx.fill();
      RINGS.forEach((share, index) => {
        ctx.save();
        ctx.setLineDash(index === 0 ? [] : [2, 7]);
        ctx.lineDashOffset = -t * 5 * (index + 1);
        ctx.strokeStyle = rgba(palette.fg, index === 0 ? 0.09 : 0.14);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * share, radius * share * TILT, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
      for (const node of nodes) {
        const angle = node.angle + t * DRIFT[node.ring as 1 | 2];
        const orbit = radius * RINGS[node.ring as 1 | 2];
        node.x = cx + Math.cos(angle) * orbit;
        node.y = cy + Math.sin(angle) * orbit * TILT;
        node.depth = (Math.sin(angle) + 1) / 2;
      }
      ctx.lineWidth = 1;
      for (const node of nodes) {
        if (!node.sampled) continue;
        ctx.strokeStyle = rgba(palette.accent, 0.1 + node.depth * 0.14);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
      }
      if (!reduced && pulses.length) {
        const cycle = pulses.length * GAP + 1.2;
        pulses.forEach((pulse, index) => {
          const local = t - index * GAP - 0.6;
          if (local < 0) return;
          const phase = local % cycle;
          const target = pulse.node
            ? { x: pulse.node.x, y: pulse.node.y }
            : {
                x: cx + Math.cos(pulse.angle) * radius * 1.02,
                y: cy + Math.sin(pulse.angle) * radius * 1.02 * TILT,
              };
          const color = pulse.node ? palette.accent : palette.muted;
          if (phase < TRAVEL) {
            const head = ease(phase / TRAVEL);
            const tail = Math.max(0, head - 0.2);
            const hx = cx + (target.x - cx) * head;
            const hy = cy + (target.y - cy) * head;
            const tx = cx + (target.x - cx) * tail;
            const ty = cy + (target.y - cy) * tail;
            const trail = ctx.createLinearGradient(tx, ty, hx, hy);
            trail.addColorStop(0, rgba(color, 0));
            trail.addColorStop(1, rgba(color, pulse.node ? 0.95 : 0.55));
            ctx.strokeStyle = trail;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            ctx.fillStyle = rgba(color, pulse.node ? 1 : 0.6);
            ctx.beginPath();
            ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
            ctx.fill();
          } else if (pulse.node && phase < TRAVEL + 0.9) {
            const age = (phase - TRAVEL) / 0.9;
            const size = 6 + age * 22;
            ctx.strokeStyle = rgba(palette.accent, 0.7 * (1 - age));
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.ellipse(pulse.node.x, pulse.node.y, size, size * 0.8, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      }
      const ordered = [...nodes].sort((a, b) => a.depth - b.depth);
      for (const node of ordered) {
        const scale = 0.72 + node.depth * 0.48;
        const focus = node === hovered;
        const size = (node.sampled ? 4.6 : 3.8) * scale * (focus ? 1.45 : 1);
        if (node.sampled) {
          const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size * 4.5);
          halo.addColorStop(0, rgba(palette.accent, 0.34));
          halo.addColorStop(1, rgba(palette.accent, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size * 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = rgba(palette.accent, 0.6 + node.depth * 0.4);
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = rgba(palette.bg, 1);
          ctx.strokeStyle = rgba(palette.fg, 0.3 + node.depth * 0.4);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (focus) {
          ctx.strokeStyle = rgba(palette.accent2, 0.95);
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      const ripple = rippleAt.current;
      if (ripple !== null && !reduced) {
        const age = (now - ripple) / 1700;
        if (age >= 0 && age < 1) {
          const size = radius * (0.06 + age * 0.9);
          ctx.strokeStyle = rgba(palette.accent2, 0.55 * (1 - age));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, size, size * TILT, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.fillStyle = rgba(palette.accent, 0.95);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(palette.accent, 0.38);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 11 + Math.sin(t * 1.6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    };

    const resize = () => {
      const box = wrap.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = box.width;
      height = box.height;
      element.width = Math.max(1, Math.round(width * ratio));
      element.height = Math.max(1, Math.round(height * ratio));
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!running) draw(performance.now());
    };
    const loop = (now: number) => {
      if (!running) return;
      offsetX += (targetX - offsetX) * 0.06;
      offsetY += (targetY - offsetY) * 0.06;
      plate.style.transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0)`;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      const should = !reduced && inView && visible;
      if (should && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    const showTip = (x: number, y: number) => {
      const card = tip.current;
      if (!card) return;
      if (!hovered) {
        card.dataset.show = "false";
        return;
      }
      if (tipAddress.current) tipAddress.current.textContent = short(hovered.address);
      if (tipState.current)
        tipState.current.textContent = hovered.sampled
          ? "In the sampled settlement page"
          : "Not in the sampled settlement page";
      card.dataset.sampled = String(hovered.sampled);
      card.dataset.show = "true";
      // Keep the readout inside the drawing: it flips to the left of the pointer near the right edge.
      const left = x > width * 0.55 ? x - 18 - card.offsetWidth : x + 18;
      card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(y - 12)}px, 0)`;
    };
    const onMove = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (!reduced) {
        targetX = (x / box.width - 0.5) * -18;
        targetY = (y / box.height - 0.5) * -12;
      }
      let best: Node | null = null;
      let distance = 28 * 28;
      for (const node of nodes) {
        const gap = (node.x - x) ** 2 + (node.y - y) ** 2;
        if (gap < distance) {
          distance = gap;
          best = node;
        }
      }
      hovered = best;
      showTip(x, y);
      if (!running) draw(performance.now());
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      hovered = null;
      showTip(0, 0);
      if (!running) draw(performance.now());
    };
    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };
    const resizer = new ResizeObserver(resize);
    resizer.observe(wrap);
    const viewer = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? true;
        sync();
      },
      { threshold: 0.02 },
    );
    viewer.observe(wrap);
    const theme = new MutationObserver(() => {
      palette = readPalette(wrap);
      if (!running) draw(performance.now());
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    resize();
    sync();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      resizer.disconnect();
      viewer.disconnect();
      theme.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, reduced]);

  const unique = new Set(miners).size;
  const inSample = [...new Set(miners)].filter((address) => settlements.some((row) => row.miner === address)).length;
  return (
    <div className={styles.constellation}>
      <div
        ref={host}
        className={styles.orbit}
        role="img"
        aria-label={`${unique} price-source addresses from the public gateway, placed by address hash. ${inSample} appear in the sampled settlement page. Pulses replay that page. They are not live traffic.`}
        data-cursor="crosshair"
      >
        <div ref={stage} className={styles.stage}>
          <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
          <div className={styles.core} aria-hidden="true">
            <span>FLOP</span>
            <span>devnet</span>
          </div>
        </div>
        <div ref={tip} className={styles.tip} data-show="false" aria-hidden="true">
          <span className={styles.tipKind}>Price source</span>
          <span ref={tipAddress} className={`mono ${styles.tipAddress}`} />
          <span ref={tipState} className={styles.tipState} />
        </div>
      </div>
      <ul className={styles.legend} aria-hidden="true">
        <li>
          <span className={styles.keySampled} /> In the settlement sample
        </li>
        <li>
          <span className={styles.keySource} /> Price source
        </li>
        <li>
          <span className={styles.keyPulse} /> Replayed settlement, not live traffic
        </li>
      </ul>
    </div>
  );
}
