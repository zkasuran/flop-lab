// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { ToolHeader } from "@/components/tool-header";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import { evidenceFor, expiry } from "../../../../packages/models/src/catalogue";
import type { Catalogue, Check, Model } from "../../../../packages/models/src/catalogue";
import type { PriceHistory } from "../../../../packages/models/src/history";
import styles from "./view.module.css";

const checkTitles: Record<string, string> = {
  "served-registered": "Served models registered",
  "prices-fresh": "Prices fresh at read",
  "served-list-agreement": "Served lists agree",
  registered: "Registry entry",
  "registry-details": "Registry details",
  "trust-hash": "Trust-root hash",
  "fresh-at-read": "Fresh at read",
};

function CheckDetails({ check, report }: { check: Check; report: Catalogue }) {
  return (
    <div className={styles.check} data-status={check.status}>
      <span className={styles.status}>{check.status}</span>
      <h3>{checkTitles[check.id]}</h3>
      <p>{check.reason}</p>
      <Disclosure title={`Evidence: ${checkTitles[check.id]}`}>
        {evidenceFor(report, check).map((o) => (
          <div className={styles.evidence} key={o.key}>
            <strong>{o.key}</strong>
            <MotionLink href={o.source}>{o.source}</MotionLink>
            <time dateTime={o.measuredAt}>{o.measuredAt}</time>
          </div>
        ))}
      </Disclosure>
    </div>
  );
}

