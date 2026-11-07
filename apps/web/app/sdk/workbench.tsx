// SPDX-License-Identifier: Apache-2.0
"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { summarize, versions } from "../../../../packages/sdkconf/src/model";
import type { Report, Result, Sdk, Status, Trace } from "../../../../packages/sdkconf/src/model";
import styles from "./workbench.module.css";

const statuses: Status[] = ["PASS", "FAIL", "SKIPPED"];
const sdks: Sdk[] = ["client", "sdk", "cli", "python"];
const names = { client: "Gateway client", sdk: "Chain SDK", cli: "Network CLI", python: "Python SDK" };
const build = process.env.NEXT_PUBLIC_BUILD_COMMIT;
const revision = build && /^[a-f0-9]{40}$/.test(build) ? build : "main";
const source = `https://github.com/zkasuran/flop-lab/tree/${revision}/packages/sdkconf`;
const command = "pnpm --filter @flop-lab/sdkconf start run";
const utc = (value: string) =>
  new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");

function Copy({ text }: { text: string }) {
  const [status, setStatus] = useState("Copy command");
  return (
    <div className={styles.command}>
      <code>{text}</code>
      <MotionButton
        className={styles.control}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => setStatus("Copied"),
            () => setStatus("Select text to copy"),
          );
        }}
      >
        {status}
      </MotionButton>
      <span className={styles.srOnly} role="status">
        {status === "Copy command" ? "" : status}
      </span>
    </div>
  );
}

function TraceSequence({ trace }: { trace: Trace[] }) {
  const reduced = useReducedMotion() !== false;
  return trace.length ? (
    <ol className={styles.trace} aria-label="Recorded request sequence">
      {trace.map((entry, index) => (
        <motion.li
          key={entry.sequence}
          data-trace-step={index}
          initial={{ opacity: reduced ? 1 : 0.35, x: reduced ? 0 : -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduced ? 0 : 0.24, delay: reduced ? 0 : Math.min(index * 0.12, 0.3) }}
        >
          <span className={styles.node}>{entry.sequence}</span>
          <div>
            <strong>
              {entry.method} <span className="muted">{new URL(entry.url).pathname}</span>
            </strong>
            <p>
              {entry.headers["x-payment-proof"]
                ? "Payment proof attached"
                : index
                  ? "Request repeated"
                  : "Initial request"}
            </p>
            <span className={styles.timing}>+{entry.atMs} ms from scenario start</span>
          </div>
          <span className={styles.response} data-status={entry.status !== null && entry.status < 400 ? "PASS" : "FAIL"}>
            {entry.status === null ? entry.outcome : `HTTP ${entry.status}`}
            {entry.responseHeaders["retry-after"] && <small>Retry-After: {entry.responseHeaders["retry-after"]}</small>}
          </span>
        </motion.li>
      ))}
    </ol>
  ) : (
    <p className="muted">No HTTP request was made. This check called the SDK locally.</p>
  );
}

