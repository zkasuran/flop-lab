// SPDX-License-Identifier: Apache-2.0
"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { CopyButton } from "@/components/controls";
import { checkExchange, parseExchange, type Exchange } from "../../../../packages/x402kit/src/checker";
import { RULES, type RuleId } from "../../../../packages/x402kit/src/rules";
import reference from "../../../../packages/x402kit/fixtures/handshake.json";
import sdk from "../../../../packages/x402kit/fixtures/sdk-handshake.json";
import manifest from "../../../../packages/x402kit/fixtures/sdk-manifest.json";
import styles from "./handshake.module.css";

const examples = [
  { name: "Mock reference pair", value: reference },
  { name: "SDK class: issue #89", value: sdk.wrapped.exchange },
  { name: "SDK standalone", value: sdk.direct.exchange },
] as const;
const headerRules: Record<string, RuleId> = {
  "x-payment-price": "price",
  "x-payment-hash-lock": "hash",
  "x-payment-timeout-blocks": "timeout",
  "x-payment-destination": "destination",
  "x-payment-asset": "asset",
  "x-payment-network": "network",
  "x-payment-required": "devnet",
  "x-payment-proof": "proof",
  "x-flop-request-id": "binding",
  "x-flop-request-hash": "binding",
  "x-flop-expires-at": "expiry",
  "x-flop-executable": "devnet",
};
const labels = {
  "no-deviations": "No deviations in checked rules",
  incomplete: "Needs more evidence",
  deviations: "Deviations found",
};
const command = "node packages/x402kit/dist/cli.js check packages/x402kit/fixtures/handshake.json";