function ModelCard({ model, now, report }: { model: Model; now: string; report: Catalogue }) {
  const reduced = useReducedMotion() !== false,
    duration = reduced ? 0 : 0.24;
  const sources = model.gateway?.sources ?? [],
    current = sources.map((source) => expiry(source, now));
  const fresh = current.filter((state) => state.state === "fresh").length;
  return (
    <motion.article
      data-model-card
      className={styles.card}
      layout={reduced ? false : "position"}
      initial={{ opacity: 1, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
      transition={{ duration }}
    >
      <div className={styles.cardHead}>
        <span className={styles.label}>{model.gateway ? "Gateway-listed" : "Registry-only in this recording"}</span>
        <h3>{model.name}</h3>
        <p className={styles.hash}>{model.registry?.hash ?? "No registered hash found"}</p>
      </div>
      <div className={styles.prices}>
        <div>
          <span className="eyebrow">Gateway model quote</span>
          <strong>
            {model.gateway?.prompt ?? "No data"}
            <small>prompt</small>
          </strong>
          <p>Completion: {model.gateway?.completion ?? "No data"}. Units are absent from this response.</p>
        </div>
        <div>
          <span className="eyebrow">MCP declared price</span>
          <strong>
            {model.pricing?.pricePerGflop ?? "No data"}
            <small>FLOP / GFLOP</small>
          </strong>
          <p>Model pricing declaration. No miner-specific quote is returned.</p>
        </div>
      </div>
      <div className={styles.sourceSummary}>
        <div>
          <span className="eyebrow">Advertised addresses</span>
          <strong>
            <ObservedNumber value={model.gateway ? sources.length : undefined} />
          </strong>
        </div>
        <div>
          <span className="eyebrow">Fresh on displayed clock</span>
          <strong>
            <ObservedNumber value={model.gateway ? fresh : undefined} />
          </strong>
        </div>
      </div>
      {sources.length > 0 && (
        <div className={styles.clockNote}>Read-time checks stay fixed. The expiry bars use the displayed clock.</div>
      )}
      {sources.length > 0 ? (
        <Disclosure title={`Inspect ${sources.length} price sources`}>
          <p className={styles.note}>
            Individual source price: not supplied. The model quote above is not a per-address offer.
          </p>
          <ul className={styles.sources}>
            {sources.map((source, index) => {
              const state = current[index]!;
              return (
                <li key={source.address}>
                  <code>{source.address}</code>
                  <div className={styles.sourceMeta}>
                    <span>{source.label}</span>
                    <span>
                      {state.state}
                      {state.state === "fresh" ? ` · ${Math.ceil(state.remainingMs / 1000)}s left` : ""}
                    </span>
                  </div>
                  <div className={styles.track} aria-hidden="true">
                    <motion.div
                      data-expiry-bar
                      initial={false}
                      animate={{ scaleX: state.fraction }}
                      transition={{ duration: reduced ? 0 : 0.3 }}
                    />
                  </div>
                  <p>
                    Effective <time>{source.effectiveAt}</time>
                    <br />
                    Expires <time>{source.expiresAt}</time>
                    <br />
                    Version {source.version}
                  </p>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      ) : (
        <p className={styles.note}>No gateway price sources were observed for this model.</p>
      )}
      <Disclosure title="Registry and price evidence">
        <div className={styles.modelChecks}>
          {model.checks.map((check) => (
            <CheckDetails key={check.id} check={check} report={report} />
          ))}
        </div>
        <p className={styles.note}>
          Info version: {model.info?.version ?? "unknown"}. MCP discovery advertises{" "}
          {model.registry?.miners.length ?? "no data"} addresses.
        </p>
        {model.comparison && (
          <p className={styles.note}>
            MCP comparison estimate: {model.comparison.estimatedCost} FLOP for {model.comparison.tokens} tokens. This is
            a service estimate, not a charge.
          </p>
        )}
        {[`info:${model.id}`, `pricing:${model.id}`, "compare"].map((key) => {
          const o = report.recording.observations.find((o) => o.key === key);
          return o ? (
            <div key={key} className={styles.evidence}>
              <strong>{key}</strong>
              <MotionLink href={o.source}>{o.source}</MotionLink>
              <time>{o.measuredAt}</time>
            </div>
          ) : null;
        })}
      </Disclosure>
    </motion.article>
  );
}

export function ModelsView({
  report,
  history,
  historyMode,
  viewedAt,
}: {
  report: Catalogue;
  history: PriceHistory;
  historyMode: string;
  viewedAt: string;
}) {
  const [filter, setFilter] = useState("all"),
    reduced = useReducedMotion() !== false;
  const clockRef = useRef<HTMLElement>(null),
    visible = useInView(clockRef);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!visible) return () => {};
      const timer = setInterval(() => {
        if (!document.hidden) notify();
      }, 1000);
      return () => clearInterval(timer);
    },
    [visible],
  );
  const nowMs = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => Date.parse(viewedAt),
  );
  const now = new Date(nowMs).toISOString();
  const models = report.models.filter((m) => filter === "all" || (filter === "served" ? !!m.gateway : !m.gateway));
  const served = report.models.filter((m) => m.gateway).length;
  return (
    <div className={`container ${styles.page}`}>
      <ToolHeader slug="models" />
      <ReadingReveal order={3}>
        <p className={styles.intro}>A listing is a promise to inspect. Start with the source, then check the clock.</p>
      </ReadingReveal>
      <ReadingReveal order={4}>
        <section className={styles.recording} aria-label="Recording summary">
          <div className={styles.recordingHead}>
            <div>
              <span className={styles.label}>Recorded public observations</span>
              <time>{report.recording.completedAt}</time>
            </div>
            <MotionLink className="quiet-button" href="/models/recording" download>
              Download evidence ↓
            </MotionLink>
          </div>
          <div className={styles.metrics}>
            {[
              ["Gateway-listed", served],
              ["Registered in discovery", report.models.filter((m) => m.registry).length],
              ["Provider directory entries", report.providers],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="eyebrow">{label}</span>
                <strong>
                  <ObservedNumber value={typeof value === "number" ? value : undefined} />
                </strong>
              </div>
            ))}
          </div>
          <p>
            {report.recording.requests} HTTP requests · {report.recording.durationMs.toLocaleString("en-US")} ms
            recorded duration · providers are a separate directory, not a miner count
          </p>
        </section>
      </ReadingReveal>
      <section className={styles.section} aria-labelledby="checks-title">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">Checks at observation time</p>
            <h2 id="checks-title">Does the catalogue agree?</h2>
          </div>
          <p>
            Gateway read: <time>{report.gatewayRead}</time>
          </p>
        </div>
        <div className={styles.checks}>
          {report.checks.map((check, i) => (
            <ReadingReveal key={check.id} order={i}>
              <CheckDetails check={check} report={report} />
            </ReadingReveal>
          ))}
        </div>
        <p className={styles.note}>
          MCP availability comes from the gateway. Agreement checks consistency between reads. It does not independently
          confirm serving capacity.
        </p>
      </section>
      <section className={styles.section} ref={clockRef} aria-labelledby="models-title">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">Model catalogue</p>
            <h2 id="models-title">Listed, registered or both.</h2>
          </div>
          <p className={styles.clock}>
            Displayed clock
            <br />
            <time>{now}</time>
          </p>
        </div>
        <div className={styles.filters} aria-label="Filter models">
          {[
            ["all", "All models"],
            ["served", "Gateway-listed"],
            ["registry", "Registry-only"],
          ].map(([value, label]) => (
            <MotionButton
              key={value}
              className="quiet-button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value!)}
            >
              {label}
            </MotionButton>
          ))}
          <span aria-live="polite">{models.length} shown</span>
        </div>
        <motion.div className={styles.cards} layout={reduced ? false : "position"}>
          <AnimatePresence initial={false} mode="popLayout">
            {models.map((model) => (
              <ModelCard key={model.id} model={model} now={now} report={report} />
            ))}
          </AnimatePresence>
        </motion.div>
        {!models.length && <p className={styles.note}>No models in this selection.</p>}
      </section>
      <section className={styles.section} aria-labelledby="history-title">
        <p className="eyebrow">{historyMode}</p>
        <h2 id="history-title">Prices, with their dates attached.</h2>
        <p className={styles.note}>
          Model-level prompt and completion values. Units are absent from gateway responses. These readings do not
          establish a daily trend.
        </p>
        <div className={styles.history}>
          {history.points.map((point) => (
            <ReadingReveal key={`${point.snapshotId}:${point.model}`}>
              <article>
                <div>
                  <strong>{point.model}</strong>
                  <time>{point.measuredAt}</time>
                  <span>{point.labels.join(" · ")}</span>
                </div>
                <div>
                  <span>
                    Prompt <b>{point.prompt ?? "No data"}</b>
                  </span>
                  <span>
                    Completion <b>{point.completion ?? "No data"}</b>
                  </span>
                </div>
                <MotionLink href={point.source}>Gateway source ↗</MotionLink>
              </article>
            </ReadingReveal>
          ))}
        </div>
        {!history.points.length && <p>No recorded prices available.</p>}
        <p className={styles.note}>
          Archive checked {history.checkedAt}.{" "}
          {history.truncated ? "Showing the latest eight model snapshots." : "Only available observations are shown."}{" "}
          {history.errors.length > 0 && "Some archive reads were unavailable."}
        </p>
        <MotionLink href="/history">Open the recorder history ↗</MotionLink>
      </section>
      <ReadingPath
        title="Follow the evidence, in order."
        steps={[
          {
            title: "1. Read the advertisement",
            text: "Gateway model quotes and price-source labels describe the catalogue. Addresses are advertised, not pinged.",
          },
          {
            title: "2. Join the registry",
            text: "An explicit registry name links the gateway to discovery. Details check the version and hash. The trust root must contain that hash.",
          },
          {
            title: "3. Check the time",
            text: "A price source is fresh only from its effective time until its expiry time. Expired timestamps never become a current price.",
          },
        ]}
      />
      <section className={styles.section}>
        <Disclosure title="Source ledger and raw responses">
          {report.recording.observations.map((o) => (
            <div key={o.key} className={styles.evidence}>
              <strong>{o.key}</strong>
              <MotionLink href={o.source}>{o.source}</MotionLink>
              <time>{o.measuredAt}</time>
              <pre>{o.raw ?? o.error}</pre>
            </div>
          ))}
        </Disclosure>
        {report.errors.map((error) => (
          <p key={error.key}>
            {error.key}: {error.reason}
          </p>
        ))}
        <h2 className={styles.limits}>What this does not verify</h2>
        <p className={styles.note}>
          No inference is sent. These observations do not verify model weights, miner uptime, hardware, consensus or
          paid prices. Address encoding is checked without an SS58 checksum. Matching public hashes is not a
          cryptographic proof of registration. Source reads happen at different times. Devnet can reset.
        </p>
      </section>
    </div>
  );
}
