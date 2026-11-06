// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import {
  curlCommand,
  estimateCalls,
  sourceState,
  tokenCost,
  validateInput,
  type Observation,
} from "../../../../packages/console/src/core";
import { fieldValue, object, type Tool } from "../../../../packages/console/src/schema";
import { inspectQuery, QUERY_LIMITS } from "../../../../packages/console/src/query";
import type { recordedConsole } from "../../../../packages/console/src/recorded";
import type { ConsoleRequest, Estimate } from "../../../../packages/console/src/service";
import { parseConsoleResponse } from "./response";
import styles from "./workbench.module.css";

type Initial = ReturnType<typeof recordedConsole>;
type Tab = "tools" | "indexer" | "cost";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const utc = (value: string) => value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

function Tree({ value, label = "response", depth = 0 }: { value: unknown; label?: string; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const [limit, setLimit] = useState(20);
  const id = useId();
  const reduced = useReducedMotion() !== false;
  if (value === null || typeof value !== "object" || depth > 8)
    return (
      <div className={styles.leaf}>
        <span>{label}</span>
        <code>{json(value)}</code>
      </div>
    );
  const entries = Object.entries(value);
  return (
    <motion.div layout={!reduced} className={styles.tree} transition={{ duration: reduced ? 0 : 0.2 }}>
      <MotionButton
        className={styles.treeToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> {label}{" "}
        <span className="muted">
          {Array.isArray(value) ? "array" : "object"} / {entries.length}
        </span>
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            className={styles.branches}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: reduced ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            {entries.length ? (
              entries
                .slice(0, limit)
                .map(([key, value]) => <Tree key={key} label={key} value={value} depth={depth + 1} />)
            ) : (
              <p className="muted">Empty {Array.isArray(value) ? "array" : "object"}.</p>
            )}
            {entries.length > limit && (
              <MotionButton className="quiet-button" onClick={() => setLimit(limit + 20)}>
                Show more fields
              </MotionButton>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Evidence({ observation, mode }: { observation: Observation; mode: string }) {
  return (
    <div className={styles.evidence}>
      <div className={styles.row}>
        <span className="eyebrow">{mode}</span>
        <span className={styles.badge} data-status={observation.check.status}>
          Schema {observation.check.status}
        </span>
      </div>
      <h3>{observation.tool}</h3>
      <p className={styles.date}>
        <time dateTime={observation.measuredAt}>{utc(observation.measuredAt)}</time> ·{" "}
        <MotionLink href={observation.source}>Hosted MCP ↗</MotionLink>
      </p>
      {observation.durationMs !== null && (
        <p className="muted">
          {observation.durationMs} ms for the last attempt · {observation.attempts} HTTP attempts
        </p>
      )}
      <p className={styles.notice}>
        {observation.check.status === "pass"
          ? "Matches the advertised output schema. This does not prove the answer is correct."
          : observation.check.errors.join(" ")}
      </p>
      <Tree key={`${observation.tool}-${observation.measuredAt}`} value={observation.value} />
      <div className={styles.row}>
        <h3>Reproduce this call</h3>
        <CopyButton text={observation.curl} label="Copy curl" />
      </div>
      <pre className={styles.code}>{observation.curl}</pre>
    </div>
  );
}

function GeneratedForm({
  tool,
  onCall,
  busy,
}: {
  tool: Tool;
  onCall: (args: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const properties = Object.entries(object(tool.inputSchema.properties ?? {}));
  const required = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : [];
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const args: Record<string, unknown> = {};
          for (const [key, raw] of properties) {
            const schema = object(raw),
              text = values[key];
            if (text === undefined || text === "") {
              if (schema.default !== undefined) args[key] = schema.default;
              continue;
            }
            args[key] = fieldValue(schema, text);
          }
          validateInput(tool, args);
          setError("");
          onCall(args);
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <p className={styles.description}>{tool.description}</p>
      {properties.length === 0 && <p className="muted">This tool takes no arguments.</p>}
      {properties.map(([name, raw]) => {
        const schema = object(raw);
        const options = Array.isArray(schema.enum)
          ? schema.enum.map(String)
          : schema.type === "boolean"
            ? ["true", "false"]
            : null;
        const value =
          values[name] ??
          (schema.default === undefined
            ? ""
            : typeof schema.default === "string"
              ? schema.default
              : JSON.stringify(schema.default));
        return (
          <label key={name} className={styles.field}>
            <span>
              {name} {required.includes(name) && <small>required</small>}
            </span>
            {options ? (
              <select value={value} onChange={(event) => setValues({ ...values, [name]: event.target.value })}>
                <option value="">Use server default</option>
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : schema.type === "array" || schema.type === "object" || name === "query" ? (
              <textarea
                rows={4}
                value={value}
                onChange={(event) => setValues({ ...values, [name]: event.target.value })}
                spellCheck={false}
              />
            ) : (
              <input
                value={value}
                onChange={(event) => setValues({ ...values, [name]: event.target.value })}
                inputMode={schema.type === "number" || schema.type === "integer" ? "decimal" : "text"}
              />
            )}
            <small className="muted">
              {String(schema.type ?? "JSON")}
              {typeof schema.description === "string" ? ` · ${schema.description}` : ""}
            </small>
          </label>
        );
      })}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <MotionButton className="button" disabled={busy || !tool.allowed} type="submit">
        Validate and call ↗
      </MotionButton>
      {!tool.allowed && (
        <p className={styles.notice}>Listed by the server. Outside this console&apos;s read-only allowlist.</p>
      )}
    </form>
  );
}

function Arithmetic({ result, input }: { result: Observation; input: Estimate["input"] }) {
  try {
    const value = object(result.value),
      calculation = object(value.calculation ?? {});
    const numeric = (...values: unknown[]) =>
      values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (result.tool === "flop_estimate_cost" && numeric(calculation.totalTokens, calculation.pricePerToken))
      return (
        <p className={styles.formula}>
          {String(calculation.totalTokens)} tokens × {String(calculation.pricePerToken)} FLOP/token ={" "}
          {String(object(value.estimatedCost).base)}
        </p>
      );
    if (
      result.tool === "flop_estimate_inference_cost" &&
      numeric(calculation.totalTokens, calculation.gflopsPerToken, calculation.basePricePerGflop)
    )
      return (
        <p className={styles.formula}>
          {String(calculation.totalTokens)} × {String(calculation.gflopsPerToken)} GFLOP/token ×{" "}
          {String(calculation.basePricePerGflop)} FLOP/GFLOP × {String(object(value.factors).totalMultiplier)} ={" "}
          {String(object(value.estimatedCost).adjusted)}
        </p>
      );
    if (result.tool === "flop_get_model_pricing" && numeric(value.gflopsPerToken, value.pricePerGflop))
      return (
        <p className={styles.formula}>
          {input.tokens + input.outputTokens} tokens × {String(value.gflopsPerToken)} GFLOP/token ×{" "}
          {String(value.pricePerGflop)} FLOP/GFLOP = {String(value.estimatedCostForTokens)}
        </p>
      );
  } catch {
    /* Unavailable fields stay unavailable. The raw response remains visible. */
  }
  return (
    <p className={styles.notice}>This answer does not expose a full cost formula. Inspect the returned fields below.</p>
  );
}

function CostPanel({ estimate, mode }: { estimate: Estimate; mode: string }) {
  const [now, setNow] = useState<number | null>(null);
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const price = estimate.gateway;
  const valid =
    price && now !== null ? price.sources.filter((source) => sourceState(source, now) === "current").length : 0;
  return (
    <div className={styles.costResults}>
      <p className={styles.notice}>
        Devnet estimates only. These are not market prices. The tools can include nominal conversions, placeholder
        quality scores and unmeasured latency fields. They are returned data, not verified claims.
      </p>
      <div className={styles.costGrid}>
        {estimate.observations.map((result) => (
          <article className={styles.costCard} key={result.tool}>
            <Arithmetic result={result} input={estimate.input} />
            <Evidence observation={result} mode={mode} />
          </article>
        ))}
      </div>
      {estimate.errors.map((error) => (
        <p className={styles.error} key={error.tool}>
          {error.tool}: {error.message}
        </p>
      ))}
      <section className={styles.gateway}>
        <div className={styles.row}>
          <h3>Gateway price sources</h3>
          <span className={styles.badge}>Devnet / nominal</span>
        </div>
        {price ? (
          <>
            <p className={styles.formula}>
              {estimate.input.tokens} input × {price.prompt} FLOP/token + {estimate.input.outputTokens} output ×{" "}
              {price.completion} FLOP/token ={" "}
              <strong>
                {tokenCost(price.prompt, price.completion, estimate.input.tokens, estimate.input.outputTokens)} FLOP
              </strong>
            </p>
            <p className={styles.date}>
              Observed {utc(price.measuredAt)} · <MotionLink href={price.source}>Gateway model list ↗</MotionLink>
            </p>
            <p>
              <ObservedNumber value={price.sources.length} /> price sources ·{" "}
              {now === null ? "Checking expiry" : `${valid} within their validity window now`}
            </p>
            <div className={styles.bar} aria-hidden="true">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: price.sources.length ? valid / price.sources.length : 0 }}
                transition={{ duration: reduced ? 0 : 0.35 }}
              />
            </div>
            {!price.sources.length && (
              <p>No source records returned. The displayed arithmetic is not a usable quote.</p>
            )}
            {price.sources.length > 0 && valid === 0 && now !== null && (
              <p className={styles.notice}>
                All source windows are expired or not effective. Refresh estimates for a new observation.
              </p>
            )}
            <div className={styles.sources}>
              {price.sources.map((source, index) => (
                <div key={`${source.miner}-${index}`}>
                  <code>{source.miner}</code>
                  <span>
                    {source.source} · {now === null ? "Checking expiry" : sourceState(source, now)}
                  </span>
                  <small>
                    Effective {utc(source.effectiveAt)}
                    <br />
                    Expires {utc(source.expiresAt)}
                  </small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.error}>{estimate.gatewayError ?? "No gateway pricing data"}</p>
        )}
      </section>
    </div>
  );
}

export function ConsoleWorkbench({ initial }: { initial: Initial }) {
  const [tab, setTab] = useState<Tab>("tools");
  const [catalog, setCatalog] = useState(initial.catalog);
  const [catalogMode, setCatalogMode] = useState("Recorded discovery");
  const [selected, setSelected] = useState("flop_get_stats");
  const [result, setResult] = useState<Observation>(initial.stats);
  const [resultMode, setResultMode] = useState("Recorded response");
  const [indexerResult, setIndexerResult] = useState<Observation | null>(null);
  const [indexerMode, setIndexerMode] = useState("Recorded response");
  const [fields, setFields] = useState(initial.fields);
  const [introspectionDate, setIntrospectionDate] = useState(initial.indexer.measuredAt);
  const [query, setQuery] = useState("{ stats { latestBlockNumber totalBlocks totalTransactions } }");
  const [variables, setVariables] = useState("{}");
  const [type, setType] = useState("Query");
  const [search, setSearch] = useState("");
  const [estimate, setEstimate] = useState(initial.estimate);
  const [estimateMode, setEstimateMode] = useState("Recorded response");
  const [model, setModel] = useState(initial.estimate.input.model);
  const [tokens, setTokens] = useState(String(initial.estimate.input.tokens));
  const [outputTokens, setOutputTokens] = useState(String(initial.estimate.input.outputTokens));
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready. Recorded data stays visible until you make a request.");
  const [error, setError] = useState("");
  const active = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const guide = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 60%"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const tool = catalog.tools.find((tool) => tool.name === selected);

  async function run(request: ConsoleRequest, destination: "tool" | "indexer" = "tool") {
    if (active.current) return;
    setError("");
    setStage(1);
    try {
      if (request.action === "call") {
        const tool = catalog.tools.find((tool) => tool.name === request.tool);
        if (!tool) throw new Error("Tool is absent from discovery");
        validateInput(tool, request.args);
      }
      if (request.action === "estimate") estimateCalls(request.input);
      active.current = true;
      setBusy(true);
      setStage(2);
      setMessage("Validated locally. Waiting for the same-origin proxy.");
      const response = await fetch("/console/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(25_000),
      });
      const value: unknown = await response.json();
      setStage(3);
      if (!response.ok) throw new Error(String(object(value).error ?? `HTTP ${response.status}`));
      const answer = parseConsoleResponse(value),
        payload = answer.payload;
      const mode = answer.cached ? "Cached response" : "Live response";
      if (payload.kind === "tools") {
        setCatalog(payload.catalog);
        setCatalogMode(mode);
      }
      if (payload.kind === "call") {
        if (destination === "indexer") {
          setIndexerResult(payload.observation);
          setIndexerMode(mode);
        } else {
          setResult(payload.observation);
          setResultMode(mode);
        }
      }
      if (payload.kind === "introspect") {
        setFields(payload.fields);
        setIntrospectionDate(payload.observation.measuredAt);
      }
      if (payload.kind === "estimate") {
        setEstimate(payload.estimate);
        setEstimateMode(mode);
      }
      setStage(4);
      setMessage(
        `${mode}. ${answer.requests} upstream HTTP requests. ${answer.budgetRemaining} request units remain in this visitor window. Served ${utc(answer.servedAt)}.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setMessage("Request stopped. Previous evidence is still shown.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ToolHeader slug="console" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            Choose a public tool. Check its inputs. See the answer and copy the exact request.
          </p>
          <p className="muted">
            Browser calls stay on this site. The proxy allows read-only requests and limits their size, time and
            frequency.
          </p>
        </ReadingReveal>
      </header>
      <ReadingReveal>
        <div className={styles.discovery}>
          <div>
            <span className="eyebrow">{catalogMode}</span>
            <p>
              <ObservedNumber value={catalog.tools.length} /> tools discovered /{" "}
              <ObservedNumber value={catalog.tools.filter((tool) => tool.allowed).length} /> enabled
            </p>
            <p className={styles.date}>
              {utc(catalog.measuredAt)} · <MotionLink href={catalog.source}>tools/list ↗</MotionLink>
            </p>
          </div>
          <MotionButton className="quiet-button" disabled={busy} onClick={() => void run({ action: "tools" })}>
            Refresh tool list
          </MotionButton>
        </div>
      </ReadingReveal>
      <section className={styles.workspace} aria-label="Interactive console">
        <div className={styles.tabs} role="tablist" aria-label="Console mode">
          {(["tools", "indexer", "cost"] as const).map((key) => (
            <MotionButton
              key={key}
              role="tab"
              id={`tab-${key}`}
              aria-controls="console-panel"
              aria-selected={tab === key}
              className={styles.tab}
              onClick={() => {
                setTab(key);
                setError("");
              }}
            >
              {key === "tools" ? "Tool console" : key === "indexer" ? "Indexer playground" : "Cost estimator"}
              {tab === key && (
                <motion.span
                  className={styles.tabLine}
                  layoutId={reduced ? undefined : "console-tab"}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                />
              )}
            </MotionButton>
          ))}
        </div>
        <div className={styles.lifecycle} aria-label="Request lifecycle">
          {["Validate", "Send", "Receive", "Check"].map((label, index) => (
            <div key={label} data-active={stage > index}>
              <span>{label}</span>
              <motion.i animate={{ scaleX: stage > index ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.3 }} />
            </div>
          ))}
        </div>
        <div className={styles.feedback}>
          <p role="status">{message}</p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            id="console-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: reduced ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {tab === "tools" && (
              <div className={styles.toolGrid}>
                <div className={styles.inputPanel}>
                  <label className={styles.field}>
                    <span>Public tool</span>
                    <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                      {catalog.tools.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name}
                          {tool.allowed ? "" : " (disabled)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tool ? (
                    <GeneratedForm
                      key={tool.name}
                      tool={tool}
                      busy={busy}
                      onCall={(args) => void run({ action: "call", tool: tool.name, args })}
                    />
                  ) : (
                    <p>No tools returned. Refresh discovery to try again.</p>
                  )}
                </div>
                <Evidence observation={result} mode={resultMode} />
              </div>
            )}
            {tab === "indexer" && (
              <div className={styles.indexer}>
                <div className={styles.toolGrid}>
                  <div className={styles.inputPanel}>
                    <h2>Ask the indexer</h2>
                    <p className="muted">
                      One query. Up to {QUERY_LIMITS.depth} levels, {QUERY_LIMITS.fields} expanded fields,{" "}
                      {QUERY_LIMITS.roots} root fields and {QUERY_LIMITS.bytes} UTF-8 bytes. Pagination is capped at{" "}
                      {QUERY_LIMITS.rows} rows.
                    </p>
                    <label className={styles.field}>
                      <span>GraphQL query</span>
                      <textarea
                        ref={editor}
                        rows={8}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Variables (JSON object)</span>
                      <textarea
                        rows={3}
                        value={variables}
                        onChange={(event) => setVariables(event.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <MotionButton
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        try {
                          const args = object(JSON.parse(variables));
                          inspectQuery(query, args);
                          void run(
                            { action: "call", tool: "flop_indexer_query", args: { query, variables: args } },
                            "indexer",
                          );
                        } catch (error) {
                          setError(String(error));
                        }
                      }}
                    >
                      Validate and query ↗
                    </MotionButton>
                  </div>
                  <div className={styles.completion}>
                    <h3>Schema completions</h3>
                    <p className={styles.date}>Introspected {utc(introspectionDate)}</p>
                    <label className={styles.field}>
                      <span>Parent type</span>
                      <select value={type} onChange={(event) => setType(event.target.value)}>
                        {[...new Set(fields.map((field) => field.type))].map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Find a field</span>
                      <input value={search} onChange={(event) => setSearch(event.target.value)} />
                    </label>
                    <p className="muted">
                      Choose a field to insert at the cursor. Add its arguments and selection set using the displayed
                      types.
                    </p>
                    <div className={styles.completions}>
                      {fields
                        .filter(
                          (field) => field.type === type && field.field.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((field) => (
                          <MotionButton
                            className={styles.completionButton}
                            key={field.field}
                            onClick={() => {
                              const position = editor.current?.selectionStart ?? query.length;
                              setQuery(
                                query.slice(0, position) +
                                  field.field +
                                  query.slice(editor.current?.selectionEnd ?? position),
                              );
                              editor.current?.focus();
                            }}
                          >
                            <code>
                              {field.field}
                              {field.args.length ? `(${field.args.join(", ")})` : ""}
                            </code>
                            <small>{field.returns}</small>
                          </MotionButton>
                        ))}
                    </div>
                    <MotionButton
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => void run({ action: "introspect" })}
                    >
                      Refresh introspection
                    </MotionButton>
                  </div>
                </div>
                {indexerResult ? (
                  <Evidence observation={indexerResult} mode={indexerMode} />
                ) : (
                  <p className={styles.empty}>No query sent. Completion names come from recorded real introspection.</p>
                )}
              </div>
            )}
            {tab === "cost" && (
              <div className={styles.estimator}>
                <form
                  className={styles.estimateForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run({
                      action: "estimate",
                      input: { model, tokens: Number(tokens), outputTokens: Number(outputTokens) },
                    });
                  }}
                >
                  <label className={styles.field}>
                    <span>Model id</span>
                    <input value={model} onChange={(event) => setModel(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Input tokens</span>
                    <input inputMode="numeric" value={tokens} onChange={(event) => setTokens(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Output tokens</span>
                    <input
                      inputMode="numeric"
                      value={outputTokens}
                      onChange={(event) => setOutputTokens(event.target.value)}
                    />
                  </label>
                  <MotionButton className="button" disabled={busy} type="submit">
                    Compare estimates ↗
                  </MotionButton>
                </form>
                <p className="muted">
                  Results below use {estimate.input.tokens} input + {estimate.input.outputTokens} output tokens for{" "}
                  {estimate.input.model}. Inference estimate uses normal urgency with TEE requested.
                </p>
                <CostPanel estimate={estimate} mode={estimateMode} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
      <section ref={guide} className={styles.guide}>
        <div>
          <span className="eyebrow">Read the evidence</span>
          <h2>A response is a starting point.</h2>
          <p className="muted">The line tracks this reading guide, not verification progress.</p>
        </div>
        <div className={styles.steps}>
          <motion.div className={styles.readingProgress} style={{ scaleY: reduced ? 1 : progress }} />
          {[
            [
              "Validate",
              "Forms use the discovered input schema. Unknown fields and non-query GraphQL documents stop before sending.",
            ],
            [
              "Send",
              "The proxy uses a fixed read-only allowlist. Each visitor gets 20 units per minute. An estimate uses 5 units. One upstream operation runs at a time per server process.",
            ],
            [
              "Receive",
              "Results keep their source and observation time. Calls cache for 60 seconds. Discovery caches for 300 seconds. A cached answer is not a fresh measurement.",
            ],
            [
              "Check",
              "A schema pass only checks shape. Missing output schemas remain unchecked. TEE and inference-receipt answers can contain simulated or placeholder data.",
            ],
          ].map(([title, text], index) => (
            <ReadingReveal key={title} order={index}>
              <article>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </section>
      <section className={styles.footer}>
        <h2>Use it from your terminal</h2>
        <div className={styles.row}>
          <code>flop call flop_get_stats --json</code>
          <CopyButton text="flop call flop_get_stats --json" />
        </div>
        <p className="muted">
          After building the workspace, run <code>node packages/cli/dist/cli.js call flop_get_stats --json</code>.
        </p>
        <p>
          <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/console">
            Quick start and limits ↗
          </MotionLink>
        </p>
        <h3>What this does not verify</h3>
        <p>
          Schema checks do not verify chain truth, miner availability, model quality, TEE attestation or execution
          costs. Nominal devnet prices are not market quotes. The request budget and cache are local to each server
          process. Shared hosting addresses share a budget.
        </p>
        <pre className={styles.code}>{curlCommand("flop_get_stats", {})}</pre>
      </section>
    </div>
  );
}
