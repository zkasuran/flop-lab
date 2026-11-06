// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import type { proofReference, Quote } from "../../../../packages/proofs/src/reference";
import type { proofHistory } from "../../../../packages/proofs/src/history";
import { selectSettlements, type ProofView } from "./view";
import styles from "./proofs.module.css";

const command = "pnpm --filter @flop-lab/proofs build && node packages/proofs/dist/cli.js list";
const utc = (value: string) => value.replace("T", " ").replace("Z", " UTC");
const plain = (value: string) => value.replace(/\*\*|\*|`/g, "");
function Source({ at, label = "Public MCP observation" }: { at: string; label?: string }) {
  return (
    <p className={styles.source}>
      <MotionLink href="https://mcp.flop.network/mcp">{label} ↗</MotionLink>
      <time dateTime={at}>{utc(at)}</time>
    </p>
  );
}
function Citation({ evidence }: { evidence: Quote }) {
  return (
    <div className={styles.citation}>
      <blockquote>{plain(evidence.quote)}</blockquote>
      <MotionLink href={evidence.source}>Pinned paper, line {evidence.line} ↗</MotionLink>
      <time dateTime={evidence.measuredAt}>Fetched {utc(evidence.measuredAt)}</time>
    </div>
  );
}

/** Recorded proof evidence with a reading-linked architecture and explicit unknown coverage. @example <ProofBoard {...data} /> */
export function ProofBoard({
  view,
  reference,
  history,
}: {
  view: ProofView;
  reference: ReturnType<typeof proofReference>;
  history: ReturnType<typeof proofHistory>;
}) {
  const reduced = useReducedMotion() !== false;
  const diagram = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: diagram, offset: ["start 75%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const [tab, setTab] = useState<"proofs" | "leaders">("proofs");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(0);
  const rows = selectSettlements(view, query, order);
  const visible = rows.slice(page * 12, (page + 1) * 12);
  const settlements = view.settlements.value?.rows;
  const unknown = settlements?.filter((s) => s.status === "UNVERIFIABLE").length;
  const ratio = settlements?.length && unknown !== undefined ? unknown / settlements.length : 0;
  const duration = reduced ? 0 : 0.24;
  return (
    <div className={styles.page}>
      <section className={`section ${styles.hero}`}>
        <ToolHeader slug="proofs" />
        <ReadingReveal order={3}>
          <div className={styles.finding}>
            <div>
              <p className="eyebrow">Recorded evidence / devnet</p>
              <h2>Activity is not coverage.</h2>
              <p>
                The public proof rail and paid compute channels expose different evidence. Follow each claim to its
                source before treating a settlement as verified.
              </p>
              <Source at={view.measuredAt} label="Recording completed through MCP" />
            </div>
            <div className={styles.metrics}>
              <div>
                <strong>
                  <ObservedNumber value={view.proofs.value?.rows.length} />
                </strong>
                <span>Observed PoUI rows</span>
                <time dateTime={view.proofs.measuredAt}>{utc(view.proofs.measuredAt)}</time>
              </div>
              <div>
                <strong>
                  <ObservedNumber value={view.stats.value?.proofs24h ?? undefined} />
                </strong>
                <span>Reported proofs24h</span>
                <time dateTime={view.stats.measuredAt}>{utc(view.stats.measuredAt)}</time>
              </div>
              <div>
                <strong>
                  <ObservedNumber value={settlements?.length} />
                </strong>
                <span>Recorded settlements</span>
                <time dateTime={view.settlements.measuredAt}>{utc(view.settlements.measuredAt)}</time>
              </div>
            </div>
          </div>
        </ReadingReveal>
        <ReadingReveal order={4}>
          <div className={styles.actions}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy replay command" />
            <MotionLink className="quiet-button" href="/proofs/recording" download>
              Download raw recording ↓
            </MotionLink>
          </div>
        </ReadingReveal>
      </section>

      <section className={`section ${styles.architecture}`} aria-labelledby="architecture-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Specification / section 3</p>
            <h2 id="architecture-title">What each layer establishes.</h2>
          </div>
          <p>
            The line tracks your reading position. It does not show verification progress. Requirements below come from
            the pinned paper.
          </p>
        </div>
        <div className={styles.diagram} ref={diagram}>
          <div className={styles.rail} aria-hidden="true">
            <motion.div data-reading-progress style={{ scaleY: reduced ? 1 : scaleY }} />
          </div>
          {reference.types.map((type, i) => (
            <ReadingReveal key={type.id} order={i}>
              <motion.article layout={!reduced} transition={{ duration }} className={styles.layer} data-layer={type.id}>
                <span className={styles.step} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className={styles.layerBody}>
                  <p className="eyebrow">{type.requirement}</p>
                  <h3>{type.name}</h3>
                  <p>{type.establishes}</p>
                  <p className={styles.limit}>{type.limit}</p>
                  <Disclosure title={`Read ${type.name} source`}>
                    <Citation evidence={type.evidence} />
                  </Disclosure>
                </div>
                <aside className={styles.layerObserved}>
                  <p className="eyebrow">This recording</p>
                  {type.id === "aggregation" ? (
                    <>
                      <strong>
                        <ObservedNumber value={view.proofs.value?.rows.length} />
                      </strong>
                      <p>PoUI indexer rows</p>
                      <p className="muted">The row schema does not identify the proof type or expose its payload.</p>
                      <MotionLink href="#observations">Inspect direct-rail rows ↓</MotionLink>
                    </>
                  ) : (
                    <>
                      <span className={styles.unknown}>Not exposed</span>
                      <p>
                        {type.id === "tee"
                          ? "No hardware quote was collected or verified."
                          : type.id === "toploc"
                            ? "No channel TOPLOC commitment in this public projection."
                            : "No checker verdict or audit assignment in this recording."}
                      </p>
                    </>
                  )}
                </aside>
              </motion.article>
            </ReadingReveal>
          ))}
        </div>
        <div className={styles.railBoundary}>
          <div>
            <p className="eyebrow">Separate payment lane</p>
            <h3>Paid sessions settle through compute channels.</h3>
            <p>
              Direct PoUI credit covers synthetic, ghost, calibration and simulator work. A proof row does not cover a
              paid session just because the miner matches.
            </p>
          </div>
          <div>
            <Citation evidence={reference.rail} />
            <MotionLink href="/sessions">Trace a compute channel ↗</MotionLink>
          </div>
        </div>
        <Disclosure title="Inspect submission call references">
          <div className={styles.callList}>
            {reference.calls.map((c) => (
              <Citation key={c.line} evidence={c} />
            ))}
            <p>
              Appendix G.2 lists the direct-rail calls. The paper references the TOPLOC presence gate in Appendix F. It
              has no standalone submit_toploc_evidence signature row in Appendix G.1.
            </p>
          </div>
        </Disclosure>
      </section>

      <section className="section" id="observations" aria-labelledby="observations-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Observation / direct rail</p>
            <h2 id="observations-title">What reached the public index.</h2>
          </div>
          <p>A successful API read can return an empty table. No synthetic submissions are shown here.</p>
        </div>
        <div className={styles.tabs} role="group" aria-label="Observed evidence">
          {(["proofs", "leaders"] as const).map((t) => (
            <MotionButton key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={styles.tab}>
              {tab === t && (
                <motion.span
                  className={styles.tabMarker}
                  layoutId={reduced ? undefined : "proof-tab"}
                  transition={{ duration }}
                  data-tab-marker
                  aria-hidden="true"
                />
              )}
              <span>{t === "proofs" ? "Proof rows" : "Leaderboards"}</span>
            </MotionButton>
          ))}
        </div>
        <div className={styles.observedPanel}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.12 }}
            >
              {tab === "proofs" ? (
                <>
                  <p className="eyebrow">pouiProofs</p>
                  <Source at={view.proofs.measuredAt} />
                  {view.proofs.value ? (
                    view.proofs.value.rows.length ? (
                      <ul className={styles.proofRows}>
                        {view.proofs.value.rows.map((p) => (
                          <li key={p.id}>
                            <code>{p.id}</code>
                            <p>Task: {p.taskHash ?? "not reported"}</p>
                            <p>Submitter: {p.submitter ?? "not reported"}</p>
                            <p>Reported success count: {p.successCount ?? "no data"}</p>
                            <p>Reported G_n weight: {p.gnWeight ?? "no data"}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className={styles.empty}>
                        <span aria-hidden="true">∅</span>
                        <h3>No proof rows in this observation.</h3>
                        <p>This does not establish that a paid channel lacked its required evidence.</p>
                      </div>
                    )
                  ) : (
                    <div className={styles.empty}>
                      <h3>Proof source unavailable.</h3>
                      <p>{view.proofs.reason}</p>
                    </div>
                  )}
                  <p className="muted">
                    {view.proofs.value?.complete
                      ? "The proof query ended on a short page. It exposes no total."
                      : "This proof sample is partial or unavailable."}
                  </p>
                </>
              ) : (
                <div className={styles.leaders}>
                  {[
                    { label: "Hosted MCP leaderboard", data: view.leaderboard },
                    { label: "Indexer GraphQL leaderboard", data: view.indexerLeaderboard },
                  ].map(({ label, data }) => (
                    <div key={label}>
                      <h3>{label}</h3>
                      <Source at={data.measuredAt} />
                      {data.value ? (
                        data.value.length ? (
                          <ul>
                            {data.value.map((row) => (
                              <li key={row.submitter}>
                                <code>{row.submitter}</code>
                                <p>
                                  Proofs: {row.proofsCount ?? "no data"} / reported weight:{" "}
                                  {row.totalWeight ?? "no data"}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={styles.emptyLabel}>No leaderboard rows observed.</p>
                        )
                      ) : (
                        <p>Source unavailable: {data.reason}</p>
                      )}
                    </div>
                  ))}
                  <p className="muted">
                    These projections share indexer infrastructure. Each is a bounded sample, not an independent
                    verification result.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <section className="section" aria-labelledby="coverage-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Coverage / paid channels</p>
            <h2 id="coverage-title">A reason for every unknown.</h2>
          </div>
          <p>
            The public schema cannot bind a proof to a paid channel. UNVERIFIABLE describes this evidence limit, not a
            failed proof.
          </p>
        </div>
        <div className={styles.coverageSummary}>
          <p>
            <strong>
              <ObservedNumber value={unknown} />
            </strong>{" "}
            of {settlements?.length ?? "no data"} recorded settlements are UNVERIFIABLE.
          </p>
          <div className={styles.barTrack} aria-hidden="true">
            <motion.div
              data-coverage-bar
              initial={false}
              whileInView={{ scaleX: ratio }}
              style={{ scaleX: reduced ? ratio : 0 }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 0.45 }}
            />
          </div>
          <p className="muted">
            {view.settlements.value?.complete
              ? "All rows returned by reported pagination."
              : "Partial or unavailable settlement sample."}{" "}
            Reported total: {view.settlements.value?.reportedTotal ?? "no data"}.
          </p>
          <Source at={view.settlements.measuredAt} />
        </div>
        <div className={styles.filters}>
          <label>
            Channel or miner
            <motion.input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search a recorded identifier"
              whileFocus={reduced ? {} : { boxShadow: "0 0 0 2px var(--accent-soft)" }}
              transition={{ duration }}
            />
          </label>
          <div role="group" aria-label="Settlement order">
            {(["newest", "oldest"] as const).map((o) => (
              <MotionButton
                key={o}
                className="quiet-button"
                aria-pressed={order === o}
                onClick={() => {
                  setOrder(o);
                  setPage(0);
                }}
              >
                {o === "newest" ? "Newest first" : "Oldest first"}
              </MotionButton>
            ))}
          </div>
        </div>
        <p className={styles.matchCount} role="status">
          {rows.length} matching settlements. Showing {visible.length ? page * 12 + 1 : 0} to{" "}
          {Math.min((page + 1) * 12, rows.length)}.
        </p>
        <motion.ul layout={!reduced} className={styles.settlementList} transition={{ duration }}>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((s) => (
              <motion.li
                layout={reduced ? false : "position"}
                key={s.channelId}
                data-settlement={s.channelId}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration }}
              >
                <div className={styles.settlementHeader}>
                  <div>
                    <code>{s.channelId}</code>
                    <p className="muted">
                      Block {s.settledBlock.toLocaleString("en-US")} / {utc(new Date(s.settledAt).toISOString())}
                    </p>
                  </div>
                  <span className={styles.unknown}>{s.status}</span>
                </div>
                <Disclosure title={`Evidence for ${s.channelId.slice(0, 10)}`}>
                  <div className={styles.settlementDetail}>
                    <p>{view.reasons[s.code]}</p>
                    <dl>
                      <dt>Miner</dt>
                      <dd>
                        <code>{s.miner}</code>
                      </dd>
                      <dt>Reported model</dt>
                      <dd>
                        <code>{s.modelHash ?? "Not reported"}</code>
                      </dd>
                      <dt>Aggregate G_n</dt>
                      <dd>
                        <code>{s.aggregateGn}</code>
                      </dd>
                    </dl>
                    <div className={styles.actions}>
                      <CopyButton text={s.channelId} label="Copy channel ID" />
                      <MotionLink href="/verify">Inspect settlement evidence ↗</MotionLink>
                    </div>
                    <Source at={view.settlements.measuredAt} />
                    <p className="muted">
                      Proof lookup time: {utc(view.proofs.measuredAt)}. Event time is not the time this tool observed
                      the row.
                    </p>
                  </div>
                </Disclosure>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        {!visible.length && (
          <p className={styles.emptyLabel}>
            {view.settlements.status === "unavailable"
              ? `Settlement source unavailable: ${view.settlements.reason}`
              : "No matching settlement in this recording."}
          </p>
        )}
        <div className={styles.pager}>
          <MotionButton className="quiet-button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous page
          </MotionButton>
          <MotionButton
            className="quiet-button"
            disabled={(page + 1) * 12 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </MotionButton>
        </div>
      </section>

      <section className="section" aria-labelledby="history-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Recorder / separate observations</p>
            <h2 id="history-title">Windows, not a cumulative count.</h2>
          </div>
          <p>
            The bundled recorder runs are close together. They do not establish a daily trend. Missing counts stay
            missing.
          </p>
        </div>
        <div className={styles.history}>
          {history.map((h) => (
            <ReadingReveal key={h.snapshotId}>
              <article>
                <time dateTime={h.measuredAt}>{utc(h.measuredAt)}</time>
                <div className={styles.historyValues}>
                  <p>
                    <strong>{h.proofs24h.value ?? "No data"}</strong> reported proofs24h
                  </p>
                  <p>
                    <strong>{h.leaderboardRows.value ?? "No data"}</strong> sampled leaderboard rows
                  </p>
                </div>
                <Disclosure title={`Recorder sources ${h.snapshotId.slice(0, 8)}`}>
                  <p className={styles.rawSource}>
                    {h.proofs24h.source}
                    <br />
                    {utc(h.proofs24h.measuredAt)}
                  </p>
                  <p className={styles.rawSource}>
                    {h.leaderboardRows.source}
                    <br />
                    {utc(h.leaderboardRows.measuredAt)}
                  </p>
                </Disclosure>
              </article>
            </ReadingReveal>
          ))}
        </div>
        {!history.length && <p>No recorder observations available.</p>}
        <p className={styles.note}>
          Rolling proofs24h windows overlap. Never sum them. Leaderboard row count is the recorder sample size, not the
          number of submitted proofs. <MotionLink href="/history">Open recorder history ↗</MotionLink>
        </p>
      </section>

      <section className="section" aria-labelledby="parameters-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="eyebrow">Specification only / sampled audit</p>
            <h2 id="parameters-title">Selection is not full coverage.</h2>
          </div>
          <p>
            These defaults are quoted from Appendix A. This tool does not read deployed runtime storage or calculate an
            empirical detection probability.
          </p>
        </div>
        <div className={styles.parameters}>
          {reference.parameters.map((p) => (
            <ReadingReveal key={p.name}>
              <article>
                <code>{p.name}</code>
                <strong>{p.value}</strong>
                <MotionLink href={p.source}>Appendix A, line {p.line} ↗</MotionLink>
                <p>
                  {p.name === "sampled_audit_alpha_ppm"
                    ? "Default fraction for post-epoch sampled-audit selection."
                    : p.name === "audit_quantum_gn"
                      ? "Served-work quantum that forces an audit ticket."
                      : "A turn at or above this work threshold is force-audited."}
                </p>
              </article>
            </ReadingReveal>
          ))}
        </div>
        <p className={styles.note}>
          Paper {reference.sha.slice(0, 8)} fetched {utc(reference.measuredAt)}.{" "}
          <MotionLink href={reference.source}>Read the pinned source ↗</MotionLink>
        </p>
      </section>
      <section className={`section ${styles.limitations}`}>
        <p className="eyebrow">What this does not verify</p>
        <h2>Public observations are not proof verification.</h2>
        <p>{view.limits}</p>
        <p>
          No signatures, hardware quotes, TOPLOC openings, validator bundles, inference execution or runtime parameter
          enforcement are checked. No wallet or write transaction is used.
        </p>
      </section>
    </div>
  );
}
