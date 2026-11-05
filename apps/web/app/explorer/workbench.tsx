// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { parseExploration } from "../../../../packages/explorer/src/report";
import type { Entity, Evidence, Exploration, Kind } from "../../../../packages/explorer/src/types";
import styles from "./explorer.module.css";

const names: Record<Kind, string> = {
  block: "Block",
  transaction: "Transaction",
  account: "Account",
  channel: "Compute channel",
  htlc: "HTLC",
};
const rawAmounts = new Set([
  "escrow",
  "minerPaid",
  "burned",
  "unusedEscrow",
  "refunded",
  "balance",
  "amount",
  "remainingPrincipal",
  "totalSpentRaw",
  "totalReceivedRaw",
  "totalPaidRaw",
]);
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function display(value: unknown) {
  return value === null || value === undefined
    ? "Not supplied"
    : typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);
}

function Values({ evidence }: { evidence: Evidence }) {
  if (evidence.state === "unavailable") return <p className={styles.warning}>{evidence.error}</p>;
  if (evidence.data === null) return <p className="muted">No indexed match in this response.</p>;
  const row = object(evidence.data);
  if (!row) return <pre className={styles.code}>{display(evidence.data)}</pre>;
  return (
    <dl className={styles.values}>
      {Object.entries(row).map(([key, value]) => (
        <div key={key} title={`${evidence.source}\n${evidence.tool}\n${evidence.measuredAt}`}>
          <dt>
            {key}
            {rawAmounts.has(key) && <small>raw units</small>}
          </dt>
          <dd>{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
function EvidencePanel({ evidence, primary = false }: { evidence: Evidence; primary?: boolean }) {
  const content = (
    <>
      <p className={styles.source}>
        <span>{evidence.tool}</span>
        <time dateTime={evidence.measuredAt}>{evidence.measuredAt}</time>
      </p>
      <Values evidence={evidence} />
      <Disclosure title={`Source and query: ${evidence.label}`}>
        <p className="muted">
          Source: <code>{evidence.source}</code>. Received {evidence.measuredAt}.
        </p>
        <pre className={styles.code}>
          {evidence.query ?? evidence.tool}
          {"\n"}
          {JSON.stringify(evidence.variables, null, 2)}
        </pre>
        <CopyButton text={evidence.query ?? evidence.tool} label="Copy query" />
        <Disclosure title={`Raw response: ${evidence.label}`}>
          <pre className={styles.code}>{evidence.raw ?? "No response captured"}</pre>
        </Disclosure>
      </Disclosure>
    </>
  );
  return primary ? (
    <div className={styles.primary}>{content}</div>
  ) : (
    <Disclosure title={`${evidence.label} / ${evidence.state}`}>{content}</Disclosure>
  );
}
function Split({ entity }: { entity: Entity }) {
  const reduced = useReducedMotion() !== false;
  const price = object(entity.evidence.find((e) => e.label === "settlementPrice")?.data);
  if (!price || typeof price.escrow !== "string" || !/^\d+$/.test(price.escrow) || BigInt(price.escrow) === 0n)
    return null;
  const total = BigInt(price.escrow);
  return (
    <div className={styles.split} aria-label="Observed escrow components">
      <p className="eyebrow">Settlement amounts / raw units</p>
      {(["minerPaid", "burned", "unusedEscrow"] as const).map((key, index) => {
        const value = price[key];
        if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
        const ratio = Math.min(1, Number((BigInt(value) * 1000000n) / total) / 1000000);
        return (
          <div key={key} className={styles.part}>
            <div>
              <span>{key}</span>
              <code>{value}</code>
            </div>
            <div className={styles.track}>
              <motion.div
                data-split-bar={key}
                className={styles.fill}
                data-tone={index}
                initial={{ scaleX: reduced ? ratio : 0 }}
                whileInView={{ scaleX: ratio }}
                viewport={{ once: true }}
                transition={{ duration: reduced ? 0 : 0.48 }}
              />
            </div>
          </div>
        );
      })}
      <p className="muted">Bar length = component / escrow, capped at the track. Exact amounts are shown above.</p>
    </div>
  );
}

export function Workbench({
  initial,
  emptyProofs,
}: {
  initial: Exploration;
  emptyProofs: { count: number; measuredAt: string; source: string; query: string };
}) {
  const [report, setReport] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reduced = useReducedMotion() !== false;
  const results = useRef<HTMLElement>(null);
  const activeRequest = useRef(0);
  const { scrollYProgress } = useScroll({ target: results, offset: ["start 80%", "end 60%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const command = `node packages/cli/dist/cli.js explore ${report.input} --json`;
  async function search(query: string, recording?: Kind) {
    const request = ++activeRequest.current;
    setBusy(true);
    setError("");
    try {
      const url = recording
        ? `/explorer/query?recorded=${recording}`
        : `/explorer/query?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      const value: unknown = await response.json();
      if (!response.ok)
        throw new Error(typeof object(value)?.error === "string" ? String(object(value)?.error) : "Search unavailable");
      const next = parseExploration(value);
      if (request === activeRequest.current) {
        setReport(next);
        if (!recording) setInput(query);
      }
    } catch (cause) {
      if (request === activeRequest.current) setError(cause instanceof Error ? cause.message : "Search unavailable");
    } finally {
      if (request === activeRequest.current) setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void search(input);
  }
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ReadingReveal>
          <p className="eyebrow">Observe / chain explorer</p>
          <h1>
            Find the record.
            <br />
            <span>Follow the evidence.</span>
          </h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <p className={styles.lead}>
            What is in this block, transaction, account or channel? Read the values. Open the query. Keep the gaps in
            view.
          </p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <form onSubmit={submit} className={styles.search}>
            <label htmlFor="explorer-input">Block number, transaction hash, account, channel ID or hash lock</label>
            <div>
              <motion.input
                id="explorer-input"
                name="q"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={128}
                placeholder="Block number, 0x hash or SS58 address"
                required
                autoComplete="off"
                spellCheck={false}
                whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
                transition={{ duration: reduced ? 0 : 0.16 }}
              />
              <MotionButton type="submit" className="button" disabled={busy}>
                {busy ? "Reading..." : "Search devnet"}
              </MotionButton>
            </div>
          </form>
          <p className={styles.budget}>
            Live search: short server cache. Three searches per visitor per minute. No wallet needed.
          </p>
          <div className={styles.examples} aria-label="Recorded examples">
            <span>Recorded examples</span>
            {(Object.keys(names) as Kind[]).map((kind) => (
              <MotionButton className="quiet-button" key={kind} disabled={busy} onClick={() => void search("", kind)}>
                {names[kind]}
              </MotionButton>
            ))}
          </div>
        </ReadingReveal>
      </header>

      <section className={styles.results} ref={results} aria-labelledby="results-title" aria-busy={busy}>
        <div className={styles.readingTrack} aria-hidden="true">
          <motion.div style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        <div className={styles.resultHead}>
          <div>
            <p className="eyebrow">
              {report.mode === "recorded" ? "Recorded real devnet response" : `Live search / cache ${report.cache}`}
            </p>
            <h2 id="results-title">
              {report.status === "not_found"
                ? "No indexed match."
                : report.status === "unavailable"
                  ? "Evidence unavailable."
                  : report.status === "partial"
                    ? "A record with a gap."
                    : "A record you can trace."}
            </h2>
          </div>
          <span className={styles.status} data-status={report.status}>
            {report.status.replace("_", " ")}
          </span>
        </div>
        <p className={styles.searchInput}>
          <code>{report.input}</code>
        </p>
        <p className="muted">
          Search captured <time dateTime={report.searchedAt}>{report.searchedAt}</time>.{" "}
          {report.mode === "recorded"
            ? "This example is saved, not a current chain view."
            : "Every observation below has its own receipt time."}
        </p>
        <div className={styles.metrics}>
          <div>
            <strong>
              <ObservedNumber value={report.entities.length} />
            </strong>
            <span>matching entities</span>
          </div>
          <div>
            <strong>
              <ObservedNumber value={report.requests} />
            </strong>
            <span>{report.mode === "recorded" ? "requests at capture" : "new MCP requests"}</span>
          </div>
          <div>
            <strong>
              <ObservedNumber value={report.durationMs} />
              <small> ms</small>
            </strong>
            <span>measured search duration</span>
          </div>
        </div>
        <div className={styles.message} role="status" aria-live="polite">
          {error ? (
            <span className={styles.warning}>{error} Previous result remains visible.</span>
          ) : busy ? (
            "Reading public evidence. The current result stays visible."
          ) : (
            `${report.entities.length} matching ${report.entities.length === 1 ? "entity" : "entities"}. ${report.mode} evidence.`
          )}
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {report.entities.map((entity) => (
            <motion.article
              className={styles.card}
              key={`${report.input}:${entity.kind}`}
              layout={!reduced}
              initial={{ opacity: 1, y: reduced ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.26 }}
            >
              <div className={styles.cardHead}>
                <h3>{names[entity.kind]}</h3>
                <CopyButton text={entity.id} label="Copy identifier" />
              </div>
              {entity.notes.map((note) => (
                <p key={note} className={styles.note}>
                  {note}
                </p>
              ))}
              {entity.derived.map((d) => (
                <div className={styles.derived} key={d.label}>
                  <span>{d.label}</span>
                  <strong data-result={d.value}>{d.value}</strong>
                  <Disclosure title={`How ${d.label.toLowerCase()} is derived`}>
                    <code>{d.formula}</code>
                    <p className="muted">Input observations: {d.evidence.join(" + ")}</p>
                  </Disclosure>
                </div>
              ))}
              <Split entity={entity} />
              {entity.kind === "channel" && (
                <div className={styles.verifier}>
                  <CopyButton text={entity.id} label="Copy channel ID" />
                  <MotionLink href="/verify" className="quiet-button">
                    Open in verifier ↗
                  </MotionLink>
                  <span>Paste the channel ID into the verifier to collect its evidence.</span>
                </div>
              )}
              <div className={styles.related}>
                {entity.links.map((link, i) => (
                  <MotionButton
                    key={`${link.input}:${i}`}
                    className="quiet-button"
                    disabled={busy}
                    title={link.input}
                    onClick={() => void search(link.input)}
                  >
                    {link.label} ↗
                  </MotionButton>
                ))}
              </div>
              {entity.evidence.map((e, i) => (
                <EvidencePanel key={`${report.searchedAt}:${e.label}`} evidence={e} primary={i === 0} />
              ))}
            </motion.article>
          ))}
        </AnimatePresence>
        <Disclosure title="All identifier lookups">
          {report.lookups.map((e) => (
            <EvidencePanel key={e.label} evidence={e} />
          ))}
        </Disclosure>
        <div className={styles.command}>
          <code>{command}</code>
          <CopyButton text={command} label="Copy command" />
        </div>
        <p className="muted">
          Run from a built flop-lab workspace.{" "}
          <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/explorer">
            Setup and CLI options ↗
          </MotionLink>
        </p>
      </section>

      <section className={styles.limits} aria-labelledby="limits-title">
        <ReadingReveal>
          <p className="eyebrow">Absence is also an observation</p>
          <h2 id="limits-title">
            Show the empty page.
            <br />
            Name what is missing.
          </h2>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.empty}>
            <strong>
              <ObservedNumber value={emptyProofs.count} />
            </strong>
            <div>
              <h3>PoUI proofs in this recorded query</h3>
              <p className="muted">
                Observed {emptyProofs.measuredAt}. This describes the saved response, not the current network.
              </p>
            </div>
          </div>
          <Disclosure title="Empty proof query">
            <p>{emptyProofs.source}</p>
            <pre className={styles.code}>{emptyProofs.query}</pre>
          </Disclosure>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="muted">
            Fees and transaction events are not in the observed indexer schema. Block transactions are a bounded recent
            window. Indexer balances and balance-tool values are separate sources. Empty rows and arithmetic checks do
            not prove chain state, finality or inference.
          </p>
        </ReadingReveal>
      </section>
    </div>
  );
}
