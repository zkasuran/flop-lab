// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import { states, transitions, type State } from "../../../../packages/sessions/src/lifecycle";
import type { Coverage } from "../../../../packages/sessions/src/classify";
import {
  visibleChannels,
  traceState,
  pageSize,
  parseDetail,
  type Detail,
  type HistoryRow,
  type SessionCard,
} from "./view";
import styles from "./sessions.module.css";

const short = (id: string) => `${id.slice(0, 10)}...${id.slice(-6)}`;
const shortLabels: Record<State, string> = {
  opening: "Opening",
  open: "Open",
  cooperative: "Cooperative",
  "challenge-window": "Forced claim",
  disputed: "Disputed",
  finalized: "Finalised",
  refunded: "Refund / expiry",
  unknown: "Unresolved",
};
const descriptions: Record<State, string> = {
  opening: "Miner acknowledgement pending",
  open: "Usage stays off-chain",
  cooperative: "Co-signed payout reported",
  "challenge-window": "Awaiting finalisation evidence",
  disputed: "Verdict not inferred",
  finalized: "Explicit finalisation reported",
  refunded: "Timeout, refund or void reported",
  unknown: "Missing or conflicting evidence",
};
const diagramOrder: State[] = [
  "opening",
  "open",
  "cooperative",
  "refunded",
  "unknown",
  "challenge-window",
  "disputed",
  "finalized",
];

function ChannelDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ id: string; session: Detail | null; error: string | null } | null>(null);
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    if (!id) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    const controller = new AbortController();
    void fetch(`/sessions/channel/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Recorded channel could not be loaded.");
        const value: unknown = await response.json();
        setData({ id, session: parseDetail(value, id), error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setData({ id, session: null, error: error instanceof Error ? error.message : "Read failed" });
      });
    return () => controller.abort();
  }, [id]);
  const session = data?.id === id ? data.session : null;
  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby="session-drawer-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <motion.div
        key={id}
        initial={{ opacity: 1, x: reduced ? 0 : 18 }}
        animate={{ x: 0 }}
        transition={{ duration: reduced ? 0 : 0.3 }}
        data-drawer-content
      >
        <div className={styles.drawerHeading}>
          <p className="eyebrow">Recorded channel evidence</p>
          <MotionButton onClick={onClose} aria-label="Close channel details" className="button">
            Close
          </MotionButton>
        </div>
        <h2 id="session-drawer-title">{session?.label ?? "Channel details"}</h2>
        <p className={styles.fullId}>{id}</p>
        {id && <CopyButton text={id} label="Copy channel ID" />}
        <div role="status">
          {data?.id === id && data.error ? data.error : !session ? "Loading the recorded evidence..." : null}
        </div>
        {session && (
          <>
            <p className={styles.reason}>{session.reason}</p>
            {session.evidence.map((e) => (
              <section className={styles.evidence} key={e.kind}>
                <h3>{e.kind === "channels" ? "Channel projection" : "Settlement tape"}</h3>
                <time>{e.measuredAt}</time>
                <MotionLink href={e.source}>Public source ↗</MotionLink>
                <dl>
                  {Object.entries(e.fields).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value === null ? "Not reported" : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <p className="muted">
              Copy the ID, then paste it into the verifier or use it while reviewing a challenge. These links do not
              submit a transaction.
            </p>
            <div className={styles.actions}>
              <MotionLink className="button" href="/verify">
                Open verifier ↗
              </MotionLink>
              <MotionLink className="button" href="/challenger">
                Open challenger ↗
              </MotionLink>
            </div>
            <Disclosure title="Inspect recorded channel fields">
              <pre className={styles.raw}>
                {JSON.stringify({ channel: session.channel, settlement: session.settlement }, null, 2)}
              </pre>
            </Disclosure>
          </>
        )}
      </motion.div>
    </dialog>
  );
}

export function SessionBoard({
  cards,
  measuredAt,
  counts,
  source,
  channelCoverage,
  tapeCoverage,
  offers,
  history,
}: {
  cards: SessionCard[];
  measuredAt: string;
  counts: Record<State, number> | null;
  source: string;
  channelCoverage: Coverage;
  tapeCoverage: Coverage;
  offers: Coverage;
  history: HistoryRow[];
}) {
  const [filter, setFilter] = useState<State | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(cards.find((c) => c.state === "challenge-window") ?? cards[0] ?? null);
  const [at, setAt] = useState<"opened" | "latest">("latest");
  const [drawer, setDrawer] = useState<string | null>(null);
  const reduced = useReducedMotion() !== false;
  const duration = reduced ? 0 : 0.36;
  const guide = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: guide, offset: ["start 85%", "end 40%"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const matching = visibleChannels(cards, filter, query);
  const shown = matching.slice(page * pageSize, (page + 1) * pageSize);
  const tracedState = selected ? traceState(selected, at) : null;
  const max = Math.max(1, ...Object.values(counts ?? {}));
  function choose(state: State | "all") {
    setFilter(state);
    setPage(0);
  }
  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero}>
        <ToolHeader slug="sessions" />
        <ReadingReveal order={3}>
          <p className={styles.lead}>
            An open channel is a promise.
            <br />A settlement is a different state.
          </p>
          <p className="muted">See which step is reported. Follow the evidence before treating a claim as a payout.</p>
        </ReadingReveal>
      </section>
      <ReadingReveal order={4}>
        <section className={styles.capture} aria-label="Recording coverage">
          <div>
            <p className="eyebrow">Recorded public data</p>
            <time>{measuredAt}</time>
            <MotionLink href={source}>Hosted MCP / indexer ↗</MotionLink>
          </div>
          <div>
            <strong>
              <ObservedNumber value={channelCoverage.total === null ? undefined : channelCoverage.rows} />
            </strong>
            <p>channel rows / {channelCoverage.total ?? "unknown"} reported</p>
          </div>
          <div>
            <strong>
              <ObservedNumber value={tapeCoverage.total === null ? undefined : tapeCoverage.rows} />
            </strong>
            <p>tape rows / {tapeCoverage.total ?? "unknown"} reported</p>
          </div>
          <p className={styles.coverageNote}>
            {channelCoverage.complete && tapeCoverage.complete
              ? "All reported pages captured."
              : "Partial observation."}{" "}
            Sequential reads, not an atomic chain snapshot. This page does not poll.
          </p>
        </section>
      </ReadingReveal>

      <section className={styles.lifecycle} aria-labelledby="lifecycle-heading">
        <ReadingReveal>
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">The observed lifecycle</p>
              <h2 id="lifecycle-heading">Follow one channel.</h2>
            </div>
            <p className="muted">
              Node counts describe the latest recording. The moving marker traces only the selected channel.
            </p>
          </div>
        </ReadingReveal>
        <div className={styles.traceControls}>
          <div>
            <p className="eyebrow">Selected channel</p>
            <code>{selected ? short(selected.id) : "No observed channels"}</code>
          </div>
          <div className={styles.actions}>
            {(["opened", "latest"] as const).map((value) => (
              <MotionButton
                key={value}
                className="button"
                aria-pressed={at === value}
                disabled={
                  !selected || (value === "opened" && (selected.openedBlock === null || !selected.canReplayOpening))
                }
                onClick={() => setAt(value)}
              >
                {value === "opened" ? "Recorded opening" : "Latest reported state"}
              </MotionButton>
            ))}
          </div>
          <p className={styles.traceNote} aria-live="polite">
            {selected
              ? `${at === "opened" ? "Opening" : "Latest status"} block: ${(at === "opened" ? selected.openedBlock : selected.statusBlock) ?? "not reported"}. ${at === "opened" ? "Reconstructed from the channel's openedBlock field." : "Uses the classifier's current evidence."}`
              : "No data"}{" "}
            Intermediate steps are not inferred.
          </p>
        </div>
        <p className={styles.offer}>
          Offers: {offers.total === null ? "no data" : `${offers.rows} observed`}. Offers precede opening. No public
          offer-to-channel link is inferred.
        </p>
        <LayoutGroup id="session-diagram">
          <div className={styles.diagram}>
            <svg className={styles.edges} viewBox="0 0 1000 340" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="sessions-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0 0 L6 3 L0 6" fill="var(--muted)" />
                </marker>
              </defs>
              <path
                d="M200 80 H280 M450 80 H530 M400 135 V215 M450 265 H530 M450 300 V335 H850 V300 M440 150 H895 V110 M650 225 V180 H875 V130"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.5"
                markerEnd="url(#sessions-arrow)"
              />
            </svg>
            {diagramOrder.map((state, index) => (
              <ReadingReveal key={state} order={index % 4}>
                <motion.article className={styles.node} data-state={state} data-traced={tracedState === state}>
                  <MotionButton
                    className={styles.nodeButton}
                    aria-pressed={filter === state}
                    onClick={() => choose(state)}
                  >
                    <span>{shortLabels[state]}</span>
                    <strong>
                      <ObservedNumber value={counts?.[state]} />
                    </strong>
                  </MotionButton>
                  <p>{descriptions[state]}</p>
                  <div className={styles.bar}>
                    <motion.div
                      initial={false}
                      animate={{ scaleX: counts ? counts[state] / max : 0 }}
                      transition={{ duration }}
                    />
                  </div>
                  <div className={styles.markerSlot}>
                    {selected && tracedState === state && (
                      <motion.div
                        className={styles.marker}
                        layoutId={reduced ? undefined : "traced-channel"}
                        transition={{ duration }}
                        data-trace-marker
                      >
                        <span aria-hidden="true">●</span> {short(selected.id)}
                      </motion.div>
                    )}
                  </div>
                </motion.article>
              </ReadingReveal>
            ))}
          </div>
        </LayoutGroup>
        <p className="muted">
          Cooperative payouts bypass the forced claim window. A challenge-end block alone never proves finalisation.
          Click a state to filter its channels below.
        </p>
      </section>

      <section className={styles.list} aria-labelledby="channels-heading">
        <div className={styles.sectionHeading}>
          <h2 id="channels-heading">Inspect the channels.</h2>
          <MotionLink className="button" href="/sessions/recording" download>
            Download classified evidence ↓
          </MotionLink>
        </div>
        <div className={styles.filters}>
          <MotionButton className="button" aria-pressed={filter === "all"} onClick={() => choose("all")}>
            All states
          </MotionButton>
          <label>
            State
            <motion.select
              aria-label="State"
              value={filter}
              onChange={(e) => choose(e.target.value as State | "all")}
              whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              <option value="all">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {shortLabels[s]}
                </option>
              ))}
            </motion.select>
          </label>
          <label className={styles.search}>
            Channel ID
            <motion.input
              aria-label="Channel ID"
              type="search"
              value={query}
              placeholder="0x..."
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              whileFocus={{ boxShadow: "0 0 0 2px var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
          </label>
        </div>
        <p className={styles.results} role="status">
          {matching.length} matching recorded channels. Showing {shown.length}.
        </p>
        <div className={styles.rows}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((c) => (
              <motion.article
                layout={reduced ? false : "position"}
                key={c.id}
                className={styles.row}
                initial={{ opacity: 1, y: reduced ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
                data-channel={c.id}
              >
                <div>
                  <span className={styles.stateLabel}>{shortLabels[c.state]}</span>
                  <code title={c.id}>{short(c.id)}</code>
                </div>
                <div className={styles.rowBlocks}>
                  Opened {c.openedBlock ?? "unreported"}
                  <br />
                  Status {c.statusBlock ?? "unreported"}
                </div>
                <div className={styles.actions}>
                  <MotionButton
                    className="button"
                    onClick={() => {
                      setSelected(c);
                      setAt("latest");
                    }}
                    aria-pressed={selected?.id === c.id}
                  >
                    Trace
                  </MotionButton>
                  <MotionButton className="button" onClick={() => setDrawer(c.id)}>
                    Evidence
                  </MotionButton>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
        {!matching.length && (
          <p className={styles.empty}>
            No matching channel in this recording. Absence here is not proof that a channel never existed.
          </p>
        )}
        <div className={styles.pagination}>
          <MotionButton className="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </MotionButton>
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(matching.length / pageSize))}
          </span>
          <MotionButton
            className="button"
            disabled={(page + 1) * pageSize >= matching.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </MotionButton>
        </div>
      </section>

      <section className={styles.history} aria-labelledby="history-heading">
        <ReadingReveal>
          <p className="eyebrow">Counts over recorded time</p>
          <h2 id="history-heading">A sample is not the network.</h2>
          <p className="muted">
            These bundled recorder snapshots retain settlement samples. They do not contain channel-state snapshots. The
            complete crawl above is a different population. No trend or state change is inferred between runs.
          </p>
        </ReadingReveal>
        <div className={styles.tableWrap}>
          <table>
            <caption>Distinct channels by state in each recorder settlement sample</caption>
            <thead>
              <tr>
                <th scope="col">Recorded at</th>
                <th scope="col">Sample / tape total</th>
                {states.map((s) => (
                  <th scope="col" key={s}>
                    {shortLabels[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.measuredAt}>
                  <th scope="row">
                    <time>{r.measuredAt}</time>
                  </th>
                  <td>
                    {r.rows} / {r.total ?? "unknown"}
                  </td>
                  {states.map((s) => (
                    <td key={s}>{r.counts?.[s] ?? "No data"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MotionLink href="/history">Inspect recorder history ↗</MotionLink>
      </section>

      <section className={styles.guide} ref={guide} aria-labelledby="rules-heading">
        <p className="eyebrow">Quoted transition rules</p>
        <h2 id="rules-heading">Why a channel changes state.</h2>
        <p className="muted">
          The line tracks reading progress, not chain progress. Quotes describe the protocol. The indexer fields
          establish this page's classifications.
        </p>
        <div className={styles.rules}>
          <div className={styles.readingTrack} aria-hidden="true">
            <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : progress }} />
          </div>
          {transitions.map((t, i) => (
            <ReadingReveal key={t.action} order={i % 3}>
              <article>
                <p className="eyebrow">
                  {t.from} → {t.to}
                </p>
                <h3>{t.action}</h3>
                <blockquote>{t.quote}</blockquote>
                <MotionLink href={t.source}>Read the source ↗</MotionLink>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </section>
      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          This is an indexer lifecycle map. It does not verify chain finality, off-chain usage, inference, hardware,
          challenge standing or payout amounts. An indexer label is not an independent proof.
        </p>
        <p className="muted">
          Recorded devnet data can outlive a reset. Unsupported states remain unresolved. Offers and off-chain turns
          cannot be traced to channels from these public fields.
        </p>
      </section>
      <ChannelDrawer id={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
