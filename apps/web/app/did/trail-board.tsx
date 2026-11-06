// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { type Verdict } from "../../../../packages/did/src/crypto";
import { object, text } from "../../../../packages/did/src/manifest";
import {
  collectTrail,
  DEFAULT_DID,
  parseObservation,
  verifyArtifact,
  type Artifact,
  type Trail,
} from "../../../../packages/did/src/trail";
import styles from "./trail.module.css";

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [tamper, setTamper] = useState(false);
  const [result, setResult] = useState<Verdict | null>(null);
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    let active = true;
    setResult(null);
    void verifyArtifact(artifact, tamper).then((value) => {
      if (active) setResult(value);
    });
    return () => {
      active = false;
    };
  }, [artifact, tamper]);
  return (
    <motion.article
      layout={!reduced}
      className={styles.card}
      transition={{ duration: reduced ? 0 : 0.25 }}
      data-artifact={artifact.kind}
    >
      <div className={styles.cardTop}>
        <span className="eyebrow">{artifact.kind}</span>
        <span className={styles.verdict} data-status={result?.status ?? "checking"} role="status">
          {result?.status ?? "Checking in browser"}
        </span>
      </div>
      <h3>
        <MotionLink href={artifact.source} target="_blank" rel="noreferrer">
          {artifact.title} ↗
        </MotionLink>
      </h3>
      <p className={styles.reason}>{result?.reason ?? "WebCrypto is checking the original signed bytes."}</p>
      <p className={styles.content}>{artifact.content}</p>
      <div className={styles.dates}>
        <span>
          Observed <time dateTime={artifact.measuredAt}>{artifact.measuredAt}</time>
        </span>
        {artifact.claimedAt && <span>Source timestamp (unsigned): {artifact.claimedAt}</span>}
      </div>
      {artifact.payload !== undefined && artifact.signature && (
        <>
          <div className={styles.actions}>
            <MotionButton className="quiet-button" aria-pressed={tamper} onClick={() => setTamper(!tamper)}>
              {tamper ? "Restore original bytes" : "Flip one signed byte"}
            </MotionButton>
            <span className="muted">{tamper ? "Negative control active" : "Original signed bytes"}</span>
          </div>
          <Disclosure title="Inspect exact signed payload">
            <p className="muted">
              The toggle changes only a local verification buffer. The original payload remains below.
            </p>
            <pre className={styles.payload}>{artifact.payload}</pre>
            <CopyButton text={artifact.payload} label="Copy payload" />
            <p className={styles.signature}>
              Signature: <code>{artifact.signature}</code>
            </p>
          </Disclosure>
        </>
      )}
      <p className={styles.source}>
        Source:{" "}
        <MotionLink href={artifact.source} target="_blank" rel="noreferrer">
          {artifact.source}
        </MotionLink>
      </p>
    </motion.article>
  );
}