/** Inspect recorded headers and check a pasted exchange entirely in the browser. @example <HandshakeChecker /> */
export function HandshakeChecker() {
  const reduced = useReducedMotion() !== false;
  const [exchange, setExchange] = useState<Exchange>(() => parseExchange(reference));
  const [example, setExample] = useState<number | null>(0);
  const [step, setStep] = useState(1);
  const [input, setInput] = useState(JSON.stringify(reference, null, 2));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start 85%", "end 35%"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const report = checkExchange(exchange);
  const messages = exchange.rounds.flatMap((round, i) => [
    {
      key: `${i}-request`,
      title: round.request.headers.some(([name]) => name.toLowerCase() === "x-payment-proof")
        ? "Proof retry"
        : "Unpaid request",
      direction: "Client to paywall",
      headers: round.request.headers,
      body: round.request.body,
      stamp: round.measuredAt,
    },
    {
      key: `${i}-response`,
      title: `HTTP ${round.response.status}`,
      direction: "Paywall to client",
      headers: round.response.headers,
      body: round.response.body,
      stamp: round.measuredAt,
    },
  ]);
  const active = messages[step] ?? messages[0];
  const unpaidRatio = report.requestCount ? report.unpaidRequests / report.requestCount : 0;

  function choose(index: number) {
    const next = parseExchange(examples[index]!.value);
    setExchange(next);
    setExample(index);
    setInput(JSON.stringify(next, null, 2));
    setError("");
    setDirty(false);
    setStep(1);
  }
  function check() {
    try {
      if (new TextEncoder().encode(input).length > 131072) throw new Error("Exchange exceeds 128 KiB");
      const raw: unknown = JSON.parse(input);
      const next = parseExchange(raw && typeof raw === "object" && "exchange" in raw ? raw.exchange : raw);
      setExchange(next);
      setExample(null);
      setStep(next.rounds.length ? 1 : 0);
      setError("");
      setDirty(false);
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : "Invalid exchange"}. The last checked report remains below.`,
      );
    }
  }

  return (
    <section ref={section} id="handshake" className={styles.section} aria-labelledby="handshake-title">
      <ReadingReveal>
        <p className="eyebrow">Both sides of the wire</p>
        <h2 id="handshake-title">Does the handshake agree?</h2>
        <p className={styles.intro}>
          Expand a header to see its value and the rule behind it. Compare the reference with a recorded SDK failure or
          check your own exchange.
        </p>
      </ReadingReveal>
      <div className={styles.readingTrack} aria-hidden="true">
        <motion.div data-handshake-progress style={{ scaleX: reduced ? 1 : progress }} />
      </div>
      <p className={styles.caption}>The line tracks reading progress. All example payments are mock values.</p>
      <div className={styles.controls} role="group" aria-label="Handshake examples">
        {examples.map((item, i) => (
          <MotionButton
            key={item.name}
            className={styles.choice}
            onClick={() => choose(i)}
            aria-pressed={example === i}
          >
            {example === i && (
              <motion.span
                data-handshake-selection
                className={styles.selection}
                layoutId={reduced ? undefined : "handshake-example"}
                transition={{ duration: reduced ? 0 : 0.32 }}
              />
            )}
            <span>{item.name}</span>
          </MotionButton>
        ))}
        <MotionButton
          className="quiet-button"
          aria-expanded={editing}
          aria-controls="exchange-editor"
          onClick={() => setEditing(!editing)}
        >
          Paste an exchange
        </MotionButton>
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            id="exchange-editor"
            className={styles.editor}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            <label htmlFor="exchange-json">Exchange JSON</label>
            <p id="exchange-help" className={styles.caption}>
              Use the CLI capture format shown below. Header pairs preserve duplicates. Input stays in this browser.
            </p>
            <textarea
              id="exchange-json"
              aria-describedby="exchange-help exchange-error"
              spellCheck={false}
              value={input}
              maxLength={131072}
              onChange={(event) => {
                setInput(event.target.value);
                setDirty(true);
                setError("");
              }}
            />
            <div className={styles.controls}>
              <MotionButton className="button" onClick={check}>
                Check exchange
              </MotionButton>
              <CopyButton text={JSON.stringify(exchange, null, 2)} label="Copy checked exchange" />
            </div>
            <p id="exchange-error" role="status" className={styles.error}>
              {error ||
                (dirty
                  ? "Input changed. The report below still describes the last checked exchange."
                  : "The report describes the checked exchange.")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className={styles.provenance}>
        <span>
          {example === null ? "Pasted capture. Source and time are unverified." : "Recorded run. Mock payments only."}
        </span>
        <span>Captured {exchange.measuredAt}</span>
        <span>Source: {exchange.source}</span>
        <span>
          Profile: {exchange.profile}. SDK artifact recorded {manifest[0]!.measuredAt}.
        </span>
      </div>
      <div className={styles.summary} aria-label="Checked exchange summary">
        <div>
          <span>Requests in capture</span>
          <strong>
            <ObservedNumber value={report.requestCount} />
          </strong>
        </div>
        <div>
          <span>Unpaid requests</span>
          <strong>
            <ObservedNumber value={report.unpaidRequests} />
          </strong>
        </div>
        <div>
          <span>Proof-bearing requests</span>
          <strong>
            <ObservedNumber value={report.proofRequests} />
          </strong>
        </div>
        <div>
          <span>Reported deviations</span>
          <strong>
            <ObservedNumber value={report.deviations.length} />
          </strong>
        </div>
      </div>
      <div className={styles.ratio} aria-hidden="true">
        <motion.div initial={false} animate={{ scaleX: unpaidRatio }} transition={{ duration: reduced ? 0 : 0.35 }} />
      </div>
      <p className={styles.caption}>Bar = unpaid requests / captured requests. Counts describe this capture only.</p>
      <div className={styles.steps} role="group" aria-label="Captured handshake messages">
        {messages.map((message, i) => (
          <MotionButton
            key={message.key}
            className={styles.message}
            onClick={() => setStep(i)}
            aria-pressed={step === i}
            aria-controls="handshake-message"
          >
            <span className={styles.caption}>
              {i + 1}. {message.direction}
            </span>
            <strong>{message.title}</strong>
            {step === i && (
              <motion.span
                className={styles.underline}
                layoutId={reduced ? undefined : "handshake-message"}
                transition={{ duration: reduced ? 0 : 0.3 }}
              />
            )}
          </MotionButton>
        ))}
      </div>
      <div id="handshake-message" className={styles.payload}>
        {active ? (
          <>
            <div className={styles.payloadHead}>
              <h3>{active.title}</h3>
              <span>{active.direction}</span>
              <CopyButton text={JSON.stringify(active.headers, null, 2)} label="Copy message headers" />
            </div>
            <motion.div
              key={active.key}
              data-message-direction
              className={styles.direction}
              aria-hidden="true"
              initial={{ scaleX: reduced ? 1 : 0.15 }}
              animate={{ scaleX: 1 }}
              style={{ transformOrigin: step % 2 ? "right" : "left" }}
              transition={{ duration: reduced ? 0 : 0.4 }}
            />
            <p className={styles.caption}>Round captured {active.stamp}</p>
            <div className={styles.headers}>
              {active.headers.map(([name, value], i) => {
                const key = name.toLowerCase();
                const rule = Object.hasOwn(headerRules, key) ? headerRules[key] : undefined;
                return (
                  <Disclosure key={`${active.key}-${i}`} title={name}>
                    <div className={styles.headerDetail}>
                      <code>{value || "(empty value)"}</code>
                      {rule ? (
                        <>
                          <p>{RULES[rule].basis}</p>
                          <blockquote>{RULES[rule].quote}</blockquote>
                          <MotionLink href={RULES[rule].source}>Read the rule source ↗</MotionLink>
                        </>
                      ) : (
                        <p>
                          {name.toLowerCase() === "x-flop-mock"
                            ? "Local mock marker. It is not a chain settlement claim."
                            : "Transport or application header. No SDK payment rule is inferred."}
                        </p>
                      )}
                    </div>
                  </Disclosure>
                );
              })}
              {!active.headers.length && <p className="muted">No headers in this captured message.</p>}
            </div>
            <Disclosure title="Captured body">
              <pre className={styles.body}>{active.body || "(empty body)"}</pre>
            </Disclosure>
          </>
        ) : (
          <p>No request/response rounds were supplied.</p>
        )}
      </div>
      <div className={styles.report} aria-label="Protocol report">
        <div role="status">
          <h3>{labels[report.outcome]}</h3>
        </div>
        <p className="muted">
          {report.outcome === "incomplete"
            ? "The capture does not contain a completed proof retry for every challenge."
            : "This result covers the listed rules. It does not verify a payment."}
        </p>
        <AnimatePresence initial={false}>
          {report.deviations.map((finding, i) => (
            <motion.article
              key={`${example}-${finding.round}-${finding.code}-${i}`}
              layout={!reduced}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              className={styles.finding}
            >
              <p className="eyebrow">
                Round {finding.round} · {finding.side}
              </p>
              <h4>{finding.code}</h4>
              <p>{finding.message}</p>
              <Disclosure title={`Rule: ${finding.rule}`}>
                <div className={styles.headerDetail}>
                  <p>{finding.evidence.basis}</p>
                  <blockquote>{finding.evidence.quote}</blockquote>
                  <MotionLink href={finding.evidence.source}>Read the rule source ↗</MotionLink>
                </div>
              </Disclosure>
            </motion.article>
          ))}
        </AnimatePresence>
        <Disclosure title="Checker limits">
          <ul>
            {report.limitations.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </Disclosure>
      </div>
      <div className={styles.command}>
        <code>{command}</code>
        <CopyButton text={command} label="Copy checker command" />
      </div>
      <p className={styles.caption}>
        After building the kit. Run <code>serve-mock 3590</code> and <code>client http://127.0.0.1:3590/paid</code> for
        a fresh local capture. See the package README for the complete commands.
      </p>
    </section>
  );
}
