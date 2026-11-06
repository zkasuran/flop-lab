// SPDX-License-Identifier: Apache-2.0
"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import {
  citedConcepts,
  conceptCommand,
  graph,
  searchCatalog,
  sourceLink,
  type Edge,
} from "../../../../packages/knowledge/src/catalog";
import type { Concept, Manifest, Requirement } from "../../../../packages/knowledge/src/schema";
import type { Observation } from "../../../../packages/knowledge/src/client";
import styles from "./view.module.css";

type Source = { kind: string; source: string; measuredAt: string; raw: string };
const display = (text: string) => text.replace(/[\u2013\u2014]/g, "-");
const rawDisplay = (text: string) => text.replace(/\u2013/g, "\\u2013").replace(/\u2014/g, "\\u2014");
function parseSource(value: unknown): Source {
  if (!value || typeof value !== "object") throw new Error("Source response is unavailable");
  const v = value as Record<string, unknown>;
  if (
    typeof v.kind !== "string" ||
    v.source !== "https://mcp.flop.network/mcp" ||
    typeof v.measuredAt !== "string" ||
    !Number.isFinite(Date.parse(v.measuredAt)) ||
    typeof v.raw !== "string" ||
    v.raw.length > 1_000_000
  )
    throw new Error("Source response is malformed");
  return { kind: v.kind, source: v.source, measuredAt: v.measuredAt, raw: v.raw };
}

