// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { ToolHeader } from "@/components/tool-header";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import list from "./tool-list.json";
import example from "./example.json";
import styles from "./workbench.module.css";

const command = "pnpm --filter @flop-lab/mcp-server build";
const result = example.result;
const observation = result.evidence[0]!;
const checks = result.data.rows.flatMap((row) => row.checks);
const json = (value: unknown) => JSON.stringify(value, null, 2);

function Copy({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState("");
  return (
    <div className={styles.copy}>
      <MotionButton
        className={styles.button}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("Copied");
          } catch {
            setState("Select and copy the text below");
          }
        }}
      >
        {label}
      </MotionButton>
      <span role="status" className={styles.copyState}>
        {state}
      </span>
    </div>
  );
}

function Connection() {
  const [client, setClient] = useState<"mcp" | "vscode">("mcp");
  const [path, setPath] = useState("/absolute/path/to/flop-lab");
  const reduced = useReducedMotion() !== false;
  const entry = { command: "node", args: [`${path.replace(/\/$/, "")}/packages/mcp-server/dist/cli.js`] };
  const config =
    client === "mcp" ? { mcpServers: { "flop-lab": entry } } : { servers: { "flop-lab": { type: "stdio", ...entry } } };
  return (
    <section id="connect" className={styles.section} aria-labelledby="connect-title">
      <ReadingReveal>
        <p className="eyebrow">01 / Connect</p>
        <h2 id="connect-title">
          A local process.
          <br />A standard connection.
        </h2>
      </ReadingReveal>
      <div className={styles.connectGrid}>
        <ReadingReveal order={1}>
          <p className="muted">
            From a checkout, run <code>pnpm install</code> and build the server. Set your checkout path below, then copy
            the config into your MCP client.
          </p>
          <div className={styles.command}>
            <code>{command}</code>
            <Copy value={command} label="Copy build command" />
          </div>
          <label className={styles.label} htmlFor="checkout">
            Absolute checkout path
          </label>
          <motion.input
            id="checkout"
            className={styles.input}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            spellCheck={false}
            whileFocus={{ borderColor: "var(--accent)" }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          />
          <p className={styles.note}>Node 22 · Workspace-local package · No API key</p>
          <p className={styles.note}>
            Append <code>--recorded</code> to the args array for offline captures. In normal mode, public reads are
            bounded. Doctor is local and offline. The DID trail is recorded-only.
          </p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <div className={styles.config}>
            <div className={styles.configTop}>
              <div className={styles.tabs} role="group" aria-label="Config format">
                {(
                  [
                    ["mcp", "MCP clients"],
                    ["vscode", "VS Code"],
                  ] as const
                ).map(([id, label]) => (
                  <MotionButton
                    className={styles.tab}
                    key={id}
                    aria-pressed={client === id}
                    onClick={() => setClient(id)}
                  >
                    {client === id && (
                      <motion.span
                        className={styles.tabFill}
                        layoutId={reduced ? undefined : "mcp-config-tab"}
                        transition={{ duration: reduced ? 0 : 0.2 }}
                      />
                    )}
                    <span>{label}</span>
                  </MotionButton>
                ))}
              </div>
              <Copy value={json(config)} label="Copy config" />
            </div>
            <pre data-config>{json(config)}</pre>
            <p className={styles.note}>
              {client === "mcp"
                ? "Uses the mcpServers connection format."
                : "Save as .vscode/mcp.json in your project."}{" "}
              Replace the path before starting the client.
            </p>
          </div>
        </ReadingReveal>
      </div>
    </section>
  );
}

function ExampleCall() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 90%", "end 30%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const [replay, setReplay] = useState(0);
  return (
    <section ref={ref} className={styles.section} aria-labelledby="example-title">
      <div className={styles.sectionTop}>
        <ReadingReveal>
          <p className="eyebrow">02 / Follow one call</p>
          <h2 id="example-title">A result with a paper trail.</h2>
        </ReadingReveal>
        <MotionButton className={styles.button} onClick={() => setReplay((value) => value + 1)}>
          Replay animation
        </MotionButton>
      </div>
      <p className={styles.note}>
        The rail tracks reading progress. The example replays a captured response, with no network request.
      </p>
      <div className={styles.rail} aria-hidden="true">
        <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
      </div>
      <div className={styles.pipeline} data-pipeline>
        {[
          ["Input", "Bound the tape to one row."],
          ["Handler", "Use the suite verifier."],
          ["Contract", "Validate the output shape."],
          ["Evidence", "Keep the source and time."],
        ].map(([title, detail], index) => (
          <motion.div
            key={`${title}-${replay}`}
            className={styles.stage}
            initial={{ y: reduced ? 0 : 10 }}
            animate={{ y: 0 }}
            transition={{ duration: reduced ? 0 : 0.28, delay: reduced ? 0 : index * 0.06 }}
          >
            <span className={styles.stageIndex}>{String(index + 1).padStart(2, "0")}</span>
            <strong>{title}</strong>
            <span>{detail}</span>
            <motion.div
              data-call-bar
              className={styles.stageBar}
              initial={{ scaleX: reduced ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduced ? 0 : 0.32, delay: reduced ? 0 : index * 0.05 }}
            />
          </motion.div>
        ))}
      </div>
      <div className={styles.callGrid}>
        <div className={styles.request}>
          <p className="eyebrow">tools/call</p>
          <pre>{json(example.request)}</pre>
          <Copy value={json(example.request)} label="Copy example call" />
          <p className={styles.note}>This calls the recorded tape, not the live network.</p>
        </div>
        <motion.div
          key={replay}
          className={styles.response}
          initial={{ y: reduced ? 0 : 8 }}
          animate={{ y: 0 }}
          transition={{ duration: reduced ? 0 : 0.4 }}
        >
          <div className={styles.responseTop}>
            <span className="eyebrow">structuredContent</span>
            <span className={styles.recorded}>RECORDED</span>
          </div>
          <div className={styles.checkCount}>
            <ObservedNumber value={checks.length} />
            <span>
              reported checks
              <br />
              <strong>{result.requests} HTTP attempts in replay</strong>
            </span>
          </div>
          {checks.map((check) => (
            <div className={styles.check} key={check.id}>
              <span className={styles.pass}>{check.status}</span>
              <div>
                <strong>{check.id}</strong>
                <p>{check.detail}</p>
              </div>
            </div>
          ))}
          <div className={styles.stamp}>
            <span>Source observation</span>
            <time dateTime={observation.measuredAt}>{observation.measuredAt}</time>
            <MotionLink href={observation.source}>{observation.source}</MotionLink>
          </div>
        </motion.div>
      </div>
      <p className={styles.note}>
        An arithmetic pass does not prove inference or that funds moved. The returned page is partial:{" "}
        <code>complete: {String(result.data.complete)}</code>.
      </p>
    </section>
  );
}

