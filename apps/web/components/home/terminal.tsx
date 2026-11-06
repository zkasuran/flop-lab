// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type KeyboardEvent } from "react";
import { CopyButton } from "../controls";
import { EASE_OUT } from "../motion";
import styles from "./home.module.css";

type Line = { command: string; comment?: string };
type Recipe = { id: string; label: string; lines: Line[]; note: string };

const recipes: Recipe[] = [
  {
    id: "gateway",
    label: "Gateway",
    lines: [{ command: "curl --fail https://api.flop.network/v1/models" }],
    note: "No wallet, key or account. Reads the gateway's model list and price sources.",
  },
  {
    id: "verifier",
    label: "Verifier",
    lines: [
      { command: "pnpm install" },
      { command: "pnpm --filter @flop-lab/verifier build" },
      { command: "node packages/verifier/dist/cli.js tape --limit 20", comment: "arithmetic over recent settlements" },
    ],
    note: "From a checkout of flop-lab with Node 22 and pnpm. PASS, FAIL or UNVERIFIABLE per check.",
  },
  {
    id: "scoreboard",
    label: "Scoreboard",
    lines: [
      { command: "pnpm install" },
      { command: "pnpm --filter @flop-lab/scoreboard build" },
      { command: "node packages/scoreboard/dist/cli.js rank", comment: "miners ranked from observed settlements" },
    ],
    note: "From a checkout of flop-lab. Every score carries its confidence and inputs.",
  },
  {
    id: "harness",
    label: "Harness",
    lines: [
      { command: "pnpm install" },
      { command: "pnpm --filter @flop-lab/harness start run --only gateway-contract --max-requests 8 --max-flop 0" },
    ],
    note: "From a checkout of flop-lab. Bounded requests. The FLOP ceiling is zero.",
  },
];

/** Copyable start commands from the repository README, one recipe per tab. */
export function Terminal() {
  const reduced = useReducedMotion() !== false;
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const recipe = recipes[active] ?? recipes[0]!;
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + recipes.length) % recipes.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <div className={`${styles.terminal} frame`}>
      <div className={styles.terminalBar}>
        <div role="tablist" aria-label="Start commands" className={styles.terminalTabs}>
          <LayoutGroup id="terminal">
            {recipes.map((item, index) => (
              <button
                key={item.id}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`recipe-tab-${item.id}`}
                aria-selected={index === active}
                aria-controls="recipe-panel"
                tabIndex={index === active ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={onKey}
              >
                {index === active && (
                  <motion.span
                    layoutId="terminal-tab"
                    className={styles.terminalTabPill}
                    transition={{ duration: reduced ? 0 : 0.24, ease: EASE_OUT }}
                  />
                )}
                <span>{item.label}</span>
              </button>
            ))}
          </LayoutGroup>
        </div>
      </div>
      <div
        id="recipe-panel"
        role="tabpanel"
        aria-labelledby={`recipe-tab-${recipe.id}`}
        className={styles.terminalBody}
        tabIndex={0}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.pre
            key={recipe.id}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -4 }}
            transition={{ duration: reduced ? 0 : 0.16, ease: EASE_OUT }}
          >
            {recipe.lines.map((line) => (
              <span className={styles.terminalLine} key={line.command}>
                <span className={styles.prompt} aria-hidden="true">
                  $
                </span>
                <code>{line.command}</code>
                {line.comment && <span className={styles.comment}># {line.comment}</span>}
              </span>
            ))}
          </motion.pre>
        </AnimatePresence>
      </div>
      <div className={styles.terminalFoot}>
        <p>{recipe.note}</p>
        <CopyButton text={recipe.lines.map((line) => line.command).join("\n")} label="Copy commands" />
      </div>
    </div>
  );
}