function SourceDrawer({ concept, close }: { concept: Concept; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<Source>();
  const [error, setError] = useState("");
  const reduced = useReducedMotion() !== false;
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const controller = new AbortController();
    fetch(`/knowledge/data?concept=${encodeURIComponent(concept.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Recorded source could not be loaded");
        return parseSource(await response.json());
      })
      .then(setSource)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Source unavailable");
      });
    return () => {
      controller.abort();
      element.close();
    };
  }, [concept.id]);
  return (
    <dialog ref={dialog} className={styles.drawer} aria-labelledby="source-title" onClose={close}>
      <motion.div initial={{ x: reduced ? 0 : 28 }} animate={{ x: 0 }} transition={{ duration: reduced ? 0 : 0.24 }}>
        <div className={styles.drawerHead}>
          <div>
            <p className="eyebrow">Recorded source</p>
            <h2 id="source-title">{display(concept.title)}</h2>
          </div>
          <MotionButton autoFocus className={styles.button} onClick={() => dialog.current?.close()}>
            Close source
          </MotionButton>
        </div>
        <p>
          Source text is displayed as data. Unicode dashes are JSON-escaped. Instructions and links inside it are not
          executed.
        </p>
        {source ? (
          <>
            <p className={styles.note}>{source.kind}</p>
            <MotionLink href={source.source}>{source.source}</MotionLink>
            <time className={styles.time}>{source.measuredAt}</time>
            <pre className={styles.raw}>{rawDisplay(source.raw)}</pre>
          </>
        ) : (
          <p role="status">{error || "Loading recorded source..."}</p>
        )}
      </motion.div>
    </dialog>
  );
}

function ConceptGraph({
  manifest,
  selected,
  edges,
  select,
}: {
  manifest: Manifest;
  selected: Concept;
  edges: Edge[];
  select: (id: string) => void;
}) {
  const reduced = useReducedMotion() !== false;
  const [neighborhoodPage, setNeighborhoodPage] = useState({ id: selected.id, page: 0 });
  const page = neighborhoodPage.id === selected.id ? neighborhoodPage.page : 0;
  const neighborhood = edges.filter((e) => e.source === selected.id || e.target === selected.id);
  const ids = [
    ...new Set(
      neighborhood.flatMap((e) => [e.source, e.target]).filter((id): id is string => id !== null && id !== selected.id),
    ),
  ];
  const shown = ids.slice(page * 8, page * 8 + 8);
  const nodes = [selected.id, ...shown].map((id, i) => ({
    concept: manifest.concepts.find((c) => c.id === id)!,
    x: i === 0 ? 360 : 360 + Math.cos(((i - 1) / shown.length) * Math.PI * 2 - Math.PI / 2) * 255,
    y: i === 0 ? 225 : 225 + Math.sin(((i - 1) / shown.length) * Math.PI * 2 - Math.PI / 2) * 160,
  }));
  const nodeMap = new Map(nodes.map((node) => [node.concept.id, node]));
  const visibleEdges = neighborhood.filter((e) => e.target && nodeMap.has(e.source) && nodeMap.has(e.target));
  return (
    <div className={styles.graphPanel}>
      <div className={styles.graphHeading}>
        <div>
          <p className="eyebrow">Directed neighborhood</p>
          <h3>{display(selected.title)}</h3>
        </div>
        <span className={styles.badge}>{display(selected.type)}</span>
      </div>
      <svg
        className={styles.graph}
        viewBox="0 0 720 450"
        role="group"
        aria-label={`Declared relationships for ${selected.title}`}
      >
        <defs>
          <marker
            id="knowledge-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {visibleEdges.map((edge) => {
          const a = nodeMap.get(edge.source)!;
          const b = nodeMap.get(edge.target!)!;
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          return (
            <motion.line
              key={`${edge.source}:${edge.target}:${edge.relation}`}
              x1={a.x + ((b.x - a.x) * 33) / length}
              y1={a.y + ((b.y - a.y) * 33) / length}
              x2={b.x - ((b.x - a.x) * 35) / length}
              y2={b.y - ((b.y - a.y) * 35) / length}
              stroke="currentColor"
              strokeWidth="1.2"
              markerEnd="url(#knowledge-arrow)"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduced ? 0 : 0.35 }}
            >
              <title>{`${edge.source} ${edge.relation} ${edge.target}`}</title>
            </motion.line>
          );
        })}
        <AnimatePresence initial={false}>
          {nodes.map(({ concept, x, y }) => (
            <motion.g
              key={concept.id}
              data-graph-node={concept.id}
              role="button"
              tabIndex={0}
              aria-label={`Select ${concept.title}`}
              aria-pressed={concept.id === selected.id}
              initial={{ opacity: reduced ? 1 : 0, x, y }}
              animate={{ opacity: 1, x, y }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.28 }}
              whileHover={{ scale: reduced ? 1 : 1.04 }}
              whileTap={{ scale: reduced ? 1 : 0.97 }}
              onClick={() => select(concept.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(concept.id);
                }
              }}
              className={concept.id === selected.id ? styles.centerNode : styles.node}
            >
              <circle r="29" />
              <text y="5" textAnchor="middle" className={styles.nodeGlyph}>
                {concept.id === selected.id ? "◎" : "↗"}
              </text>
              <text y="49" textAnchor="middle" className={styles.nodeLabel}>
                {concept.title.length > 27 ? `${concept.title.slice(0, 24)}...` : concept.title}
              </text>
              <title>{concept.title}</title>
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>
      <div className={styles.graphFooter}>
        <p>
          {shown.length} of {ids.length} linked concepts shown. Arrows follow declared direction. Spacing has no
          semantic weight.
        </p>
        {ids.length > 8 && (
          <MotionButton
            className={styles.button}
            onClick={() => setNeighborhoodPage({ id: selected.id, page: (page + 1) * 8 >= ids.length ? 0 : page + 1 })}
          >
            Next neighbors
          </MotionButton>
        )}
      </div>
      <div className={styles.relationships}>
        {neighborhood.length === 0 ? (
          <p>No relationships declared.</p>
        ) : (
          <Disclosure title={`Inspect ${neighborhood.length} relationship declarations`}>
            <ul>
              {neighborhood.map((e) => (
                <li key={`${e.source}:${e.reference}:${e.relation}`}>
                  <code>{e.source}</code>
                  <span>{e.relation} →</span>
                  {e.target ? (
                    <MotionButton onClick={() => select(e.target!)}>{e.target}</MotionButton>
                  ) : (
                    <span>
                      {e.reference} <strong>(unresolved)</strong>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </div>
    </div>
  );
}

export function KnowledgeView({
  manifest,
  measuredAt,
  source,
  requirement,
  pack,
}: {
  manifest: Manifest;
  measuredAt: string;
  source: string;
  requirement: Observation<Requirement>;
  pack: Observation<unknown>[];
}) {
  const reduced = useReducedMotion() !== false;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(manifest.concepts[0]?.id ?? "");
  const [drawer, setDrawer] = useState<Concept>();
  const [key, setKey] = useState("R9.5");
  const [activeKey, setActiveKey] = useState("R9.5");
  const edges = useMemo(() => graph(manifest), [manifest]);
  const matches = searchCatalog(manifest, query, type);
  const selected = manifest.concepts.find((c) => c.id === selectedId);
  const types = [...new Set(manifest.concepts.map((c) => c.type))].sort();
  const resolved = edges.filter((edge) => edge.target !== null).length;
  const req = activeKey === requirement.value?.key ? requirement.value : undefined;
  function select(id: string) {
    setSelectedId(id);
  }
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <ToolHeader slug="knowledge" />
        <ReadingReveal order={3}>
          <p className={styles.intro}>
            Follow a concept to its declared sources. Read what the catalog claims, then inspect the source limits.
          </p>
        </ReadingReveal>
        <ReadingReveal order={4}>
          <div className={styles.provenance}>
            <span className={styles.badge}>Recorded observation</span>
            <time>{measuredAt}</time>
            <MotionLink href={source}>Public MCP source ↗</MotionLink>
            <MotionLink href="/knowledge/data" download>
              Download recording ↓
            </MotionLink>
          </div>
        </ReadingReveal>
      </section>
      <ReadingReveal>
        <div className={styles.metrics}>
          <div>
            <span>Received concepts</span>
            <strong>
              <ObservedNumber value={manifest.concepts.length} />
            </strong>
          </div>
          <div>
            <span>Resolved declared edges</span>
            <strong>
              <ObservedNumber value={resolved} />
            </strong>
          </div>
          <div>
            <span>Unresolved references</span>
            <strong>
              <ObservedNumber value={edges.length - resolved} />
            </strong>
          </div>
        </div>
      </ReadingReveal>
      <div className={styles.warning}>
        <strong>Catalog confidence is a claim.</strong>
        {manifest.warnings.map((warning) => (
          <p key={warning}>{display(warning)}</p>
        ))}
        <p>
          Lifecycle and confidence below are the service&apos;s labels. This page does not verify source hashes or
          deployed behavior.
        </p>
      </div>
      <section className={styles.catalog} aria-labelledby="catalog-title">
        <ReadingReveal>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">Explore the catalog</p>
              <h2 id="catalog-title">Start with a concept.</h2>
            </div>
            <p>Search the full manifest. Select a node to move through its declared relationships.</p>
          </div>
        </ReadingReveal>
        <div className={styles.controls}>
          <motion.label whileFocus={{ scale: 1 }} className={styles.searchLabel}>
            Search concepts
            <motion.input
              aria-label="Search concepts"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Title, tag or source path"
              whileFocus={{ borderColor: "var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
          </motion.label>
          <label>
            Concept type
            <motion.select
              aria-label="Concept type"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(0);
              }}
              whileFocus={{ borderColor: "var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </motion.select>
          </label>
          <MotionButton
            className={styles.button}
            onClick={() => {
              setQuery("");
              setType("");
              setPage(0);
            }}
          >
            Clear filters
          </MotionButton>
        </div>
        <div className={styles.resultCount} role="status">
          <ObservedNumber value={matches.length} /> matching concepts
          <div className={styles.track} aria-hidden="true">
            <motion.div
              data-match-bar
              initial={false}
              animate={{ scaleX: manifest.concepts.length ? matches.length / manifest.concepts.length : 0 }}
              transition={{ duration: reduced ? 0 : 0.3 }}
            />
          </div>
        </div>
        <div className={styles.workspace}>
          <div className={styles.listPanel}>
            <div className={styles.list} aria-label="Matching concepts">
              <AnimatePresence initial={false} mode="popLayout">
                {matches.slice(page * 12, page * 12 + 12).map((c) => (
                  <motion.button
                    key={c.id}
                    data-concept={c.id}
                    className={styles.conceptButton}
                    layout={reduced ? false : "position"}
                    aria-pressed={selectedId === c.id}
                    initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                    whileHover={{ x: reduced ? 0 : 3 }}
                    whileTap={{ scale: reduced ? 1 : 0.99 }}
                    onClick={() => select(c.id)}
                  >
                    <span>{display(c.title)}</span>
                    <small>{display(c.type)}</small>
                  </motion.button>
                ))}
              </AnimatePresence>
              {matches.length === 0 && (
                <p className={styles.empty}>No matching concepts. The selected neighborhood stays available.</p>
              )}
            </div>
            <div className={styles.pagination}>
              <MotionButton disabled={page === 0} className={styles.button} onClick={() => setPage(page - 1)}>
                Previous
              </MotionButton>
              <span>
                {matches.length ? page + 1 : 0} / {Math.ceil(matches.length / 12)}
              </span>
              <MotionButton
                disabled={(page + 1) * 12 >= matches.length}
                className={styles.button}
                onClick={() => setPage(page + 1)}
              >
                Next
              </MotionButton>
            </div>
          </div>
          {selected ? (
            <div>
              <ConceptGraph manifest={manifest} selected={selected} edges={edges} select={select} />
              <motion.article
                className={styles.detail}
                layout={reduced ? false : "position"}
                transition={{ duration: reduced ? 0 : 0.24 }}
              >
                <div className={styles.detailTitle}>
                  <h3>{display(selected.title)}</h3>
                  <MotionButton className={styles.button} onClick={() => setDrawer(selected)}>
                    Inspect source
                  </MotionButton>
                </div>
                <p>{display(selected.description ?? "No description supplied.")}</p>
                <dl className={styles.labels}>
                  <div>
                    <dt>Claimed confidence</dt>
                    <dd>{display(selected.confidence ?? "Not supplied")}</dd>
                  </div>
                  <div>
                    <dt>Lifecycle label</dt>
                    <dd>{display(selected.lifecycle ?? "Not supplied")}</dd>
                  </div>
                </dl>
                <p className={styles.id}>
                  <code>{selected.path}</code>
                </p>
                {sourceLink(selected.resource) && (
                  <MotionLink href={sourceLink(selected.resource)!}>Declared resource ↗</MotionLink>
                )}
                <Disclosure title={`Inspect ${selected.source_paths.length} declared source paths`}>
                  <ul>
                    {selected.source_paths.map((path) => (
                      <li key={path}>
                        <code>{path}</code>
                      </li>
                    ))}
                  </ul>
                  <p>
                    Source hashes: {selected.source_hashes.length ? selected.source_hashes.join(", ") : "not supplied"}
                  </p>
                </Disclosure>
                <div className={styles.command}>
                  <code>{conceptCommand(selected.id)}</code>
                  <CopyButton text={conceptCommand(selected.id)} label="Copy concept command" />
                </div>
              </motion.article>
            </div>
          ) : (
            <p>No concepts in the recording.</p>
          )}
        </div>
      </section>
      <ReadingPath
        title="From catalog label to source limit"
        steps={[
          {
            title: "Read the declaration",
            text: "Concepts provide a title, lifecycle and confidence label. Those labels come from the catalog.",
          },
          {
            title: "Follow a typed arrow",
            text: "Edges retain the service's relationship name and direction. Unresolved references stay visible rather than becoming invented nodes.",
          },
          {
            title: "Inspect the source",
            text: "Open the raw response. Missing provenance, line ranges and hashes remain missing. Reading progress is not verification progress.",
          },
        ]}
      />
      <section className={styles.requirement} aria-labelledby="requirement-title">
        <ReadingReveal>
          <p className="eyebrow">Requirement explainer</p>
          <h2 id="requirement-title">Keep the citation attached.</h2>
          <p>The bundled example is R9.5. Other keys require the live CLI.</p>
        </ReadingReveal>
        <form
          className={styles.controls}
          onSubmit={(event) => {
            event.preventDefault();
            setActiveKey(key.trim());
          }}
        >
          <label>
            Requirement key
            <motion.input
              aria-label="Requirement key"
              value={key}
              maxLength={256}
              onChange={(event) => setKey(event.target.value)}
              whileFocus={{ borderColor: "var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
          </label>
          <MotionButton className={styles.button} type="submit">
            Explain recorded key
          </MotionButton>
        </form>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {req ? (
              <>
                <h3>
                  {req.key}: {display(req.title ?? "Untitled requirement")}
                </h3>
                <dl className={styles.statuses}>
                  <div>
                    <dt>Spec claim</dt>
                    <dd>{display(req.specStatus)}</dd>
                  </div>
                  <div>
                    <dt>Implementation claim</dt>
                    <dd>{display(req.implementationStatus)}</dd>
                  </div>
                  <div>
                    <dt>Evidence claim</dt>
                    <dd>{display(req.evidenceStatus)}</dd>
                  </div>
                </dl>
                <time className={styles.time}>{requirement.measuredAt}</time>
                <pre className={styles.quote}>{display(req.text)}</pre>
                <h3>Cited source paths</h3>
                <ul>
                  {req.citations.map((c) => (
                    <li key={`${c.repo}:${c.path}:${c.anchor}`}>
                      <code>
                        {c.repo}/{c.path}#{c.anchor}
                      </code>
                      <p>
                        Line range: {c.lines ?? "not supplied"}. Hash: {c.sha256 ?? "not supplied"}.
                      </p>
                    </li>
                  ))}
                </ul>
                <h3>Concepts sharing an exact cited source path</h3>
                <p>These links match paths. They do not establish implementation or independent corroboration.</p>
                <div className={styles.related}>
                  {citedConcepts(manifest, req).map((c) => (
                    <MotionButton className={styles.button} key={c.id} onClick={() => setDrawer(c)}>
                      {display(c.title)}
                    </MotionButton>
                  ))}
                </div>
                <Disclosure title="Inspect raw requirement response">
                  <pre className={styles.raw}>{rawDisplay(requirement.raw)}</pre>
                </Disclosure>
              </>
            ) : (
              <p role="status">
                No recording for {activeKey || "an empty key"}. Run{" "}
                <code>flop knowledge explain &lt;key&gt; --live --json</code>.
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
      <section className={styles.pack} aria-labelledby="pack-title">
        <ReadingReveal>
          <p className="eyebrow">Agent context pack</p>
          <h2 id="pack-title">Discovery is not installation.</h2>
          <p>
            The catalog describes a pack. The recorded pack endpoints report a missing pack. Both answers are retained.
          </p>
        </ReadingReveal>
        <div className={styles.packGrid}>
          {pack.map((o, i) => (
            <ReadingReveal key={o.tool} order={i}>
              <article className={styles.packCard}>
                <span className={styles.badge}>
                  {o.status === "unavailable" ? "Unavailable at read" : "Negative discovery probe"}
                </span>
                <h3>{["Pack manifest", "Skill text", "Install guidance", "Agent card"][i]}</h3>
                <code>{o.tool}</code>
                <p>{display(o.raw || o.error || "No response text")}</p>
                <time className={styles.time}>{o.measuredAt}</time>
                <Disclosure title="Inspect call arguments">
                  <pre className={styles.raw}>{JSON.stringify(o.args, null, 2)}</pre>
                </Disclosure>
              </article>
            </ReadingReveal>
          ))}
        </div>
        <p className={styles.note}>
          The all-zero card ID is a negative probe, not an observed registered agent. No conclusion about other agent
          IDs follows from it. Returned commands and URLs are never executed.
        </p>
      </section>
      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          No runtime state, deployed code, agent identity, source hash, inference result or chain finality is verified.
          Status text is quoted from the service. Missing source provenance remains a limit on every catalog claim.
        </p>
      </section>
      {drawer && <SourceDrawer key={drawer.id} concept={drawer} close={() => setDrawer(undefined)} />}
    </div>
  );
}