/** A dated, browser-verified trail with bounded live lookup. Example: <TrailBoard initial={trail} />. */
export function TrailBoard({ initial }: { initial: Trail }) {
  const [trail, setTrail] = useState(initial);
  const [input, setInput] = useState(DEFAULT_DID);
  const [mode, setMode] = useState("Recorded example");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [counts, setCounts] = useState<{ verified: number; invalid: number; unverifiable: number } | null>(null);
  const reduced = useReducedMotion() !== false;
  const timeline = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: timeline, offset: ["start 75%", "end 75%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    let active = true;
    setCounts(null);
    void Promise.all(trail.artifacts.map((a) => verifyArtifact(a))).then((results) => {
      if (!active) return;
      const next = { verified: 0, invalid: 0, unverifiable: 0 };
      for (const result of results) next[result.status]++;
      setCounts(next);
    });
    return () => {
      active = false;
    };
  }, [trail]);
  const load = async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/did/data?did=${encodeURIComponent(input.trim())}`, { signal: abort.signal });
      const body = object(await response.json());
      if (!response.ok) throw new Error(text(body.error, 2000));
      if (body.query !== input.trim() || !Array.isArray(body.observations) || body.observations.length > 7)
        throw new Error("Invalid trail response");
      const observations = body.observations.map(parseObservation);
      const next = await collectTrail(input.trim(), async (source) => {
        const obs = observations.find((item) => item.source === source);
        if (!obs) throw new Error("Source unavailable in this lookup; cached budget or upstream failure");
        return obs;
      });
      if (!abort.signal.aborted) {
        setTrail(next);
        setMode("Live lookup with hour cache");
        setFilter("all");
      }
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Lookup failed");
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  };
  const visible = trail.artifacts.filter((a) => filter === "all" || a.kind === filter);
  const total = trail.artifacts.length;
  const command = `pnpm --filter @flop-lab/cli exec flop did trail ${trail.did ?? trail.fingerprint} --json`;
  return (
    <div className={styles.page}>
      <section className="page-hero">
        <ToolHeader slug="did" />
        <ReadingReveal order={3}>
          <p className={styles.lead}>
            Follow the key from a public note to signed work. Check each signature here. Flip a byte and watch the check
            fail.
          </p>
          <div className={styles.mode}>
            <span className="badge alpha">{mode}</span>
            <span className="muted">Key possession is not a trust score.</span>
          </div>
        </ReadingReveal>
      </section>
      <ReadingReveal>
        <form
          className={styles.lookup}
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label htmlFor="did-query">DID or fingerprint</label>
          <div className={styles.inputRow}>
            <motion.input
              id="did-query"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={56}
              spellCheck={false}
              autoComplete="off"
              whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.12 }}
            />
            <MotionButton className="quiet-button" disabled={loading} type="submit">
              {loading ? "Reading sources..." : "Trace DID"}
            </MotionButton>
          </div>
          <p className="muted">Reads public sources once. Results are cached for an hour. No polling.</p>
          <MotionButton
            className="quiet-button"
            type="button"
            onClick={() => {
              controller.current?.abort();
              setLoading(false);
              setTrail(initial);
              setInput(DEFAULT_DID);
              setMode("Recorded example");
              setFilter("all");
              setError("");
            }}
          >
            Use recorded example
          </MotionButton>
          {error && <p role="alert">{error}</p>}
        </form>
      </ReadingReveal>
      <section className={styles.summary} aria-label="Original artifact checks">
        {(["verified", "invalid", "unverifiable"] as const).map((status) => (
          <div className={styles.metric} key={status}>
            <p className="eyebrow">{status}</p>
            <strong>
              <ObservedNumber value={counts?.[status]} />
            </strong>
            <div className={styles.bar}>
              <motion.div
                data-count-bar={status}
                initial={false}
                animate={{ scaleX: counts && total ? counts[status] / total : 0 }}
                transition={{ duration: reduced ? 0 : 0.45 }}
              />
            </div>
          </div>
        ))}
        <p className="muted">Counts describe original artifacts. Each card has its own tamper control.</p>
      </section>
      <div className={styles.keyline}>
        <span>Resolved key</span>
        <code>{trail.did ?? "No matching DID found"}</code>
        <span>
          Fingerprint <code>{trail.fingerprint}</code>
        </span>
      </div>
      <section className={styles.trailSection}>
        <div className={styles.sectionTop}>
          <div>
            <p className="eyebrow">The evidence trail</p>
            <h2>From claims to signed bytes</h2>
          </div>
          <span className="muted">Newest observation first</span>
        </div>
        <p className="muted">The rail follows your reading position. It does not measure verification.</p>
        <div className={styles.filters} role="group" aria-label="Filter artifacts">
          {["all", "note", "message", "github", "build"].map((kind) => (
            <MotionButton
              className="quiet-button"
              aria-pressed={filter === kind}
              key={kind}
              onClick={() => setFilter(kind)}
            >
              {kind === "all" ? "All artifacts" : kind}
            </MotionButton>
          ))}
        </div>
        <div ref={timeline} className={styles.timeline}>
          <div className={styles.rail} aria-hidden="true">
            <motion.div style={{ scaleY: reduced ? 1 : scaleY }} />
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((artifact) => (
              <motion.div
                layout={!reduced}
                key={artifact.id}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.25 }}
              >
                <ArtifactCard artifact={artifact} />
              </motion.div>
            ))}
          </AnimatePresence>
          {!visible.length && (
            <p className={styles.empty}>
              No {filter === "all" ? "artifacts" : `${filter} artifacts`} in the returned sources. This does not mean
              the key has never signed one.
            </p>
          )}
        </div>
      </section>
      <section className={styles.coverage}>
        <p className="eyebrow">Coverage ledger</p>
        <h2>Where the trail stops</h2>
        <p>
          These are bounded observations, not a complete history. A profile note can be overwritten by anyone. Room
          retention can remove signed posts.
        </p>
        <ul>
          {trail.gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
        <Disclosure title="Show source requests and observation times">
          <ul>
            {trail.observations.map((obs) => (
              <li key={obs.source}>
                <MotionLink href={obs.source}>{obs.source}</MotionLink>
                <br />
                HTTP {obs.status} · {obs.measuredAt}
              </li>
            ))}
          </ul>
        </Disclosure>
        <div className={styles.command}>
          <code>{command}</code>
          <CopyButton text={command} label="Copy trail command" />
        </div>
        <p className="muted">
          Signatures prove control of a key over exact bytes. They do not prove the author's claims, unsigned
          timestamps, current PR heads or deployed file contents. Use{" "}
          <code>flop-did verify-file SIGNATURE.json &lt;dir&gt;</code> for local tracked files.
        </p>
      </section>
    </div>
  );
}