function Finding({ result }: { result: Result }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() !== false;
  return (
    <motion.article
      layout={reduced ? false : "position"}
      className={styles.finding}
      data-status={result.status}
      transition={{ duration: reduced ? 0 : 0.22 }}
    >
      <MotionButton
        className={styles.findingToggle}
        aria-expanded={open}
        aria-controls={`detail-${result.id}`}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.badge} data-status={result.status}>
          {result.status}
        </span>
        <span>
          <strong>{result.title}</strong>
          <small>
            {names[result.sdk]} {result.version} · {result.citation.basis}
          </small>
        </span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
          aria-hidden="true"
        >
          ›
        </motion.span>
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`detail-${result.id}`}
            className={styles.detail}
            key="detail"
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <div className={styles.expectation}>
              <div>
                <p className="eyebrow">Expected</p>
                <p>{result.expected}</p>
              </div>
              <div>
                <p className="eyebrow">Result</p>
                <p>{result.reason}</p>
                {result.issue && (
                  <MotionLink href={`https://github.com/flop-labs/network/issues/${result.issue}`}>
                    Existing issue #{result.issue} ↗
                  </MotionLink>
                )}
              </div>
            </div>
            <blockquote>
              <p>{result.citation.quote}</p>
              <cite>
                <MotionLink href={result.citation.source}>Published reference ↗</MotionLink> · lines{" "}
                {result.citation.lines} · {result.citation.basis}
              </cite>
            </blockquote>
            {result.attempts.map((attempt, index) => (
              <section className={styles.attempt} key={attempt.measuredAt + index}>
                <p className="eyebrow">
                  Attempt {index + 1} · {attempt.passed ? "matches" : "differs"} · {utc(attempt.measuredAt)}
                </p>
                <TraceSequence trace={attempt.trace} />
                <pre>{attempt.observed}</pre>
              </section>
            ))}
            <Copy text={`${command} --scenario ${result.id}`} />
            <p className={styles.note}>
              Runs locally against pinned packages. FAIL returns exit code 1. Request timings are from the mock, not the
              devnet.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Matrix({ results, select }: { results: Result[]; select: (sdk: Sdk, behaviour: string) => void }) {
  const behaviours = [...new Set(results.map((r) => r.behaviour))];
  return (
    <div
      className={styles.matrixScroll}
      tabIndex={0}
      role="region"
      aria-label="SDK behaviour matrix, scroll horizontally on small screens"
    >
      <table className={styles.matrix}>
        <caption>
          Observed checks by package and behaviour. Select a cell to inspect its checks. Blank cells mean no check is
          defined.
        </caption>
        <thead>
          <tr>
            <th scope="col">Behaviour</th>
            {sdks.map((sdk) => (
              <th scope="col" key={sdk}>
                {names[sdk]}
                <small>{versions[sdk]}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {behaviours.map((behaviour) => (
            <tr key={behaviour}>
              <th scope="row">{behaviour}</th>
              {sdks.map((sdk) => {
                const matches = results.filter((r) => r.sdk === sdk && r.behaviour === behaviour);
                const counts = summarize(matches);
                return (
                  <td key={sdk}>
                    {matches.length ? (
                      <MotionButton
                        className={styles.cell}
                        onClick={() => select(sdk, behaviour)}
                        aria-label={`Inspect ${names[sdk]} ${behaviour}`}
                      >
                        {statuses
                          .filter((s) => counts[s])
                          .map((s) => (
                            <span key={s} data-status={s}>
                              {counts[s]} {s}
                            </span>
                          ))}
                      </MotionButton>
                    ) : (
                      <span className={styles.blank} aria-label="No check">
                        ·
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Workbench({ report }: { report: Report | null }) {
  const [sdk, setSdk] = useState<Sdk | "all">("all");
  const [status, setStatus] = useState<Status | "all">("FAIL");
  const [behaviour, setBehaviour] = useState<string | null>(null);
  const details = useRef<HTMLElement>(null);
  const journey = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: journey, offset: ["start 80%", "end 30%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  if (!report || !report.results.length)
    return (
      <div className={`container ${styles.page}`}>
        <MotionLink href="/">← All tools</MotionLink>
        <h1>SDK conformance</h1>
        <p>No valid recorded report is available.</p>
        <Copy text={command} />
      </div>
    );
  const counts = summarize(report.results);
  const filtered = report.results.filter(
    (r) =>
      (sdk === "all" || r.sdk === sdk) &&
      (status === "all" || r.status === status) &&
      (!behaviour || r.behaviour === behaviour),
  );
  const handshake = report.results.find((r) => r.id === "sdk-x402-class");
  const mockRequests = report.results.reduce(
    (sum, r) => sum + r.attempts.reduce((sum, a) => sum + a.trace.length, 0),
    0,
  );
  return (
    <div className={`container ${styles.page}`}>
      <MotionLink href="/" className={styles.back}>
        ← All tools
      </MotionLink>
      <section className={styles.hero}>
        <div>
          <ReadingReveal>
            <p className="eyebrow">Build / SDK conformance</p>
            <h1>
              One call.
              <br />
              <span>What happens next?</span>
            </h1>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <p className={styles.intro}>
              Do the FLOP SDKs behave as documented? Run the published packages against scripted responses. See every
              retry and every mismatch.
            </p>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <Copy text={command} />
            <p className={styles.note}>Offline runner · pinned releases · no wallet required</p>
          </ReadingReveal>
        </div>
        <ReadingReveal order={3}>
          <section className={styles.summary} aria-label="Recorded SDK run">
            <p className="eyebrow">Recorded offline run</p>
            <div className={styles.counts}>
              {statuses.map((s) => (
                <div key={s} data-status={s}>
                  <strong>
                    <ObservedNumber value={counts[s]} />
                  </strong>
                  <span>{s}</span>
                </div>
              ))}
            </div>
            <div className={styles.bars} aria-hidden="true">
              {statuses.map((s) => (
                <motion.div
                  key={s}
                  data-status={s}
                  style={{ flexGrow: counts[s] }}
                  initial={false}
                  whileInView={{ scaleX: reduced ? 1 : [0, 1] }}
                  viewport={{ once: true }}
                  transition={{ duration: reduced ? 0 : 0.4 }}
                />
              ))}
            </div>
            <p>Each FAIL was reproduced twice. A SKIPPED check makes no claim.</p>
            <time dateTime={report.measuredAt}>{utc(report.measuredAt)}</time>
            <p className={styles.note}>
              {report.runtime} · {report.durationMs} ms runner time
            </p>
            <MotionLink href={`${source}/fixtures/report.json`}>Read the full recording ↗</MotionLink>
          </section>
        </ReadingReveal>
      </section>

      <section ref={journey} className={styles.journey} aria-labelledby="journey-title">
        <p className="eyebrow">01 / Follow the evidence</p>
        <h2 id="journey-title">A retry is another request.</h2>
        <p className="muted">
          This recorded class handshake sends the unpaid request again before attaching proof. The server responses and
          payment are synthetic.
        </p>
        <div className={styles.progress} aria-hidden="true">
          <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
        </div>
        {handshake?.attempts[0] && <TraceSequence trace={handshake.attempts[0].trace} />}
        <div className={styles.facts}>
          <span>
            <strong>{mockRequests}</strong> mocked requests in this run
          </span>
          <span>
            <strong>{report.networkRequests}</strong> public requests during the run
          </span>
          <span>Source: pinned npm artifacts + scripted transport</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="matrix-title">
        <p className="eyebrow">02 / Coverage</p>
        <h2 id="matrix-title">Package × behaviour</h2>
        <p className="muted">
          These are scenario outcomes, not an SDK-wide certification. README claims, type contracts and issue
          regressions are labelled in each check.
        </p>
        <Matrix
          results={report.results}
          select={(sdk, behaviour) => {
            setSdk(sdk);
            setBehaviour(behaviour);
            setStatus("all");
            details.current?.scrollIntoView({ behavior: "instant", block: "start" });
          }}
        />
      </section>

      <section ref={details} className={styles.section} aria-labelledby="findings-title">
        <p className="eyebrow">03 / Inspect and reproduce</p>
        <h2 id="findings-title">Open the request trace.</h2>
        <div className={styles.filters} role="group" aria-label="Filter by package">
          {(["all", ...sdks] as const).map((s) => (
            <MotionButton
              key={s}
              className={styles.control}
              aria-pressed={sdk === s}
              onClick={() => {
                setSdk(s);
                setBehaviour(null);
              }}
            >
              {s === "all" ? "All packages" : names[s]}
            </MotionButton>
          ))}
        </div>
        <div className={styles.filters} role="group" aria-label="Filter by outcome">
          {(["all", ...statuses] as const).map((s) => (
            <MotionButton
              key={s}
              className={styles.control}
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setBehaviour(null);
              }}
            >
              {s === "all" ? "All outcomes" : s}
            </MotionButton>
          ))}
          {behaviour && (
            <MotionButton className={styles.control} onClick={() => setBehaviour(null)}>
              Clear {behaviour} ×
            </MotionButton>
          )}
        </div>
        <p className={styles.note} role="status">
          {filtered.length} checks shown{behaviour ? ` · ${behaviour}` : ""}
        </p>
        <div className={styles.findings}>
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.map((r) => (
              <motion.div
                layout={reduced ? false : "position"}
                key={r.id}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.16 }}
              >
                <Finding result={r} />
              </motion.div>
            ))}
          </AnimatePresence>
          {!filtered.length && <p>No checks match these filters.</p>}
        </div>
      </section>

      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          These checks do not establish live service behaviour, duplicate payments, wallet creation on chain or
          settlement finality. Faucet refusals, payment challenges and chain calls are synthetic. CLI coverage is
          limited to startup and help. Python coverage is limited to async health.
        </p>
        <p>
          The model feed and MCP response were recorded from public services. They are fixed fixtures, not current
          devnet measurements. No hosted MCP client is documented by the pinned SDKs; the shared flop-lab MCP client
          checks that fixture separately.
        </p>
        <p>
          <MotionLink href={source}>Source and quick start ↗</MotionLink> ·{" "}
          <MotionLink href="/harness">Check network claims ↗</MotionLink>
        </p>
      </section>
    </div>
  );
}