function ToolList() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const reduced = useReducedMotion() !== false;
  const filtered = list.tools.filter((tool) =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className={styles.section} aria-labelledby="tools-title">
      <div className={styles.sectionTop}>
        <ReadingReveal>
          <p className="eyebrow">03 / Discover</p>
          <h2 id="tools-title">The server is the catalog.</h2>
        </ReadingReveal>
        <p className={styles.note}>
          <ObservedNumber value={filtered.length} /> of {list.tools.length} operations
        </p>
      </div>
      <p className="muted">
        Generated by a real <code>tools/list</code> call to the built server. Open a tool to inspect its exact input and
        output contract.
      </p>
      <div className={styles.searchRow}>
        <label className={styles.label} htmlFor="tool-search">
          Find a tool
        </label>
        <motion.input
          id="tool-search"
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try budget, channel or schema"
          whileFocus={{ borderColor: "var(--accent)" }}
          transition={{ duration: reduced ? 0 : 0.16 }}
        />
      </div>
      <p className={styles.note}>
        Generated <time dateTime={list.measuredAt}>{list.measuredAt}</time> ·{" "}
        <MotionLink href="/mcp/tool-list">Download tools/list JSON ↗</MotionLink>
      </p>
      <div className={styles.tools}>
        <AnimatePresence initial={false}>
          {filtered.map((tool) => (
            <motion.article
              key={tool.name}
              layout={!reduced}
              initial={false}
              exit={{ opacity: reduced ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              className={styles.tool}
            >
              <MotionButton
                className={styles.toolButton}
                aria-expanded={open === tool.name}
                aria-controls={`${tool.name}-schema`}
                onClick={() => setOpen(open === tool.name ? null : tool.name)}
              >
                <span>
                  <strong>{tool.name}</strong>
                  <span>{tool.description}</span>
                </span>
                <motion.span
                  className={styles.plus}
                  animate={{ rotate: open === tool.name ? 45 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.16 }}
                >
                  +
                </motion.span>
              </MotionButton>
              <AnimatePresence initial={false}>
                {open === tool.name && (
                  <motion.div
                    id={`${tool.name}-schema`}
                    className={styles.schema}
                    initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                  >
                    <div>
                      <h3>Input schema</h3>
                      <pre>{json(tool.inputSchema)}</pre>
                    </div>
                    <div>
                      <h3>Output schema</h3>
                      <pre>{json(tool.outputSchema)}</pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          ))}
        </AnimatePresence>
        {!filtered.length && <p className={styles.empty}>No tool matches this search.</p>}
      </div>
    </section>
  );
}

export function McpWorkbench() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <ToolHeader slug="mcp" />
          <ReadingReveal order={3}>
            <p className={styles.intro}>
              Give your agent a read-only connection to the suite. Inspect a settlement, evaluate a budget or compare a
              contract. Keep the evidence with the answer.
            </p>
            <div className={styles.heroActions}>
              <MotionLink className={styles.primary} href="#connect">
                Connect your agent ↗
              </MotionLink>
              <MotionLink href="https://github.com/zkasuran/flop-lab/blob/main/packages/mcp-server/README.md">
                Read the guide ↗
              </MotionLink>
            </div>
          </ReadingReveal>
        </div>
        <ReadingReveal order={2}>
          <div className={styles.specimen}>
            <div className={styles.specimenTop}>
              <span className="eyebrow">LOCAL / STDIO</span>
              <span className={styles.dot} /> <span>Read-only</span>
            </div>
            <p className={styles.count}>
              <ObservedNumber value={list.tools.length} />
              <span>suite operations</span>
            </p>
            <div className={styles.miniRow}>
              <span>Input</span>
              <strong>Strict schema</strong>
            </div>
            <div className={styles.miniRow}>
              <span>Output</span>
              <strong>Checked before transport</strong>
            </div>
            <div className={styles.miniRow}>
              <span>Evidence</span>
              <strong>Source + capture time</strong>
            </div>
            <p className={styles.note}>
              One local server. Existing suite packages.
              <br />
              No wallet or signing flow.
            </p>
          </div>
        </ReadingReveal>
      </section>
      <Connection />
      <ExampleCall />
      <ToolList />
      <section className={`${styles.section} ${styles.limits}`} aria-labelledby="limits-title">
        <ReadingReveal>
          <p className="eyebrow">Read the boundary</p>
          <h2 id="limits-title">What this does not verify</h2>
        </ReadingReveal>
        <div>
          <p>
            Indexed agreement does not prove inference, finality or source authenticity. A policy result only covers the
            history you supply. Recorded quotes stay historical.
          </p>
          <p>
            The hosted agent-pack manifest and skill calls returned <code>agent pack missing</code>. The local pack
            follows the documented layout; upstream field-level compatibility is unverified.
          </p>
          <p>
            <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/mcp-server/agent-pack">
              Inspect the agent pack ↗
            </MotionLink>{" "}
            ·{" "}
            <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/mcp-server/fixtures">
              Read the raw observations ↗
            </MotionLink>
          </p>
        </div>
      </section>
    </div>
  );
}
