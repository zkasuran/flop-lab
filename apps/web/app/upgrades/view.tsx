// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { filterEvents, kinds, type Kind, type Report, type Event } from "../../../../packages/upgrades/src/model";
import styles from "./view.module.css";

const labels = { spec: "Spec", sdk: "SDK", runtime: "Runtime", docs: "Docs" };
const clocks: Record<Event["clock"], string> = {
  commit: "Commit time",
  published: "Publication time",
  observed: "Observation time",
  "last-modified": "HTTP Last-Modified",
  "page-date": "Page-labelled day",
};

/** Dated public evidence with independent clocks. @example <UpgradesView report={report} /> */
export function UpgradesView({ report }: { report: Report }) {
  const [kind, setKind] = useState<Kind | "all">("all"),
    [query, setQuery] = useState("");
  const reduced = useReducedMotion() !== false;
  const timeline = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: timeline, offset: ["start 80%", "end 70%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const events = filterEvents(report.events, kind, query);
  const counts = Object.fromEntries(kinds.map((k) => [k, report.events.filter((e) => e.kind === k).length]));
  const measured = report.recordings.map((r) => r.measuredAt).sort();
  const parameterChanges = report.events.flatMap((e) => e.changes).filter((c) => c.name.startsWith("Parameter:"));
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ToolHeader slug="upgrades" />
      </header>
      <ReadingReveal order={3}>
        <aside className={styles.notice}>
          <span className="badge">Recorded public evidence</span>
          <p>
            A release is not a deployment. Read what changed in the paper beside package publication dates. Runtime
            history requires an explicit version observation.
          </p>
          <p className="muted">
            Sources received {measured[0] ?? "No data"} to {measured.at(-1) ?? "No data"}. This page makes no live
            requests.
          </p>
          <MotionLink href="/upgrades/report.json">Download sourced timeline JSON ↗</MotionLink>
        </aside>
      </ReadingReveal>
      <section className={styles.metrics} aria-label="Recorded event counts">
        {kinds.map((k, i) => (
          <ReadingReveal key={k} order={i}>
            <article className={styles.metric}>
              <p className="eyebrow">{labels[k]} entries</p>
              <p className={styles.number}>
                {k === "runtime" && counts[k] === 0 ? "No data" : <ObservedNumber value={counts[k]} />}
              </p>
              <div className={styles.bar} aria-hidden="true">
                <motion.div
                  data-kind-bar={k}
                  key={`${k}:${reduced}`}
                  initial={{ scaleX: reduced && report.events.length ? (counts[k] ?? 0) / report.events.length : 0 }}
                  whileInView={{ scaleX: report.events.length ? (counts[k] ?? 0) / report.events.length : 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: reduced ? 0 : 0.4 }}
                />
              </div>
            </article>
          </ReadingReveal>
        ))}
      </section>
      <ReadingReveal>
        <section className={styles.scope} aria-labelledby="coverage-title">
          <div>
            <p className="eyebrow">Know the window</p>
            <h2 id="coverage-title">Different clocks. One reading order.</h2>
          </div>
          <div>
            <p>
              Spec entries compare adjacent recordings from the latest three paper-changing commits captured in this
              bundle. CHANGELOG and changed decision files share those pins. This is a bounded window.
            </p>
            <p>
              SDK entries use npm publication dates and the earliest PyPI artifact upload. Docs dates are quoted page
              labels. Day-only dates sort at the start of that UTC day without claiming a time.
            </p>
            <p>
              <strong>{parameterChanges.length} changed Appendix A values</strong> in this window. Added parameters are
              marked absent before. Quoted values are literal, not calculated.
            </p>
          </div>
        </section>
      </ReadingReveal>
      <section ref={timeline} className={styles.timeline} aria-labelledby="timeline-title">
        <div className={styles.rail} aria-hidden="true">
          <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        <div className={styles.timelineHead}>
          <p className="eyebrow">Read the changes</p>
          <h2 id="timeline-title">The recorded timeline</h2>
          <p className="muted">The rail tracks reading progress. Newest evidence dates come first.</p>
          <div className={styles.filters} role="group" aria-label="Timeline source">
            {(["all", ...kinds] as const).map((value) => (
              <MotionButton
                key={value}
                className="quiet-button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === "all" ? "All sources" : labels[value]}
              </MotionButton>
            ))}
          </div>
          <label className={styles.search}>
            Search titles, parameters and quoted text
            <motion.input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try tx_fee_burn or governance"
              whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
              whileHover={{ y: reduced ? 0 : -1 }}
              transition={{ duration: reduced ? 0 : 0.15 }}
            />
          </label>
          <p role="status" className="muted">
            <ObservedNumber value={events.length} /> matching entries
          </p>
        </div>
        <motion.div layout={!reduced} className={styles.events} transition={{ duration: reduced ? 0 : 0.3 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {events.map((event) => (
              <motion.article
                key={event.id}
                layout={!reduced}
                data-event-kind={event.kind}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
                className={styles.event}
              >
                <div className={styles.eventMeta}>
                  <span className="badge">{labels[event.kind]}</span>
                  <span>{clocks[event.clock]}</span>
                  <time dateTime={event.at}>{event.at}</time>
                </div>
                <h3>{event.title}</h3>
                <p className="muted">{event.detail}</p>
                <Disclosure
                  title={`Inspect ${event.changes.length} ${event.kind === "spec" ? "section/value changes" : "recorded fields"}`}
                >
                  <div className={styles.details}>
                    {event.changes.map((change) => (
                      <section className={styles.change} key={change.name}>
                        <h4>{change.name}</h4>
                        <div className={styles.comparison}>
                          <div>
                            <p className="eyebrow">{event.kind === "spec" ? "Before" : "Prior observation"}</p>
                            <pre>{change.before ?? (event.kind === "spec" ? "[absent]" : "[not compared]")}</pre>
                          </div>
                          <div>
                            <p className="eyebrow">{event.kind === "spec" ? "After" : "Recorded value"}</p>
                            <pre>{change.after ?? "[absent]"}</pre>
                          </div>
                        </div>
                      </section>
                    ))}
                    <p className="muted">Received {event.measuredAt}</p>
                    <div className={styles.links}>
                      {event.links.map((link) => (
                        <MotionLink key={link.url} href={link.url}>
                          {link.label} ↗
                        </MotionLink>
                      ))}
                    </div>
                    <p className={styles.source}>
                      Source: <MotionLink href={event.source}>{event.source}</MotionLink>
                    </p>
                  </div>
                </Disclosure>
              </motion.article>
            ))}
          </AnimatePresence>
          {!events.length && (
            <p className={styles.empty}>
              {kind === "runtime"
                ? "No explicit runtime version observations in the supplied recorder index."
                : "No recorded entries match. Clear the search or choose another source."}
            </p>
          )}
        </motion.div>
      </section>
      <section className={styles.limits} aria-labelledby="limits-title">
        <h2 id="limits-title">What this does not verify</h2>
        {report.gaps.map((gap, i) => (
          <article key={`${gap.source}:${i}`}>
            <p>
              <strong>{labels[gap.kind]}: </strong>
              {gap.reason}
            </p>
            <p className="muted">
              Observed {gap.measuredAt}. <MotionLink href={gap.source}>Source ↗</MotionLink>
            </p>
          </article>
        ))}
        <p>
          Spec text and registry metadata do not prove runtime deployment, governance approval or SDK compatibility. A
          docs date is the page's own label. No runtime metadata, chain writes or private source were queried.
        </p>
        <p>
          Section comparisons retain exact before/after text except line endings and edge whitespace. Appendix A values
          are compared literally. Prose-only parameters outside those tables are visible in section text but are not
          classified as parameter changes.
        </p>
        <div className={styles.links}>
          <MotionLink href="/spec">Compare the spec with observations ↗</MotionLink>
          <MotionLink href="/history">Read recorder history ↗</MotionLink>
        </div>
      </section>
    </div>
  );
}
