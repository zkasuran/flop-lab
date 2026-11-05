// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { rankSnapshot, type RankedMiner } from "../../../../packages/scoreboard/src/scoring";
import { pickMiner, type RouteOptions } from "../../../../packages/scoreboard/src/router";
import { parsePage, type Snapshot } from "../../../../packages/scoreboard/src/schema";
import { addHistory, historyGeometry, parseResponse, type HistoryPoint, type SnapshotResponse } from "./data";
import styles from "./scoreboard.module.css";

const command = "pnpm --filter @flop-lab/scoreboard cli rank --file packages/scoreboard/fixtures/snapshot-03.json";
const modelDoc = "https://github.com/zkasuran/flop-lab/blob/main/packages/scoreboard/MODEL.md";
const short = (address: string) => `${address.slice(0, 7)}...${address.slice(-6)}`;
const number = (value: number) => value.toFixed(2);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const age = (date: string, now: number) => {
  const seconds = Math.max(0, Math.floor((now - Date.parse(date)) / 1000));
  return seconds < 60
    ? `${seconds}s old`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m old`
      : `${Math.floor(seconds / 3600)}h old`;
};

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 1, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={styles.track} role="img" aria-label={label}>
      <motion.div
        className={styles.fill}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(1, value)) }}
        transition={{ duration: reduced ? 0 : 0.45 }}
      />
    </div>
  );
}

function History({ history, miner }: { history: HistoryPoint[]; miner: string }) {
  const reduced = useReducedMotion();
  const points = historyGeometry(history, miner);
  const present = points.filter((point) => point.raw !== null);
  if (!present.length) return <p className="muted">No historical settlement price observations for this miner.</p>;
  let previous = false;
  const path = points
    .map((point) => {
      if (point.raw === null) {
        previous = false;
        return "";
      }
      const segment = `${previous ? "L" : "M"}${point.x},${point.y}`;
      previous = true;
      return segment;
    })
    .join(" ");
  return (
    <>
      <svg
        viewBox="0 0 480 110"
        className={styles.sparkline}
        role="img"
        aria-label="Historical settlement median price. Exact raw-unit values and times follow."
      >
        <path d="M12 90H468" className={styles.baseline} />
        <motion.path
          d={path}
          className={styles.priceLine}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 0.5 }}
        />
        {present.map((point) => (
          <circle key={point.measuredAt} cx={point.x} cy={point.y!} r="4" className={styles.dot} />
        ))}
      </svg>
      <p className="muted">
        Lower median per GFLOP in source raw units. Across models. Each point is a stored settlement sample, not a live
        quote. Gaps are not filled.
      </p>
      <ul className={styles.historyList}>
        {points.map((point) => (
          <li key={point.measuredAt}>
            <time className="mono">{point.measuredAt}</time>
            <strong className="mono">{point.raw ?? "No data"}</strong>
          </li>
        ))}
      </ul>
      <a href={present[0]!.source}>Settlement source ↗</a>
    </>
  );
}

function MinerDetails({
  row,
  history,
  now,
  onClose,
}: {
  row: RankedMiner | undefined;
  history: HistoryPoint[];
  now: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (row && !dialog.current?.open) dialog.current?.showModal();
    if (!row && dialog.current?.open) dialog.current.close();
  }, [row]);
  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby="miner-heading"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close();
      }}
    >
      <AnimatePresence mode="wait">
        {row && (
          <motion.div
            key={row.miner}
            initial={reduced ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
            className={styles.drawerBody}
          >
            <div className={styles.toolbar}>
              <p className="eyebrow">Miner evidence</p>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="quiet-button"
                onClick={() => dialog.current?.close()}
              >
                Close details
              </motion.button>
            </div>
            <h2 id="miner-heading" className={styles.address}>
              {row.miner}
            </h2>
            <div className={styles.detailScore}>
              <strong>{row.score === null ? "No score" : number(row.score)}</strong>
              <span>
                settlement score / 100
                <br />
                <span className="muted">
                  {row.confidenceLabel} confidence · {percent(row.confidence)}
                </span>
              </span>
            </div>
            <h3>Where the score comes from</h3>
            <p className="muted">
              100 × confidence × (0.70 × cooperative share + 0.30 × recency). Policy weights, not measured
              probabilities.
            </p>
            {row.terms.map((term) => (
              <div className={styles.term} key={term.name}>
                <div>
                  <span>{term.name}</span>
                  <strong className="mono">
                    {row.score === null ? "No data" : `${number(term.contribution)} points`}
                  </strong>
                </div>
                <Bar
                  value={term.contribution / 100}
                  label={`${term.name}: ${number(term.contribution)} points out of 100`}
                />
                <small className="muted">
                  Weight {percent(term.weight)} · observed term {number(term.value)}
                </small>
              </div>
            ))}
            <dl className={styles.facts}>
              <div>
                <dt>Included settlements</dt>
                <dd>{row.settlements}</dd>
              </div>
              <div>
                <dt>Distinct agents</dt>
                <dd>{row.distinctAgents}</dd>
              </div>
              <div>
                <dt>Noncooperative share</dt>
                <dd>{row.noncooperativeShare === null ? "No data" : percent(row.noncooperativeShare)}</dd>
              </div>
              <div>
                <dt>Unused escrow / total escrow</dt>
                <dd>{row.unusedEscrowRatio === null ? "No data" : percent(row.unusedEscrowRatio)}</dd>
              </div>
            </dl>
            <h3>Stored price history</h3>
            <History history={history} miner={row.miner} />
            <h3>Gateway listings</h3>
            {!row.priceSources.length && <p>No observed listing.</p>}
            {row.priceSources.map((price) => (
              <div className={styles.listing} key={price.model}>
                <strong>{price.model}</strong>
                <span className="warning">{price.source}</span>
                <span>
                  {now >= Date.parse(price.expiresAt)
                    ? "Expired"
                    : now < Date.parse(price.effectiveAt)
                      ? "Not yet effective"
                      : "Unexpired"}{" "}
                  · expires <time>{price.expiresAt}</time>
                </span>
                <span>No live per-GFLOP quote.</span>
              </div>
            ))}
            <h3>Limits and provenance</h3>
            <ul>
              {row.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            {row.provenance.map((source) => (
              <p key={source.source} className={styles.provenance}>
                <a href={source.source}>{source.source}</a>
                <br />
                <time>{source.measuredAt}</time>
              </p>
            ))}
            <a href={modelDoc}>Full formula and gaming risks ↗</a>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

function Router({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const models = [
    ...new Set(rankSnapshot(snapshot, { now }).flatMap((row) => row.priceSources.map((price) => price.model))),
  ];
  const [policy, setPolicy] = useState<RouteOptions>();
  const [error, setError] = useState("");
  const reduced = useReducedMotion();
  const result = policy ? pickMiner(snapshot, { ...policy, now }) : undefined;
  return (
    <section className="section" aria-labelledby="router-heading" id="route-me">
      <div className="section-heading">
        <div>
          <p className="eyebrow">03 / Decide with limits</p>
          <h2 id="router-heading">Route me.</h2>
        </div>
        <p className="muted">
          Discovery only. A price ceiling fails closed when no live per-GFLOP quote exists. Evaluation uses the current
          time.
        </p>
      </div>
      <div className={styles.routeGrid}>
        <form
          className={styles.routeForm}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ceiling = String(data.get("ceiling") ?? "").trim();
            const next: RouteOptions = {
              model: String(data.get("model") ?? ""),
              minConfidence: Number(data.get("confidence")),
              exclude: String(data.get("exclude") ?? "")
                .split(/[\s,]+/)
                .filter(Boolean),
              ...(ceiling ? { maxPricePerGflop: ceiling } : {}),
            };
            try {
              pickMiner(snapshot, { ...next, now: Date.now() });
              setPolicy(next);
              setError("");
            } catch {
              setPolicy(undefined);
              setError("Use an observed model, confidence from 0 to 1 and a nonnegative decimal ceiling.");
            }
          }}
        >
          <label>
            Model
            <select name="model" required defaultValue={models[0] ?? ""}>
              {!models.length && <option value="">No observed models</option>}
              {models.map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum confidence
            <input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="0.2" required />
          </label>
          <label>
            Maximum FLOP per GFLOP
            <input
              name="ceiling"
              inputMode="decimal"
              placeholder="Optional price ceiling"
              pattern="[0-9]{1,80}(\.[0-9]{1,80})?"
            />
          </label>
          <label>
            Exclude addresses
            <textarea name="exclude" rows={2} placeholder="One address per line" />
          </label>
          <motion.button
            className="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={!models.length}
          >
            Evaluate policy <span aria-hidden="true">↗</span>
          </motion.button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
        <div className={styles.routeOutput} aria-live="polite">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key={JSON.stringify(policy)}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <p className="eyebrow">Policy result</p>
                <h3>{result.status === "picked" ? "Discovery candidate" : "No eligible miner"}</h3>
                {result.status === "picked" && (
                  <>
                    <p className={`${styles.address} mono`}>{result.miner}</p>
                    <p>
                      Score {number(result.explanation.score)} · confidence {percent(result.explanation.confidence)}
                    </p>
                    <p className="warning">{result.explanation.priceSource} · no price guarantee</p>
                  </>
                )}
                <ul>
                  {(result.status === "picked" ? result.explanation.reasons : result.reasons).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <p className="muted">
                  Evaluated at <time>{new Date(now).toISOString()}</time>. Results update as listings expire.
                </p>
                <h3 className={styles.candidateHeading}>Every candidate</h3>
                <ul className={styles.candidates}>
                  {result.candidates.map((candidate) => (
                    <li key={candidate.miner}>
                      <span className="mono" title={candidate.miner}>
                        {short(candidate.miner)}
                      </span>
                      <span>
                        {candidate.reasons.length
                          ? candidate.reasons.join(", ")
                          : "Eligible under this discovery policy"}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={false}>
                <p className="eyebrow">A reason for every decision</p>
                <h3>
                  Set your policy.
                  <br />
                  See who qualifies.
                </h3>
                <p className="muted">
                  The router checks listing expiry, settlement evidence, confidence and exclusions. Historical prices
                  never satisfy a live spending limit.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

export function Scoreboard({
  initial,
  history: recorded,
  evaluatedAt,
}: {
  initial: SnapshotResponse;
  history: HistoryPoint[];
  evaluatedAt: number;
}) {
  const [data, setData] = useState(initial);
  const [history, setHistory] = useState(() => addHistory(recorded, initial.snapshot));
  const [now, setNow] = useState(evaluatedAt);
  const [selected, setSelected] = useState<string>();
  const [sort, setSort] = useState("score");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [copy, setCopy] = useState("Copy command");
  const reduced = useReducedMotion();
  const pipeline = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: pipeline, offset: ["start end", "end center"] });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    let nextRead = 0;
    const refresh = async () => {
      if (document.hidden || busy || Date.now() < nextRead) return;
      busy = true;
      nextRead = Date.now() + 60_000;
      try {
        const response = await fetch("/scoreboard/snapshot", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!response.ok) throw new Error("Snapshot unavailable");
        const next = parseResponse(await response.json());
        if (!controller.signal.aborted) {
          setData(next);
          setHistory((current) => addHistory(current, next.snapshot));
          setNotice("");
        }
      } catch {
        if (!controller.signal.aborted) setNotice("Refresh unavailable. Showing the last received observation.");
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
      void refresh();
    }, 1000);
    const visible = () => {
      if (!document.hidden) {
        setNow(Date.now());
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    setNow(Date.now());
    void refresh();
    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const rows = useMemo(() => rankSnapshot(data.snapshot, { now }), [data.snapshot, now]);
  const visible = rows
    .filter((row) => row.miner.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "settlements"
        ? b.settlements - a.settlements || (a.miner < b.miner ? -1 : a.miner > b.miner ? 1 : 0)
        : sort === "address"
          ? a.miner < b.miner
            ? -1
            : a.miner > b.miner
              ? 1
              : 0
          : 0,
    );
  const page = parsePage(data.snapshot.records.find((record) => record.kind === "settlements")!.raw);
  const totalIncluded = rows.reduce((sum, row) => sum + row.settlements, 0);
  const lastKnown =
    data.status === "last-known" || Boolean(notice) || now - Date.parse(data.snapshot.measuredAt) > 120_000;
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: reduced ? 0 : 0.25 }}>
      <motion.div
        className={styles.root}
        initial={reduced ? false : { y: 8 }}
        animate={{ y: 0 }}
        transition={{ duration: reduced ? 0 : 0.3 }}
      >
        <motion.a className={styles.back} href="/#tools" whileHover={{ x: -3 }} whileTap={{ scale: 0.98 }}>
          ← All tools
        </motion.a>
        <header className={styles.hero}>
          <div>
            <p className="eyebrow">Scoreboard / FLOP devnet / alpha</p>
            <h1>
              Evidence first.
              <br />
              <span>Then a miner.</span>
            </h1>
            <Reveal delay={0.05}>
              <p className={styles.intro}>
                Compare miners by the settlements we can see. Open a score. Read its limits. Route with an explanation.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.12}>
            <div className={styles.heroEvidence}>
              <p className="eyebrow">Observed settlement sample</p>
              <div className={styles.bigNumber}>
                <motion.strong key={page.data.length} initial={reduced ? false : { y: 8 }} animate={{ y: 0 }}>
                  {page.data.length}
                </motion.strong>
                <span>
                  of {page.total}
                  <br />
                  reported rows
                </span>
              </div>
              <Bar
                value={page.total ? page.data.length / page.total : 0}
                label={`${page.data.length} of ${page.total} reported rows`}
              />
              <p className="muted">
                {rows.length} observed miners · {totalIncluded} usable settlements in the seven-day window.
              </p>
              <p className="warning">A history score. Not uptime or latency.</p>
            </div>
          </Reveal>
        </header>
        <div className={styles.observation} role="status">
          <span className={`badge ${lastKnown ? "warning" : "success"}`}>{lastKnown ? "Last known" : "Observed"}</span>
          <span>
            Measured <time className="mono">{data.snapshot.measuredAt}</time>
          </span>
          <span className="mono">{age(data.snapshot.measuredAt, now)}</span>
        </div>
        {notice && <p className={styles.notice}>{notice}</p>}
        <section ref={pipeline} className={`section ${styles.pipeline}`} aria-labelledby="method-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / Read the evidence</p>
              <h2 id="method-heading">A score you can take apart.</h2>
            </div>
            <a href={modelDoc}>Read the formula ↗</a>
          </div>
          <div className={styles.readingTrack} aria-hidden="true">
            <motion.div style={{ scaleX: reduced ? 1 : progress }} />
          </div>
          <div className={styles.steps}>
            {[
              [
                "Observe",
                "Dated gateway listings and a bounded settlement page. Nominal listings earn no score points.",
              ],
              [
                "Filter",
                "Exclude self-trades and nonconserving escrow. Keep usable settlements from the last seven days.",
              ],
              [
                "Explain",
                "Weight cooperation and recency by evidence confidence. A partial tape caps confidence at 0.5.",
              ],
            ].map(([title, text], index) => (
              <Reveal key={title} delay={index * 0.07}>
                <div className={styles.step}>
                  <span className="mono">0{index + 1}</span>
                  <h3>{title}</h3>
                  <p className="muted">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="section" aria-labelledby="ranking-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / Compare the sample</p>
              <h2 id="ranking-heading">Miner rankings.</h2>
            </div>
            <p className="muted">
              Scores span models. Confidence describes evidence sufficiency. Open a miner for every formula term and
              stored price observation.
            </p>
          </div>
          <div className={styles.toolbar}>
            <label className={styles.search}>
              Find an address
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="Filter miners"
              />
            </label>
            <label>
              Order by
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="score">Settlement score</option>
                <option value="settlements">Settlement count</option>
                <option value="address">Miner address</option>
              </select>
            </label>
          </div>
          {!totalIncluded && (
            <p className={styles.empty} role="status">
              No usable settlements in the seven-day window. Observed listings have no score. This is not evidence of
              miner failure.
            </p>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.caption}>
                {page.data.length} of {page.total} reported settlements sampled. {visible.length} of {rows.length}{" "}
                observed miners shown.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank / miner</th>
                  <th scope="col">Score / 100</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Settlements</th>
                  <th scope="col">Listing</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {visible.map((row) => (
                    <motion.tr
                      key={row.miner}
                      layout={!reduced}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.35 }}
                    >
                      <td>
                        <motion.button
                          className={styles.minerButton}
                        title={`Inspect miner ${row.miner}`}
                          data-miner={row.miner}
                          aria-haspopup="dialog"
                          onClick={() => setSelected(row.miner)}
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <span className={styles.rank}>{rows.indexOf(row) + 1}</span>
                          <span className="mono">{short(row.miner)}</span>
                          <span aria-hidden="true">↗</span>
                        </motion.button>
                      </td>
                      <td>
                        <div className={styles.scoreCell}>
                          <strong className="mono">{row.score === null ? "No data" : number(row.score)}</strong>
                          <Bar
                            value={(row.score ?? 0) / 100}
                            label={row.score === null ? "No score" : `Score ${number(row.score)} out of 100`}
                          />
                        </div>
                      </td>
                      <td>
                        <span className="mono">{percent(row.confidence)}</span>
                        <span className={styles.confidenceLabel}>{row.confidenceLabel}</span>
                      </td>
                      <td className="mono">{row.settlements}</td>
                      <td className={styles.listingCell}>
                        {!row.priceSources.length
                          ? "Not listed"
                          : row.priceSources.every((price) => now >= Date.parse(price.expiresAt))
                            ? "Expired"
                            : "Listed"}
                        {row.priceSources.some((price) => price.source === "devnet-nominal") && (
                          <small className="warning">devnet-nominal</small>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className={styles.empty} role="status">
              {rows.length ? "No addresses match this filter." : "No observed miners. No ranking is available."}
            </p>
          )}
          <p className={styles.tableNote}>
            Rank numbers always refer to settlement score order. Select another order to compare the same evidence.
          </p>
        </section>
        <Router snapshot={data.snapshot} now={now} />
        <section className="section" aria-labelledby="source-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">04 / Reproduce the observation</p>
              <h2 id="source-heading">Keep the raw evidence.</h2>
            </div>
            <motion.a
              className="quiet-button"
              href="/scoreboard/snapshot"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              Open snapshot JSON ↗
            </motion.a>
          </div>
          <div className={styles.command}>
            <code>{command}</code>
            <motion.button
              className="quiet-button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(command);
                  setCopy("Copied");
                } catch {
                  setCopy("Select command to copy");
                }
              }}
              aria-live="polite"
            >
              {copy}
            </motion.button>
          </div>
          <p className={styles.tableNote}>
            Run from a checkout after <code>pnpm install</code>. This command reads a committed recording. It scores at
            the current time.
          </p>
          <ul className={styles.sources}>
            {data.snapshot.records.map((record) => (
              <li key={record.kind}>
                <a href={record.source}>{record.kind} ↗</a>
                <time className="mono">{record.measuredAt}</time>
              </li>
            ))}
          </ul>
          <p className="muted">
            This snapshot used {data.snapshot.collection.requests} public requests in{" "}
            {data.snapshot.collection.durationMs} ms. That is collection time, not inference latency. The server
            revalidates every 60 seconds. Failed refreshes retain the last good snapshot and back off. Browser polling
            pauses in hidden tabs.
          </p>
          <p className="muted">
            This tool does not verify uptime, inference quality, proof validity, finality or miner endpoint
            reachability. Cooperation and recency can be gamed. <a href={modelDoc}>Read the model limits.</a>
          </p>
        </section>
        <MinerDetails
          row={rows.find((row) => row.miner === selected)}
          history={history}
          now={now}
          onClose={() => setSelected(undefined)}
        />
      </motion.div>
    </MotionConfig>
  );
}
