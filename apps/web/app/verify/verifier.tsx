// SPDX-License-Identifier: Apache-2.0
"use client";
import { ToolHeader } from "@/components/tool-header";

import { AnimatePresence, animate, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { HTMLMotionProps } from "motion/react";
import { channelInput, MAX_BUNDLE_BYTES, parseEvidence, recentInput, verifyEvidence } from "./library";
import type { Check, Evidence, Report, Status } from "./library";
import styles from "./verify.module.css";

const statuses: Status[] = ["PASS", "FAIL", "UNVERIFIABLE", "NOT_APPLICABLE"];
const labels: Record<Status, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  UNVERIFIABLE: "Unverifiable",
  NOT_APPLICABLE: "Not applicable",
};
const titles: Record<string, string> = {
  "bundle-integrity": "File integrity",
  "settlement-record": "Matching settlement",
  "escrow-conservation": "Escrow conservation",
  "display-price-ratio": "Displayed price ratio",
  "channel-consistency": "Channel agreement",
  "price-consistency": "Agreed compute price",
  "model-registry": "Model registry",
  "settlement-event": "Settlement event",
  "assurance-tier": "Assurance evidence",
  "challenge-window": "Challenge window",
  "merkle-inclusion": "Transcript inclusion",
  "tee-quote-digest": "Hardware quote",
  "indexer-channel": "Indexed channel agreement",
  "indexer-settlement": "Indexed settlement agreement",
  "indexer-htlc": "Indexed HTLC agreement",
  "htlc-link": "Explicit HTLC link",
  "htlc-preimage": "Public preimage",
  "htlc-timelock": "HTLC timeout and head",
  "htlc-amount": "HTLC escrow amount",
  "receipt-amount": "Receipt amount labels",
  "quote-structure": "Quote envelope structure",
  "quote-digest": "Quote byte digest",
  "attestation-trust": "Platform and measurement",
  "attestation-tcb": "TCB advisory binding",
  "tee-service-simulation": "Simulated service",
};
const groups = ["All evidence", "Settlement", "Indexer", "Receipts and HTLCs", "Attestation"] as const;
type Group = (typeof groups)[number];
function checkGroup(id: string): Group {
  if (id.startsWith("indexer-")) return "Indexer";
  if (id.startsWith("htlc-") || id.startsWith("receipt-")) return "Receipts and HTLCs";
  if (/^(tee-|quote-|attestation-)/.test(id)) return "Attestation";
  return "Settlement";
}

function Action(props: HTMLMotionProps<"button">) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileHover={reduced ? {} : { y: -1 }}
      whileTap={reduced ? {} : { scale: 0.98 }}
      whileFocus={{ borderColor: "var(--accent)" }}
      transition={{ duration: reduced ? 0 : 0.14 }}
      {...props}
    />
  );
}

function Count({ value }: { value: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const control = animate(0, value, {
      duration: 0.4,
      onUpdate: (n) => {
        if (node.current) node.current.textContent = Math.round(n).toString();
      },
    });
    return () => control.stop();
  }, [value, reduced]);
  return (
    <>
      <span className={styles.srOnly}>{value}</span>
      <span aria-hidden="true" ref={node}>
        {value}
      </span>
      <span className={styles.finalCount} aria-hidden="true">
        {" "}
        / {value}
      </span>
    </>
  );
}

