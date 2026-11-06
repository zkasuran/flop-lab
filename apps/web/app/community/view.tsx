// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import {
  areas,
  median,
  type Area,
  type Row,
  type RepoSample,
  type ChatSample,
} from "../../../../packages/community/src/model";
import { accessForm, lintAccess, type LintResult } from "../../../../packages/community/src/access";
import styles from "./view.module.css";

type Report = {
  measuredAt: string;
  repos: (Omit<RepoSample, "items"> & { count: number })[];
  chat: ChatSample[];
  items: (Omit<Row, "responses"> & { responseCount: number })[];
};
const duration = (hours: number | null) =>
  hours === null ? "No data" : hours < 24 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`;
const ageGroups = [
  { label: "Under a day", min: 0, max: 24 },
  { label: "1 to 7 days", min: 24, max: 168 },
  { label: "7 to 30 days", min: 168, max: 720 },
  { label: "30 days or more", min: 720, max: Infinity },
];

function Bar({ value, total, label }: { value: number; total: number; label: string }) {
  const reduced = useReducedMotion() !== false;
  const ratio = total ? value / total : 0;
  return (
    <div className={styles.bar} aria-hidden="true">
      <motion.div
        data-bar={label}
        initial={false}
        animate={{ scaleX: ratio }}
        transition={{ duration: reduced ? 0 : 0.35 }}
      />
    </div>
  );
}

/** Dated request aggregates and a local-only access-form check. @example <CommunityView report={report} /> */
export function CommunityView({ report }: { report: Report }) {
  const [kind, setKind] = useState<"all" | "issues" | "prs">("issues");
  const [area, setArea] = useState<Area | "all">("all");
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [lint, setLint] = useState<LintResult | null>(null);
  const reduced = useReducedMotion() !== false;
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 80%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const selected = report.items.filter((i) => kind === "all" || (kind === "prs" ? i.pull_request : !i.pull_request));
  const open = selected.filter((i) => i.state === "open");
  const responses = selected.flatMap((i) => (i.responseHours === null ? [] : [i.responseHours]));
  const closures = selected.flatMap((i) => (i.closeHours === null ? [] : [i.closeHours]));
  const filtered = selected
    .filter(
      (i) =>
        (area === "all" || i.area === area) &&
        (state === "all" || i.state === state) &&
        `${i.repo}#${i.number}`.includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.ageHours - a.ageHours);
  const requested = areas
    .map((a) => ({
      area: a,
      items: report.items.filter(
        (i) =>
          !i.pull_request && i.state === "open" && i.area === a && ["request", "feature", "question"].includes(i.type),
      ),
    }))
    .filter((r) => r.items.length)
    .sort((a, b) => b.items.length - a.items.length || a.area.localeCompare(b.area));
  const room = report.chat.find((c) => c.source.endsWith("/rooms"));
  const stats = report.chat.find((c) => c.source.endsWith("/stats"));
  const metrics = [
    { label: "Open in sample", value: open.length, note: `Of ${selected.length} selected items` },
    {
      label: "First response median",
      value: duration(median(responses)),
      note: `${responses.length} observed / ${selected.length} selected`,
    },
    {
      label: "Closure median",
      value: duration(median(closures)),
      note: `${closures.length} closed / ${selected.length} selected`,
    },
  ];
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ToolHeader slug="community" />
      </header>
      <ReadingReveal order={3}>
        <aside className={styles.notice}>
          <span className="badge">Recorded public sample</span>
          <p>
            Find the areas drawing requests and see the wait in public threads. This board samples the latest 25 issues
            or PRs by creation date from each repository. Older backlog is outside the window.
          </p>
          <p className="muted">
            Collection ended <time dateTime={report.measuredAt}>{report.measuredAt}</time>. Source clocks are listed
            below. The page makes no live requests.
          </p>
          <div className={styles.actions}>
            <MotionLink href="/community/report.json">Download sourced JSON ↗</MotionLink>
            <code>flop community --json</code>
            <CopyButton text="flop community --json" label="Copy report command" />
          </div>
        </aside>
      </ReadingReveal>
      <section aria-label="Item kind" className={styles.controls}>
        {(["issues", "prs", "all"] as const).map((value) => (
          <MotionButton
            key={value}
            className="quiet-button"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setExpanded(false);
            }}
          >
            {value === "issues" ? "Issues" : value === "prs" ? "Pull requests" : "All items"}
          </MotionButton>
        ))}
      </section>
      <section className={styles.metrics} aria-label="Measured sample totals">
        {metrics.map((m, i) => (
          <ReadingReveal key={m.label} order={i}>
            <article>
              <p className="eyebrow">{m.label}</p>
              <p className={styles.number}>
                {typeof m.value === "number" ? (
                  <ObservedNumber value={m.value} />
                ) : (
                  <motion.span
                    key={m.value}
                    initial={{ y: reduced ? 0 : 6 }}
                    animate={{ y: 0 }}
                    transition={{ duration: reduced ? 0 : 0.3 }}
                  >
                    {m.value}
                  </motion.span>
                )}
              </p>
              <p className="muted">{m.note}</p>
            </article>
          </ReadingReveal>
        ))}
      </section>
      <p className={styles.definition}>
        A response is a non-author human thread comment with OWNER, MEMBER or COLLABORATOR association. Unobserved
        replies are excluded from the median. Closure uses the current closed_at timestamp.
      </p>
      <section className={styles.charts} aria-label="Open item charts">
        <ReadingReveal>
          <div className={styles.panel}>
            <p className="eyebrow">Where requests land</p>
            <h2>Open items by area</h2>
            <p className="muted">
              Select an area to inspect its sampled items. Bars show shares of {open.length} open selected items.
            </p>
            <div className={styles.chartRows}>
              {areas.map((a) => {
                const count = open.filter((i) => i.area === a).length;
                return (
                  <MotionButton
                    key={a}
                    className={styles.chartButton}
                    aria-pressed={area === a}
                    onClick={() => {
                      setArea(area === a ? "all" : a);
                      setExpanded(false);
                    }}
                  >
                    <span>{a}</span>
                    <strong>
                      <ObservedNumber value={count} />
                    </strong>
                    <Bar label={a} value={count} total={open.length} />
                  </MotionButton>
                );
              })}
            </div>
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.panel}>
            <p className="eyebrow">Age at observation</p>
            <h2>How long open?</h2>
            <p className="muted">
              Elapsed time from creation to each repository observation. Includes time spent closed before a reopening.
            </p>
            <div className={styles.ages}>
              {ageGroups.map((g) => {
                const count = open.filter((i) => i.ageHours >= g.min && i.ageHours < g.max).length;
                return (
                  <div key={g.label}>
                    <span>{g.label}</span>
                    <strong>
                      <ObservedNumber value={count} />
                    </strong>
                    <Bar label={g.label} value={count} total={open.length} />
                  </div>
                );
              })}
            </div>
          </div>
        </ReadingReveal>
      </section>
      <section className={styles.requested} aria-labelledby="requested-title">
        <ReadingReveal>
          <p className="eyebrow">Most requested in this sample</p>
          <h2 id="requested-title">Requests, features and questions</h2>
          <p className="muted">
            Open issues of these types, grouped by area. Counts are items, not people or votes. This list uses the whole
            sample.
          </p>
        </ReadingReveal>
        <div className={styles.requestGrid}>
          {requested.length ? (
            requested.map((r, i) => (
              <ReadingReveal key={r.area} order={i}>
                <article className={styles.panel}>
                  <h3>
                    {r.area}{" "}
                    <span className={styles.count}>
                      <ObservedNumber value={r.items.length} />
                    </span>
                  </h3>
                  <div className={styles.actions}>
                    {r.items.slice(0, 3).map((item) => (
                      <MotionLink key={item.source} href={item.source}>
                        {item.repo} #{item.number} ↗
                      </MotionLink>
                    ))}
                  </div>
                  <p className="muted">
                    {r.items.length > 3
                      ? "Example source links. Filter this area for all sampled items."
                      : "All sampled request links in this area."}
                  </p>
                </article>
              </ReadingReveal>
            ))
          ) : (
            <p>No open requests, features or questions observed.</p>
          )}
        </div>
      </section>
      <section className={styles.items} aria-labelledby="items-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Inspect the evidence</p>
            <h2 id="items-title">Public thread clocks</h2>
          </div>
          <MotionButton
            className="quiet-button"
            onClick={() => {
              setArea("all");
              setState("open");
              setKind("issues");
              setQuery("");
              setExpanded(false);
            }}
          >
            Reset filters
          </MotionButton>
        </div>
        <div className={styles.controls} role="group" aria-label="Issue state">
          {(["open", "closed", "all"] as const).map((v) => (
            <MotionButton
              className="quiet-button"
              key={v}
              aria-pressed={state === v}
              onClick={() => {
                setState(v);
                setExpanded(false);
              }}
            >
              {v === "all" ? "Any state" : v === "open" ? "Open" : "Closed"}
            </MotionButton>
          ))}
        </div>
        <label className={styles.search}>
          Filter by repository or issue number
          <motion.input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setExpanded(false);
            }}
            placeholder="network#103"
            whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          />
        </label>
        <p role="status" className="muted">
          <ObservedNumber value={filtered.length} /> matching items. Area: {area}. Oldest creation first.{" "}
          {expanded ? "Showing all matches." : "Showing up to ten matches."}
        </p>
        <motion.div className={styles.rows} layout={!reduced} transition={{ duration: reduced ? 0 : 0.3 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {(expanded ? filtered : filtered.slice(0, 10)).map((item) => (
              <motion.article
                data-item={item.source}
                data-area={item.area}
                className={styles.item}
                key={item.source}
                layout={!reduced}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                transition={{ duration: reduced ? 0 : 0.3 }}
              >
                <div className={styles.rowHead}>
                  <h3>
                    <MotionLink href={item.source}>
                      {item.repo} #{item.number} ↗
                    </MotionLink>
                  </h3>
                  <span className="badge">
                    {item.pull_request ? "PR" : "Issue"} · {item.area} / {item.type} · {item.state}
                  </span>
                </div>
                <dl className={styles.clocks}>
                  <div>
                    <dt>Age at observation</dt>
                    <dd>{duration(item.ageHours)}</dd>
                  </div>
                  <div>
                    <dt>First response</dt>
                    <dd>{item.responseHours === null ? item.responseState : duration(item.responseHours)}</dd>
                  </div>
                  <div>
                    <dt>Time to close</dt>
                    <dd>{item.closeHours === null ? "Not closed" : duration(item.closeHours)}</dd>
                  </div>
                </dl>
                <Disclosure title={`Inspect dates for ${item.repo} #${item.number}`}>
                  <div className={styles.dates}>
                    <p>Created: {item.created_at}</p>
                    <p>Issue observed: {item.measuredAt}</p>
                    <p>Closed: {item.closed_at ?? "Not closed at observation"}</p>
                    <p>Comments observed: {item.commentsMeasuredAt ?? item.measuredAt}</p>
                    <p>
                      {item.responseCount} comments retained.{" "}
                      {item.commentsComplete
                        ? "Comment page coverage complete at observation."
                        : "Comment history incomplete or uncollected. No response is not established."}
                    </p>
                    <p>
                      Classification inputs: prefix {item.prefix || "unrecognized"}; labels{" "}
                      {item.labels.join(", ") || "none recognized"}.
                    </p>
                  </div>
                </Disclosure>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
        {!filtered.length && <p className={styles.empty}>No sampled items match these filters.</p>}
        {filtered.length > 10 && (
          <MotionButton className="quiet-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show fewer items" : "Show all matching items"}
          </MotionButton>
        )}
      </section>
      <section className={styles.charts} aria-label="Chat and access form">
        <ReadingReveal>
          <div className={styles.panel}>
            <p className="eyebrow">technocore.chat</p>
            <h2>Rooms, not message estimates</h2>
            <p className={styles.number}>
              <ObservedNumber value={room?.rooms ?? undefined} />
            </p>
            <p>
              Rooms reported by <MotionLink href="https://technocore.chat/rooms">/rooms ↗</MotionLink>
            </p>
            <p className="muted">{room?.measuredAt ?? "No room observation"}</p>
            <p>
              Message total: <strong>{stats?.messages ?? "Unavailable"}</strong>.{" "}
              {stats?.error ?? "No verified message-count schema"}. Room sequence counters are not summed.
            </p>
            <p className="muted">
              The CLI caches both endpoints for six hours, including failures. Its persistent ledger caps chat requests
              at twenty per rolling day per cache directory.
            </p>
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.panel}>
            <p className="eyebrow">Before opening an access request</p>
            <h2>Check the required fields</h2>
            <p>
              Paste the Markdown issue form. This check runs in your browser. Values are not sent or saved. It checks
              presence and dropdown choices.
            </p>
            <label className={styles.search}>
              Access issue Markdown
              <motion.textarea
                value={body}
                maxLength={65536}
                rows={6}
                onChange={(e) => {
                  setBody(e.target.value);
                  setLint(null);
                }}
                autoComplete="off"
                spellCheck={false}
                whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
                transition={{ duration: reduced ? 0 : 0.15 }}
                placeholder="### Request&#10;gateway allowance&#10;### Network&#10;devnet&#10;### Public identifiers"
              />
            </label>
            <div className={styles.actions}>
              <MotionButton
                className="quiet-button"
                onClick={() => {
                  try {
                    setLint(lintAccess(body));
                  } catch {
                    setLint({
                      valid: false,
                      form: accessForm.source,
                      findings: [{ field: "Input", problem: "Exceeds 64 KiB" }],
                    });
                  }
                }}
              >
                Check fields
              </MotionButton>
              <MotionButton
                className="quiet-button"
                onClick={() => {
                  setBody("");
                  setLint(null);
                }}
              >
                Clear input
              </MotionButton>
              <MotionLink href={accessForm.source}>Pinned form ↗</MotionLink>
            </div>
            <motion.div
              layout={!reduced}
              className={styles.lint}
              aria-live="polite"
              transition={{ duration: reduced ? 0 : 0.2 }}
            >
              <AnimatePresence mode="wait">
                {lint && (
                  <motion.div
                    key={JSON.stringify(lint)}
                    initial={{ opacity: reduced ? 1 : 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.15 }}
                  >
                    {lint.valid ? (
                      <p>Required fields are present. Access eligibility is not checked.</p>
                    ) : (
                      <ul>
                        {lint.findings.map((f) => (
                          <li key={f.field}>
                            {f.field}: {f.problem}
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </ReadingReveal>
      </section>
      <section ref={guide} className={styles.guide} aria-labelledby="scope-title">
        <div className={styles.rail} aria-hidden="true">
          <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
        </div>
        <p className="eyebrow">Read the scope</p>
        <h2 id="scope-title">What the clocks can tell you</h2>
        <p className="muted">The line tracks reading progress, not completeness.</p>
        <ReadingReveal>
          <h3>A bounded public window</h3>
          <p>
            The GitHub issues endpoint includes PRs. Each repository contributes its latest page. The live reader
            inspects comments for up to ten threads per repository and up to one hundred comments per thread. Unknown
            response coverage stays explicit. Deleted comments and PR reviews are outside this measure.
          </p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h3>Source dates, not a service promise</h3>
          <p>
            Age = observation minus creation. Response = first qualifying comment minus creation. Close = current
            closed_at minus creation. Medians use observed values only. An issue closing does not prove its request was
            fulfilled.
          </p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <h3>Evidence without personal profiles</h3>
          <p>
            Full titles, bodies, logins and user IDs are discarded. Recognized labels and title prefixes decide area and
            type. No ranking of people is computed. Follow an issue link to read its public context on GitHub.
          </p>
        </ReadingReveal>
        <div className={styles.sources}>
          {report.repos.map((r) => (
            <article key={r.repo}>
              <h3>
                <MotionLink href={r.source}>{r.repo} source ↗</MotionLink>
              </h3>
              <p>
                {r.count} sampled items. {r.hasMore ? "Older items omitted." : "No next page observed."} {r.error ?? ""}
              </p>
              <p className="muted">{r.measuredAt}</p>
            </article>
          ))}
        </div>
        <h3>What this does not verify</h3>
        <p>
          Maintainer association is GitHub metadata. It does not establish a support role or response quality. Private
          discussions, full backlog demand, access eligibility, message totals and current service health are not
          verified.
        </p>
      </section>
    </div>
  );
}
