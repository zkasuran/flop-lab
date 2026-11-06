// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Result } from "../../../../packages/openapi/src/schema";
import { ToolHeader } from "../../components/tool-header";
import { CopyButton } from "../../components/controls";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "../../components/motion";
import styles from "./reference.module.css";

type Entry = { title: string; page: string; result: Result };
/** Inspect real bundled responses without issuing network scans. @example <Reference entries={entries} /> */
export function Reference({ entries }: { entries: Entry[] }) {
  const [selected, setSelected] = useState(entries[0]!.result.tool);
  const [origin, setOrigin] = useState("http://localhost:3780");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const reduced = useReducedMotion() !== false;
  const method = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: method, offset: ["start end", "end center"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const entry = entries.find((item) => item.result.tool === selected)!;
  const result = entry.result;
  const command = `curl --fail-with-body '${origin}/api/v1/${selected}'`;
  const outcomes = Object.entries(result.summary?.outcomes ?? {});
  const total = outcomes.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <ToolHeader slug="openapi" />
        <ReadingReveal order={3}>
          <p className={styles.lead}>The same dated evidence. One JSON contract.</p>
          <p>
            Read recorded suite results from your script. Every response keeps its source dates, limits and schema
            version. Reads do not start a live scan.
          </p>
        </ReadingReveal>
        <ReadingReveal order={4}>
          <div className={styles.actions}>
            <MotionLink className={styles.link} href="/api/v1/openapi.json">
              OpenAPI 3.1 document ↗
            </MotionLink>
            <span className="badge">GET + HEAD</span>
            <span className="badge">No key</span>
          </div>
        </ReadingReveal>
      </section>
      <section className={styles.reference} aria-labelledby="endpoints-heading">
        <div className={styles.menu}>
          <h2 id="endpoints-heading">Choose a result</h2>
          <p className="muted">Bundled evidence, preserved dates.</p>
          <nav aria-label="API endpoints">
            {entries.map(({ title, result: item }) => (
              <MotionButton
                key={item.tool}
                className={styles.endpoint}
                aria-pressed={selected === item.tool}
                onClick={() => setSelected(item.tool)}
              >
                {selected === item.tool && (
                  <motion.span
                    className={styles.active}
                    layoutId={reduced ? undefined : "api-endpoint"}
                    transition={{ duration: reduced ? 0 : 0.25 }}
                  />
                )}
                <span className={styles.verb}>GET</span>
                <span>
                  <strong>{item.tool}</strong>
                  <small>{title}</small>
                </span>
                <span className={styles.dot} data-available={item.mode === "recorded"} aria-label={item.mode} />
              </MotionButton>
            ))}
          </nav>
        </div>
        <div className={styles.detail}>
          <div className={styles.detailHeading}>
            <div>
              <span className={styles.eyebrow}>/api/v1/{selected}</span>
              <h2>{entry.title}</h2>
            </div>
            <MotionLink href={entry.page} className={styles.link}>
              Open tool ↗
            </MotionLink>
          </div>
          <p className={styles.date}>
            Observed through <time>{result.measuredAt ?? "No observation available"}</time>. Mode: {result.mode}.
          </p>
          <div className={styles.command}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy curl" />
          </div>
          <div className={styles.metrics}>
            {Object.entries(result.summary?.metrics ?? {}).map(([label, value]) => (
              <div key={label}>
                <strong>
                  <ObservedNumber value={value} />
                </strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className={styles.outcomes} aria-label="Recorded outcomes">
            {outcomes.map(([status, count]) => (
              <div key={status} className={styles.outcome}>
                <div>
                  <span>{status}</span>
                  <strong>{count}</strong>
                </div>
                <div className={styles.track}>
                  <motion.div
                    data-outcome={status}
                    initial={false}
                    animate={{ scaleX: total ? count / total : 0 }}
                    transition={{ duration: reduced ? 0 : 0.45 }}
                  />
                </div>
              </div>
            ))}
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={selected}
              initial={{ opacity: reduced ? 1 : 0.4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: reduced ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
            >
              <h3>What the result means</h3>
              <ul className={styles.limits}>
                {result.limitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
          <div className={styles.jsonHeading}>
            <h3>Example response</h3>
            <CopyButton text={JSON.stringify(result, null, 2)} label="Copy JSON" />
          </div>
          <pre className={styles.json} tabIndex={0} aria-label="Complete example response">
            <code>{JSON.stringify(result, null, 2)}</code>
          </pre>
          <details className={styles.sources}>
            <summary>Sources and raw recordings ({result.sources.length})</summary>
            <ul>
              {result.recordings.map((url) => (
                <li key={url}>
                  <MotionLink href={url}>Pinned recording ↗</MotionLink>
                </li>
              ))}
            </ul>
            <ul>
              {result.sources.map((source) => (
                <li key={source.url + source.measuredAt}>
                  <MotionLink href={source.url}>{source.url}</MotionLink>
                  <time>{source.measuredAt}</time>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>
      <section ref={method} className={styles.method} aria-labelledby="method-heading">
        <div className={styles.progress}>
          <motion.div data-reading-progress style={{ scaleX: reduced ? 1 : progress }} />
        </div>
        <h2 id="method-heading">Read the evidence contract</h2>
        <div className={styles.steps}>
          <ReadingReveal>
            <span className={styles.eyebrow}>01 / SOURCE</span>
            <h3>Keep the date attached</h3>
            <p>
              <code>measuredAt</code> is the latest observation in <code>sources</code>. Each source retains its own
              time. It is never the time you called this API.
            </p>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <span className={styles.eyebrow}>02 / VALIDATE</span>
            <h3>One schema, both ways</h3>
            <p>
              Response validation and the OpenAPI document use the same JSON Schemas. Missing evidence has{" "}
              <code>summary: null</code>. Invalid evidence returns HTTP 503.
            </p>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <span className={styles.eyebrow}>03 / REUSE</span>
            <h3>Cache the data gently</h3>
            <p>
              Validated bodies revalidate after 300 seconds. The API allows 60 reads per IP per 60 seconds on each
              server instance. On HTTP 429, wait for <code>Retry-After</code>. HTTP 5xx merits backoff rather than a
              tight retry loop.
            </p>
          </ReadingReveal>
        </div>
        <p className={styles.note}>
          Only GET and HEAD are supported. Query parameters return HTTP 400. Unknown endpoints return HTTP 404. Other
          methods return HTTP 405. This API does not verify current uptime, inference or consensus.
        </p>
      </section>
    </div>
  );
}
