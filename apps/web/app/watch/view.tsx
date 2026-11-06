// SPDX-License-Identifier: Apache-2.0
"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ToolHeader } from "@/components/tool-header";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import {
  example,
  kinds,
  parseConfig,
  rulesYaml,
  type Config,
  type Kind,
  type Output,
  type Rule,
} from "../../../../packages/watch/src/config";
import type { Replay } from "./data";
import { parseReplay } from "./schema";
import styles from "./view.module.css";

const labels: Record<Kind, string> = {
  "devnet-reset": "Reported head decreases",
  settlement: "Settlement for an address",
  "challenge-closing": "Challenge window closing",
  "claim-change": "Harness claim changes",
  "price-expired": "Model source expires",
  "service-down": "Public probe fails",
};
const descriptions: Record<Kind, string> = {
  "devnet-reset": "A reset signal from the recorder comparison. Indexer lag can also move a head backwards.",
  settlement: "A newly seen event for a miner or agent. First read sets the baseline. Pages are partial.",
  "challenge-closing": "An explicit forced claim with a positive reported block gap inside your threshold.",
  "claim-change": "Compare newer local harness reports. This day has no harness report observations.",
  "price-expired": "Compare each advertised expiry with the gateway read time. No current health claim.",
  "service-down": "Consecutive failed local probes. Rate limits and invalid responses stay unknown.",
};
export function WatchView({ initial, address: recordedAddress }: { initial: Replay; address: string }) {
  const reduced = useReducedMotion() !== false,
    duration = reduced ? 0 : 0.24;
  const [enabled, setEnabled] = useState<Kind[]>(example.rules.map((r) => r.kind));
  const [address, setAddress] = useState(recordedAddress),
    [blocks, setBlocks] = useState("100");
  const [claim, setClaim] = useState("gateway-contract"),
    [report, setReport] = useState("harness.json");
  const [service, setService] = useState<"mcp" | "gateway">("mcp"),
    [failures, setFailures] = useState("2");
  const [pollMs, setPollMs] = useState("60000"),
    [budget, setBudget] = useState("100");
  const [outputs, setOutputs] = useState<Output["kind"][]>(["jsonl"]),
    [url, setUrl] = useState("");
  const [replayed, setReplayed] = useState(initial),
    [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [replayedYaml, setReplayedYaml] = useState(rulesYaml(example));
  const built = useMemo(() => {
    try {
      const rules: Rule[] = kinds
        .filter((k) => enabled.includes(k))
        .map((kind) => {
          const id =
            kind === "devnet-reset"
              ? "reset"
              : kind === "price-expired"
                ? "prices"
                : kind === "service-down"
                  ? "availability"
                  : kind;
          return {
            id,
            kind,
            ...(kind === "settlement" ? { address } : {}),
            ...(kind === "challenge-closing" ? { withinBlocks: Number(blocks) } : {}),
            ...(kind === "claim-change" ? { claim, report } : {}),
            ...(kind === "service-down" ? { service, failures: Number(failures) } : {}),
          };
        });
      const config: Config = parseConfig({
        version: 1,
        pollMs: Number(pollMs),
        maxRequests: Number(budget),
        rules,
        outputs: outputs.map((kind) => (kind === "webhook" ? { kind, url } : { kind })),
      });
      return { yaml: rulesYaml(config), error: null };
    } catch (e) {
      return { yaml: "", error: e instanceof Error ? e.message : "Invalid rules" };
    }
  }, [enabled, address, blocks, claim, report, service, failures, pollMs, budget, outputs, url]);
  const poll = replayed.polls[selected]!;
  const count = replayed.polls.reduce((sum, p) => sum + p.alerts.length, 0),
    changed = built.yaml !== replayedYaml;
  const healthy = poll.observations.filter((o) => o.status === "ok").length;
  async function runReplay() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/watch/replay", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: built.yaml,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Replay rejected the rule file. Check the fields and try again.");
      const value = parseReplay(await response.json());
      setReplayed(value);
      setSelected(0);
      setReplayedYaml(built.yaml);
      setMessage("Rules validated. Recorded replay updated. No notifications sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Replay unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(built.yaml);
      setMessage("YAML copied.");
    } catch {
      setMessage("Clipboard unavailable. Select the YAML below.");
    }
  }
  function download() {
    const href = URL.createObjectURL(new Blob([built.yaml], { type: "application/yaml" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = "watch.yaml";
    a.click();
    URL.revokeObjectURL(href);
    setMessage("watch.yaml downloaded.");
  }
  return (
    <div className={`container ${styles.page}`}>
      <header>
        <ToolHeader slug="watch" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            Choose what deserves an alert. Save local rules. Replay the observations before you run them.
          </p>
        </ReadingReveal>
      </header>
      <ReadingReveal order={4}>
        <section className={styles.summary} aria-label="Recorded day summary">
          <div>
            <p className="eyebrow">Recorded day / {initial.day} UTC</p>
            <h2>Quiet samples. Explicit limits.</h2>
            <p>These polls are a small part of the day. No events are inferred between them.</p>
            <p className={styles.small}>
              {initial.startedAt} to {initial.finishedAt}
            </p>
          </div>
          <div className={styles.metrics}>
            <div>
              <strong>
                <ObservedNumber value={initial.polls.length} />
              </strong>
              <span>recorded polls</span>
            </div>
            <div>
              <strong>
                <ObservedNumber value={initial.requests} />
              </strong>
              <span>source requests</span>
            </div>
            <div>
              <strong>
                <ObservedNumber value={count} />
              </strong>
              <span>replayed alerts</span>
            </div>
          </div>
        </section>
      </ReadingReveal>
      <section className={styles.section} aria-labelledby="builder-heading">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">Local rule builder</p>
            <h2 id="builder-heading">Make the signal yours.</h2>
          </div>
          <p>Rules run on your machine. The page only replays saved public data.</p>
        </div>
        <div className={styles.builder}>
          <div className={styles.rules}>
            {kinds.map((kind) => (
              <motion.div
                className={styles.rule}
                key={kind}
                layout={reduced ? false : "position"}
                transition={{ duration }}
                data-rule={kind}
              >
                <MotionButton
                  className={styles.toggle}
                  aria-pressed={enabled.includes(kind)}
                  onClick={() => setEnabled((v) => (v.includes(kind) ? v.filter((k) => k !== kind) : [...v, kind]))}
                >
                  <span aria-hidden="true" className={styles.dot}>
                    {enabled.includes(kind) ? "✓" : "+"}
                  </span>
                  {labels[kind]}
                </MotionButton>
                <p>{descriptions[kind]}</p>
                <AnimatePresence initial={false}>
                  {enabled.includes(kind) &&
                    ["settlement", "challenge-closing", "claim-change", "service-down"].includes(kind) && (
                      <motion.div
                        key="fields"
                        className={styles.fields}
                        initial={{ opacity: 1, y: reduced ? 0 : 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration }}
                      >
                        {kind === "settlement" && (
                          <label>
                            Address
                            <input value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} />
                          </label>
                        )}
                        {kind === "challenge-closing" && (
                          <label>
                            Within blocks
                            <input
                              type="number"
                              min="1"
                              max="1000000"
                              value={blocks}
                              onChange={(e) => setBlocks(e.target.value)}
                            />
                          </label>
                        )}
                        {kind === "claim-change" && (
                          <>
                            <label>
                              Claim ID
                              <input value={claim} onChange={(e) => setClaim(e.target.value)} />
                            </label>
                            <label>
                              Local report path
                              <input value={report} onChange={(e) => setReport(e.target.value)} />
                            </label>
                          </>
                        )}
                        {kind === "service-down" && (
                          <>
                            <label>
                              Service
                              <select value={service} onChange={(e) => setService(e.target.value as "mcp" | "gateway")}>
                                <option value="mcp">MCP stats probe</option>
                                <option value="gateway">Gateway model probe</option>
                              </select>
                            </label>
                            <label>
                              Consecutive failures
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={failures}
                                onChange={(e) => setFailures(e.target.value)}
                              />
                            </label>
                          </>
                        )}
                      </motion.div>
                    )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
          <div className={styles.config}>
            <h3>Polling and delivery</h3>
            <div className={styles.fields}>
              <label>
                Poll interval (ms)
                <input
                  type="number"
                  min="10000"
                  max="3600000"
                  value={pollMs}
                  onChange={(e) => setPollMs(e.target.value)}
                />
              </label>
              <label>
                Request budget per run
                <input type="number" min="1" max="100000" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </label>
            </div>
            <div className={styles.outputButtons} role="group" aria-label="Alert outputs">
              {(["stdout", "jsonl", "webhook", "desktop"] as const).map((kind) => (
                <MotionButton
                  key={kind}
                  aria-pressed={outputs.includes(kind)}
                  onClick={() => setOutputs((v) => (v.includes(kind) ? v.filter((k) => k !== kind) : [...v, kind]))}
                >
                  {kind}
                </MotionButton>
              ))}
            </div>
            {outputs.includes("webhook") && (
              <label>
                Webhook URL
                <input
                  type="url"
                  placeholder="https://example.com/events"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <span className={styles.small}>Written into local YAML only. Replay does not contact this URL.</span>
              </label>
            )}
            <p className={styles.small}>
              HTTP attempts include retries. Delivery retries have their own cap. A stopped run can leave pending
              deliveries on disk.
            </p>
            <div className={styles.yaml}>
              <div className={styles.yamlHead}>
                <span>watch.yaml</span>
                <div>
                  <MotionButton disabled={!!built.error} onClick={copy}>
                    Copy YAML
                  </MotionButton>
                  <MotionButton disabled={!!built.error} onClick={download}>
                    Download YAML
                  </MotionButton>
                </div>
              </div>
              <pre aria-label="Generated YAML" tabIndex={0}>
                {built.error ? "Fix the rule fields to generate YAML." : built.yaml}
              </pre>
            </div>
            {built.error && (
              <p role="alert" className={styles.error}>
                {built.error}
              </p>
            )}
            <MotionButton className={styles.primary} disabled={!!built.error || busy} onClick={runReplay}>
              {busy ? "Replaying…" : "Validate and replay"}
            </MotionButton>
            <p aria-live="polite" className={styles.message}>
              {message || "Download watch.yaml, then run: flop watch run --rules watch.yaml --polls 0"}
            </p>
          </div>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="replay-heading">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">Recorded replay</p>
            <h2 id="replay-heading">Read what would have fired.</h2>
          </div>
          <p>
            {changed
              ? "Builder has changed. Validate and replay to apply it here."
              : "Replay matches the generated rules."}
          </p>
        </div>
        <div className={styles.replayControls} role="group" aria-label="Recorded observations">
          {replayed.polls.map((p, i) => (
            <MotionButton key={p.startedAt} aria-pressed={selected === i} onClick={() => setSelected(i)}>
              Poll {i + 1}
              <time>{p.startedAt.slice(11, 19)} UTC</time>
            </MotionButton>
          ))}
          <MotionButton onClick={() => setSelected((v) => (v + 1) % replayed.polls.length)}>
            Next observation →
          </MotionButton>
        </div>
        <motion.div className={styles.replayPanel} layout={reduced ? false : "position"} transition={{ duration }}>
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={selected}
              data-replay-frame
              initial={{ opacity: 1, x: reduced ? 0 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration }}
            >
              <div className={styles.pollHeading}>
                <div>
                  <span className="eyebrow">
                    {selected === 0
                      ? "First successful reads establish baselines"
                      : "Compare against the preceding saved poll"}
                  </span>
                  <h3>
                    Reported head <ObservedNumber value={poll.head} />
                  </h3>
                  <p className={styles.small}>
                    {poll.startedAt} to {poll.finishedAt}
                  </p>
                </div>
                <strong className={styles.alertCount}>
                  <ObservedNumber value={poll.alerts.length} />
                  <span> alerts</span>
                </strong>
              </div>
              <div className={styles.observedBar}>
                <motion.div
                  data-source-bar
                  initial={{ scaleX: reduced ? healthy / Math.max(1, poll.observations.length) : 0 }}
                  animate={{ scaleX: healthy / Math.max(1, poll.observations.length) }}
                  transition={{ duration }}
                />
              </div>
              <p className={styles.small}>
                {healthy} of {poll.observations.length} source responses validated in this saved poll. {poll.requests}{" "}
                physical requests. This is not current service health.
              </p>
              {poll.alerts.length ? (
                <ul className={styles.alerts}>
                  {poll.alerts.map((alert) => (
                    <li key={alert.id}>
                      <strong>{alert.rule}</strong>
                      <p>{alert.message}</p>
                      <time>{alert.measuredAt}</time>
                      <Disclosure title="Inspect alert evidence">
                        <pre>{JSON.stringify(alert.evidence, null, 2)}</pre>
                      </Disclosure>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <strong>No alerts fired in this sample.</strong>
                  <p>
                    That says nothing about events outside the recorded polls. Existing settlements are baselined on the
                    first read.
                  </p>
                </div>
              )}
              {poll.notes.length > 0 && (
                <div className={styles.notes}>
                  <h4>Coverage and missing inputs</h4>
                  <ul>
                    {poll.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Disclosure title="Inspect dated sources">
                <ul className={styles.sources}>
                  {poll.observations.map((o) => (
                    <li key={o.key}>
                      <strong>{o.key}</strong>
                      <span>{o.status}</span>
                      <time>{o.measuredAt}</time>
                      <MotionLink href={o.source}>{o.source}</MotionLink>
                    </li>
                  ))}
                </ul>
                <MotionLink href={poll.recording}>Open raw recording ↗</MotionLink>
              </Disclosure>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </section>
      <ReadingPath
        title="From observation to notification"
        steps={[
          {
            title: "Read with a ceiling",
            text: "Rules share public reads. Physical retries count against the run budget. Partial pages and missing inputs remain visible.",
          },
          {
            title: "Compare dated evidence",
            text: "A first settlement read sets a baseline. Later timestamps can trigger transitions. Challenge alerts require an explicit forced claim and challenge-end block.",
          },
          {
            title: "Persist before sending",
            text: "Baselines and pending outputs are saved together. Acknowledged alerts stay acknowledged after restart. An interrupted acknowledgement can repeat delivery; webhook receivers use the stable idempotency key.",
          },
          {
            title: "Inspect a failed delivery",
            text: "Due webhook retries resume from disk. Final failures go to the dead-letter file. Desktop notifications depend on an available local notification command.",
          },
        ]}
      />
      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          No independent chain reset, consensus, finality, inference result, runtime challenge eligibility or complete
          daily history is verified. The page uses dated public data. It does not start a watcher, read local report
          files or send notifications. Settlement and channel pages are partial. Run the CLI for ongoing local
          observations.
        </p>
        <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/watch">
          Read the limits and recovery guide ↗
        </MotionLink>
      </section>
    </div>
  );
}