function CheckRow({ check, bundle, index }: { check: Check; bundle: Evidence | null; index: number }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  return (
    <motion.li
      layout={!reduced}
      className={styles.check}
      data-status={check.status}
      initial={{ opacity: 1 }}
      whileInView={reduced ? {} : { opacity: [0.55, 1], y: [6, 0] }}
      viewport={{ once: true, amount: 0.1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.24, delay: reduced ? 0 : Math.min(index * 0.02, 0.2) }}
    >
      <Action
        className={styles.checkToggle}
        aria-expanded={open}
        aria-controls={`evidence-${check.id}`}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.checkNumber} aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className={styles.checkTitle}>
          {titles[check.id] ?? check.id}
          <span>{check.claim}</span>
        </span>
        <span className={styles.status} data-status={check.status}>
          {check.simulated ? "Simulated" : labels[check.status]}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open && !reduced ? 45 : 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          className={styles.expand}
        >
          {open && reduced ? "−" : "+"}
        </motion.span>
      </Action>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`evidence-${check.id}`}
            key="detail"
            className={styles.detail}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <p>{check.detail}</p>
            <h4>Inputs used by this check</h4>
            <pre>{JSON.stringify(check.inputs, null, 2)}</pre>
            <h4>Source observations</h4>
            {check.evidence.length === 0 && <p className="muted">The check uses the bundle itself.</p>}
            {check.evidence.map((id) => {
              const observation = bundle?.observations.find((row) => row.id === id);
              return (
                <details key={id} className={styles.observation}>
                  <summary>
                    {id} <span>{observation ? observation.tool : "Missing observation"}</span>
                  </summary>
                  {observation && (
                    <>
                      <p className={styles.source}>
                        {observation.source}
                        <br />
                        <time>{observation.measuredAt}</time>
                      </p>
                      <p className="muted">
                        {observation.attempts} recorded HTTP attempts. {observation.durationMs} ms recorded duration.
                      </p>
                      <pre>{JSON.stringify(observation.args, null, 2)}</pre>
                      <pre>{observation.raw ?? observation.error}</pre>
                    </>
                  )}
                </details>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** Interactive local replay of the same checks as the CLI. Example: <Verifier initialBundle={bundle} initialReport={report} />. */
export function Verifier({ initialBundle, initialReport }: { initialBundle: Evidence; initialReport: Report }) {
  const reduced = useReducedMotion();
  const [bundle, setBundle] = useState<Evidence | null>(initialBundle);
  const [report, setReport] = useState(initialReport);
  const [origin, setOrigin] = useState("Recorded example");
  const [mode, setMode] = useState<"channel" | "file">("channel");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<ReturnType<typeof recentInput> | null>(null);
  const [filter, setFilter] = useState<Status | "all" | "simulated">("all");
  const [group, setGroup] = useState<Group>("All evidence");
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: results, offset: ["start center", "end center"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const counts = Object.fromEntries(
    statuses.map((status) => [status, report.checks.filter((c) => c.status === status).length]),
  ) as Record<Status, number>;
  const visible = report.checks.filter(
    (c) =>
      (group === "All evidence" || checkGroup(c.id) === group) &&
      (filter === "all" || (filter === "simulated" ? c.simulated : c.status === filter && !c.simulated)),
  );
  const command =
    "pnpm --filter @flop-lab/verifier build && node packages/verifier/dist/cli.js bundle evidence.json --json";
  const readStep = (order: number) => ({
    initial: { opacity: 1, y: 0 },
    whileInView: reduced ? { opacity: 1 } : { y: [12, 0], opacity: [0.6, 1] },
    viewport: { once: true, amount: 0.1 },
    transition: { duration: reduced ? 0 : 0.3, delay: reduced ? 0 : order * 0.06 },
  });

  async function replay(value: unknown, label: string) {
    const next = await verifyEvidence(value);
    let parsed: Evidence | null = null;
    try {
      parsed = parseEvidence(value);
    } catch {
      /* Invalid files still show the verifier's FAIL result. */
    }
    setBundle(parsed);
    setReport(next);
    setOrigin(label);
    setFilter("all");
    setGroup("All evidence");
    setMessage(
      `Checks complete. ${next.checks.filter((c) => c.status === "FAIL").length} failed. ${next.checks.filter((c) => c.status === "UNVERIFIABLE").length} unverifiable.`,
    );
  }

  async function collect(id?: string) {
    setError("");
    setMessage("");
    let query: string;
    try {
      query = id === undefined ? "" : `?channel=${channelInput(id)}`;
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/verify/data${query}`, { signal: AbortSignal.timeout(125_000) });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Collection is busy. Try again after 30 seconds."
            : "Public evidence is unavailable. The previous result is still shown.",
        );
      const value: unknown = await response.json();
      if (id === undefined) {
        const list = recentInput(value);
        setRecent(list);
        setMessage(
          list.channelIds.length
            ? "Recent settlements loaded. Pick a channel to collect its evidence."
            : "No settlements in this response.",
        );
      } else {
        if (!value || typeof value !== "object" || !("bundle" in value))
          throw new Error("The server returned no evidence bundle.");
        parseEvidence(value.bundle);
        await replay(value.bundle, "Public collection");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Collection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(selected?: File) {
    if (!selected) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (selected.size > MAX_BUNDLE_BYTES) throw new Error("Bundle exceeds 1 MB. Choose a smaller JSON bundle.");
      let value: unknown;
      try {
        value = JSON.parse(await selected.text()) as unknown;
      } catch {
        throw new Error("This file is not valid JSON. The previous result is still shown.");
      }
      await replay(value, "Local file replay");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the file.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  function download() {
    if (!bundle) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "evidence.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Evidence bundle downloaded. Replay it here or with the CLI.");
  }

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 1 }}
      animate={reduced ? {} : { opacity: [0.85, 1] }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      <motion.a
        href="/#tools"
        className={styles.back}
        whileHover={reduced ? {} : { x: -3 }}
        whileTap={reduced ? {} : { scale: 0.98 }}
      >
        ← All tools
      </motion.a>
      <header className={styles.hero}>
        <div>
          <ToolHeader slug="verify" />
          <motion.p className={styles.intro} {...readStep(2)}>
            Check settlement views, receipts and attestation. See what agrees, what fails and what public data cannot
            prove.
          </motion.p>
        </div>
        <motion.aside className={styles.principle} {...readStep(3)}>
          <p className="eyebrow">The boundary matters</p>
          <p>
            A passing check
            <br />
            is a narrow claim.
          </p>
          <span>Matching arithmetic does not prove honest inference. Missing proof stays visible.</span>
          <div className={styles.legend}>
            <span data-status="PASS">Pass</span>
            <span data-status="FAIL">Fail</span>
            <span data-status="UNVERIFIABLE">Unverifiable</span>
          </div>
        </motion.aside>
      </header>

      <motion.section className={styles.workbench} aria-labelledby="inspect-heading" {...readStep(0)}>
        <div className={styles.workbenchHeading}>
          <h2 id="inspect-heading">Bring your evidence.</h2>
          <span className="eyebrow">Read-only / no wallet</span>
        </div>
        <div className={styles.tabs} role="group" aria-label="Evidence input mode">
          {(["channel", "file"] as const).map((item) => (
            <Action
              key={item}
              aria-pressed={mode === item}
              className={styles.tab}
              onClick={() => {
                setMode(item);
                setError("");
              }}
            >
              {mode === item && (
                <motion.span
                  layoutId="verify-mode"
                  className={styles.activeTab}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                />
              )}
              <span>{item === "channel" ? "Public channel" : "Verify a local bundle"}</span>
            </Action>
          ))}
        </div>
        <div className={styles.inputPanel}>
          <AnimatePresence mode="wait" initial={false}>
            {mode === "channel" ? (
              <motion.div
                key="channel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.1 }}
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void collect(channel);
                  }}
                >
                  <label htmlFor="channel-id">Channel id</label>
                  <div className={styles.inputRow}>
                    <motion.input
                      id="channel-id"
                      value={channel}
                      onChange={(event) => setChannel(event.target.value)}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={66}
                      disabled={busy}
                      whileFocus={{ borderColor: "var(--accent)" }}
                      aria-describedby="channel-help"
                    />
                    <Action type="submit" className="button" disabled={busy}>
                      Collect & check <span aria-hidden="true">↗</span>
                    </Action>
                  </div>
                  <p id="channel-help" className={styles.help}>
                    Collects public observations on demand. A devnet reset can remove old channels.
                  </p>
                </form>
                <div className={styles.actions}>
                  <Action className="quiet-button" disabled={busy} onClick={() => void collect()}>
                    Load recent settlements
                  </Action>
                  <Action
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      void replay(initialBundle, "Recorded example");
                    }}
                  >
                    Use recorded example
                  </Action>
                </div>
                {recent && (
                  <div className={styles.recent}>
                    <p className="muted">
                      Observed {recent.capturedAt} from {recent.source}
                    </p>
                    <div>
                      {recent.channelIds.map((id) => (
                        <Action
                          key={id}
                          className="quiet-button mono"
                          title={id}
                          disabled={busy}
                          onClick={() => {
                            setChannel(id);
                            void collect(id);
                          }}
                        >
                          {id.slice(0, 10)}…{id.slice(-6)}
                        </Action>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="file"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.1 }}
              >
                <h3>Same checks. Your browser.</h3>
                <p className={styles.help}>
                  Choose a saved evidence JSON file. Hashes and checks run locally. The file is never uploaded. No
                  network request is made by replay.
                </p>
                <input
                  ref={file}
                  className={styles.srOnly}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Evidence JSON file"
                  onChange={(event) => void upload(event.target.files?.[0])}
                  disabled={busy}
                />
                <Action className="button" onClick={() => file.current?.click()} disabled={busy}>
                  Choose evidence JSON <span aria-hidden="true">↑</span>
                </Action>
                <span className={styles.fileLimit}>Up to 1 MB</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={styles.feedback} aria-live="polite" role="status">
          {busy
            ? "Collecting or checking evidence. The previous result stays below."
            : message || "The recorded example below is ready to inspect."}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </motion.section>

      <section ref={results} className={styles.results} aria-labelledby="results-heading" aria-busy={busy}>
        <div className={styles.resultHeading}>
          <div>
            <p className="eyebrow">{origin}</p>
            <h2 id="results-heading">
              {report.exitCode === 1
                ? "Contradictions found."
                : report.exitCode === 3
                  ? "Evidence has limits."
                  : "Named checks agree."}
            </h2>
          </div>
          <Action className="quiet-button" disabled={!bundle || busy} onClick={download}>
            Download bundle ↓
          </Action>
        </div>
        <p className={styles.channelLabel}>
          Channel <code>{report.channelId}</code>
        </p>
        <p className={styles.source}>
          Captured <time>{report.capturedAt ?? "No valid capture time"}</time>
          {origin === "Recorded example" ? " / last-known example, not a live reading" : ""}
          <br />
          {report.sources.length
            ? [...new Set(report.sources.map((s) => s.source))].join(", ")
            : "No authenticated source"}
        </p>
        <div className={styles.metrics} aria-label="Check result counts">
          {statuses.map((status) => (
            <div key={status} data-status={status}>
              <strong>
                <Count value={counts[status]} />
              </strong>
              <span>{labels[status]}</span>
              <div className={styles.meter}>
                <motion.i
                  initial={false}
                  animate={{ scaleX: report.checks.length ? counts[status] / report.checks.length : 0 }}
                  transition={{ duration: reduced ? 0 : 0.4 }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className={styles.help}>
          Counts describe checks on this bundle. They are not a trust score. Final counts remain visible during motion.
        </p>
        <div className={styles.assurance} aria-label="Evidence boundaries">
          <div>
            <h3>Proven consistency</h3>
            <p>Only the named arithmetic, byte or data-view agreement. A pass does not prove honest inference.</p>
          </div>
          <div>
            <h3>Not provable from public data</h3>
            <p>Missing links, empty trust keys and unsigned evidence remain unverifiable.</p>
          </div>
          <div>
            <h3>Simulated by the service</h3>
            <p>The TEE simulation never adds a pass. Receipt placeholder fields do not prove payment.</p>
          </div>
        </div>
        <div className={styles.filters} role="group" aria-label="Evidence groups">
          {groups.map((item) => (
            <Action
              key={item}
              className="quiet-button"
              aria-pressed={group === item}
              onClick={() => {
                setGroup(item);
                setFilter("all");
              }}
            >
              {item}
            </Action>
          ))}
        </div>
        <div className={styles.filters} role="group" aria-label="Filter checks">
          {(["all", ...statuses, "simulated"] as const).map((status) => (
            <Action
              className="quiet-button"
              key={status}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status === "all" ? "All checks" : status === "simulated" ? "Simulated service" : labels[status]}
            </Action>
          ))}
        </div>
        <div className={styles.checklist}>
          <div className={styles.readingRail} aria-hidden="true">
            <motion.div style={{ scaleY: reduced ? 1 : progress }} />
          </div>
          <motion.ol layout={!reduced} className={styles.checks} transition={{ duration: reduced ? 0 : 0.25 }}>
            <AnimatePresence initial={false}>
              {visible.map((check) => (
                <CheckRow
                  key={`${bundle?.sha256}-${check.id}`}
                  check={check}
                  bundle={bundle}
                  index={report.checks.indexOf(check)}
                />
              ))}
            </AnimatePresence>
          </motion.ol>
          {!visible.length && <p className={styles.empty}>No checks have this result.</p>}
        </div>
        <p className={styles.help}>
          The side rail tracks reading position. Expand a check for its exact inputs and dated observations.
        </p>
      </section>

      <motion.section className={styles.offline} {...readStep(0)} aria-labelledby="repeat-heading">
        <div>
          <p className="eyebrow">Keep the evidence</p>
          <h2 id="repeat-heading">Repeat it outside this page.</h2>
          <p className="muted">
            From a checkout of flop-lab, save the downloaded file as <code>evidence.json</code> at the repository root.
            Run <code>pnpm install --frozen-lockfile</code> first.
          </p>
        </div>
        <div className={styles.command}>
          <code>{command}</code>
          <Action
            className="quiet-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(command);
                setCopied(true);
              } catch {
                setError("Clipboard is unavailable. Select the command to copy it.");
              }
            }}
          >
            {copied ? "Copied" : "Copy command"}
          </Action>
        </div>
        <p className="muted">
          CLI exit codes: 0 for named checks that pass or do not apply. 1 for any failure. 3 for missing proof with no
          failure.
        </p>
        <p className={styles.boundary}>
          What a passing run still does not prove: honest inference, authenticated sources, chain finality, historical
          prices or exact challenge eligibility. An unsigned bundle can be edited and rehashed.
        </p>
        <motion.a
          href="https://github.com/zkasuran/flop-lab/tree/main/packages/verifier#checks"
          whileHover={reduced ? {} : { x: 3 }}
        >
          Read each check and its limits ↗
        </motion.a>
      </motion.section>
    </motion.div>
  );
}
