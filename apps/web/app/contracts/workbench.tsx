// SPDX-License-Identifier: Apache-2.0
"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useId, useRef, useState } from "react";
import { MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import {
  counts,
  filterTools,
  labels,
  statuses,
  utc,
  type AuditReport,
  type Observation,
  type Status,
  type ToolResult,
} from "./model";
import styles from "./workbench.module.css";

const command = "node packages/cli/dist/cli.js contracts run --json";
const revision = /^[a-f0-9]{40}$/.test(process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "")
  ? process.env.NEXT_PUBLIC_BUILD_COMMIT
  : "main";
const source = `https://github.com/zkasuran/flop-lab/blob/${revision}/packages/mcpaudit`;
const json = (value: unknown) => JSON.stringify(value, null, 2);

function Badge({ status }: { status: Status }) {
  return (
    <span className={styles.badge} data-status={status}>
      {status}
    </span>
  );
}

function ProbeEvidence({ observation }: { observation: Observation }) {
  const [all, setAll] = useState(false);
  const findings = all ? observation.findings : observation.findings.slice(0, 5);
  return (
    <section className={styles.probe}>
      <div className={styles.probeHeading}>
        <h3>{observation.probe.label} input</h3>
        <Badge status={observation.status} />
      </div>
      <p>{observation.reason}</p>
      <p className="muted">
        {observation.confirmed ? "Reproduced by a fresh request. " : ""}
        {observation.durationMs.toFixed(2)} ms of HTTP time · {observation.bytes.toLocaleString("en-US")} body bytes
      </p>
      {observation.measuredAt && (
        <time className={styles.timestamp} dateTime={observation.measuredAt}>
          {utc(observation.measuredAt)}
        </time>
      )}
      <p className={styles.rawLinks}>
        {observation.traceIds.map((id) => (
          <MotionLink key={id} href={`${source}/fixtures/audit-${id}.json`} target="_blank" rel="noreferrer">
            Raw response {id} ↗
          </MotionLink>
        ))}
      </p>
      <div className={styles.request}>
        <span className="eyebrow">Request / tools/call</span>
        <pre>{json({ name: observation.tool, arguments: observation.probe.args })}</pre>
      </div>
      {findings.length > 0 && (
        <ol className={styles.findings}>
          {findings.map((finding, index) => (
            <li key={`${finding.schemaPath}-${finding.instancePath}-${index}`}>
              <p>
                <strong>{finding.message}</strong>
              </p>
              <dl>
                <div>
                  <dt>Schema path</dt>
                  <dd>
                    <code>{finding.schemaPath}</code>
                  </dd>
                </div>
                <div>
                  <dt>Instance path</dt>
                  <dd>
                    <code>{finding.instancePath || "/"}</code>
                  </dd>
                </div>
                <div>
                  <dt>Offending value</dt>
                  <dd>
                    <pre>{json(finding.value)}</pre>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
      {observation.findings.length > 5 && (
        <MotionButton className={styles.control} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer findings" : `Show all ${observation.findings.length} findings`}
        </MotionButton>
      )}
    </section>
  );
}

function ToolRow({ tool }: { tool: ToolResult }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion() !== false;
  const requests = tool.observations.reduce((sum, observation) => sum + observation.traceIds.length, 0);
  return (
    <motion.article
      className={styles.row}
      data-tool={tool.name}
      data-status={tool.status}
      layout={!reduced}
      initial={false}
      exit={{ opacity: reduced ? 1 : 0 }}
      transition={{ duration: reduced ? 0 : 0.24 }}
    >
      <MotionButton
        className={styles.rowButton}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Inspect ${tool.name}`}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.toolName}>
          {tool.name}
          <small>
            {tool.outputSchema ? "Output schema declared" : "No output schema"} ·{" "}
            {requests ? `${requests} captured requests` : "Not called"}
          </small>
        </span>
        <Badge status={tool.status} />
        <motion.span
          className={styles.chevron}
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          ›
        </motion.span>
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            data-details
            className={styles.details}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.45 }}
          >
            <p className={styles.rowReason}>{tool.reason}</p>
            {tool.name === "flop_knowledge_get" && (
              <p>
                <MotionLink href="https://github.com/flop-labs/network/issues/87" target="_blank" rel="noreferrer">
                  Known contract violation: network #87 ↗
                </MotionLink>
              </p>
            )}
            {tool.observations.map((observation, index) => (
              <ProbeEvidence key={`${observation.probe.label}-${index}`} observation={observation} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function AuditPath({ report }: { report: AuditReport }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 90%", "end 30%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section className={styles.path} ref={ref} aria-labelledby="path-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className="eyebrow">01 / How the audit reads</p>
          <h2 id="path-title">From schema to repeat.</h2>
        </div>
        <p className="muted">
          {report.requests} HTTP attempts. {report.durationMs.toLocaleString("en-US")} ms elapsed. The line below tracks
          reading progress.
        </p>
      </div>
      <div className={styles.track} aria-hidden="true">
        <motion.div style={{ scaleX: reduced ? 1 : scaleX }} />
      </div>
      <ol className={styles.steps}>
        {[
          ["Read the contract", "Take input and output schemas from the same tools/list snapshot."],
          [
            "Probe gently",
            `Use small valid and invalid inputs. Space request starts by at least ${report.spacingMs} ms.`,
          ],
          ["Compare the reply", "Keep undeclared fields. Check JSON text against structured content."],
          [
            "Repeat a failure",
            `Send a fresh request within the ${report.maxRequests}-attempt ceiling. Retain both responses.`,
          ],
        ].map(([title, text], index) => (
          <li key={title}>
            <ReadingReveal order={index}>
              <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </ReadingReveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrustPanel({ report }: { report: AuditReport }) {
  const trust = report.trust;
  return (
    <section className={styles.trust} id="trust" aria-labelledby="trust-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className="eyebrow">03 / Trust material</p>
          <h2 id="trust-title">A schema is not an attestation.</h2>
        </div>
        <p className="muted">
          This is the published material. It has not been authenticated against a finalized chain state.
        </p>
      </div>
      <div className={styles.trustGrid}>
        <ReadingReveal>
          <div className={styles.panel}>
            <p className="eyebrow">flop_trust_root</p>
            <h3>What the snapshot contains</h3>
            <dl className={styles.rootFacts}>
              <div>
                <dt>Version</dt>
                <dd>{json(trust.version)}</dd>
              </div>
              <div>
                <dt>Snapshot hash</dt>
                <dd>
                  <code>{typeof trust.snapshotHash === "string" ? trust.snapshotHash : "Not returned"}</code>
                </dd>
              </div>
              <div>
                <dt>dstackVkeys</dt>
                <dd>
                  <pre>{json(trust.dstackVkeys)}</pre>
                </dd>
              </div>
            </dl>
            <ul>
              {trust.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <TrustDisclosure
              title="Models and TEE platform ids"
              value={{ models: trust.models, platforms: trust.platforms }}
            />
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <div className={styles.panel}>
            <p className="eyebrow">flop_get_tcb_status</p>
            <h3>Check the advisory's date</h3>
            {trust.advisoryComparison.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <MotionLink href="https://github.com/flop-labs/network/issues/36" target="_blank" rel="noreferrer">
              Existing TCB finding: network #36 ↗
            </MotionLink>
            <TrustDisclosure title="Recorded TCB response" value={trust.tcb} />
          </div>
        </ReadingReveal>
      </div>
      <div className={styles.sources}>
        <h3>Dated sources</h3>
        {trust.sources.map((item) => (
          <p key={item.url}>
            <MotionLink href={item.url} target="_blank" rel="noreferrer">
              {item.url}
            </MotionLink>
            <br />
            <span className="muted">{item.measuredAt ? utc(item.measuredAt) : "No measurement"}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function TrustDisclosure({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() !== false;
  const id = useId();
  return (
    <motion.div className={styles.trustDisclosure} layout={!reduced} transition={{ duration: reduced ? 0 : 0.24 }}>
      <MotionButton className={styles.control} aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}>
        {title} {open ? "−" : "+"}
      </MotionButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.pre
            id={id}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            {json(value)}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ContractsBoard({ report }: { report: AuditReport | null }) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [copy, setCopy] = useState("");
  const reduced = useReducedMotion() !== false;
  if (!report || !report.tools.length)
    return (
      <section className={styles.empty}>
        <p className="eyebrow">MCP contract audit</p>
        <h1>No audit data available.</h1>
        <p>The recording could not be validated. Run the CLI for a new observation.</p>
        <code>{command}</code>
        <MotionLink href="/">Back to tools</MotionLink>
      </section>
    );
  const totals = counts(report);
  const visible = filterTools(report.tools, filter, query);
  const reproduced = report.tools.filter((tool) => tool.observations.some((o) => o.confirmed)).length;
  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <ReadingReveal>
              <MotionLink className={styles.back} href="/#tools">
                ← All tools
              </MotionLink>
              <p className="eyebrow">Verify / MCP contract audit</p>
              <h1>Do the tools keep their contracts?</h1>
            </ReadingReveal>
            <ReadingReveal order={1}>
              <p className={styles.intro}>
                Inspect the reply against the schema it promised. Every result here comes from a recorded public
                request.
              </p>
              <div className={styles.heroLinks}>
                <MotionLink href="#board" className="button">
                  Inspect the tool board ↓
                </MotionLink>
                <MotionLink href="#trust">Inspect trust material ↓</MotionLink>
              </div>
            </ReadingReveal>
          </div>
          <ReadingReveal order={2}>
            <aside className={styles.verdict}>
              <p className="eyebrow">Recorded finding</p>
              <p className={styles.bigNumber}>
                <ObservedNumber value={reproduced} />
              </p>
              <h2>tool contracts failed again on repeat.</h2>
              <p className="muted">
                Missing schemas remain unverifiable. A passing input check cannot prove an output contract.
              </p>
              <div className={styles.stamp}>
                <span>Last recorded, not live</span>
                <time dateTime={report.measuredAt}>{utc(report.measuredAt)}</time>
                <MotionLink href={report.source} target="_blank" rel="noreferrer">
                  mcp.flop.network ↗
                </MotionLink>
              </div>
            </aside>
          </ReadingReveal>
        </header>
        <section className={styles.stats} aria-label="Recorded tool outcomes">
          {statuses.map((status, index) => (
            <div key={status} data-status={status} className={styles.stat}>
              <span className="eyebrow">{labels[status]}</span>
              <strong>
                <ObservedNumber value={totals[status]} />
              </strong>
              <div className={styles.statTrack} aria-hidden="true">
                <motion.div
                  style={{ scaleX: totals[status] / report.tools.length }}
                  initial={false}
                  whileInView={{
                    scaleX: reduced ? totals[status] / report.tools.length : [0, totals[status] / report.tools.length],
                  }}
                  viewport={{ once: true }}
                  transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : index * 0.04 }}
                />
              </div>
            </div>
          ))}
        </section>
        <div className={styles.command}>
          <div>
            <span className="eyebrow">Run a fresh audit after pnpm install and pnpm build</span>
            <code>{command}</code>
            <span className="muted">Read-only. Exit 1 means a contract violation. Exit 2 means incomplete checks.</span>
          </div>
          <MotionButton
            className={styles.control}
            aria-label="Copy audit command"
            onClick={() => {
              void navigator.clipboard.writeText(command).then(
                () => setCopy("Copied"),
                () => setCopy("Select the command to copy"),
              );
            }}
          >
            Copy command ↗
          </MotionButton>
          <span role="status" className={styles.copyStatus}>
            {copy}
          </span>
        </div>
        {report.discoveryError && <p role="alert">Discovery incomplete: {report.discoveryError}</p>}
        <AuditPath report={report} />
        <section id="board" className={styles.board} aria-labelledby="board-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">02 / Contract board</p>
              <h2 id="board-title">Open the evidence.</h2>
            </div>
            <p className="muted">
              {report.tools.length} advertised tools. Select a row for its inputs, schema paths, offending values and
              raw replies.
            </p>
          </div>
          <div className={styles.filters} role="group" aria-label="Filter outcomes">
            <MotionButton className={styles.control} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              All tools
            </MotionButton>
            {statuses.map((status) => (
              <MotionButton
                key={status}
                className={styles.control}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {labels[status]}
              </MotionButton>
            ))}
          </div>
          <label className={styles.search}>
            Search tools
            <motion.input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="flop_knowledge"
              whileFocus={{ borderColor: "var(--accent)" }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            />
          </label>
          <p className={styles.resultCount} role="status">
            {visible.length
              ? `${visible.length} of ${report.tools.length} tools shown`
              : "No tools match this filter and search."}
          </p>
          <motion.div className={styles.rows} layout={!reduced}>
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((tool) => (
                <ToolRow key={tool.name} tool={tool} />
              ))}
            </AnimatePresence>
          </motion.div>
          <p className={styles.boardNote}>
            The material-generation operation is listed but not called. A missing schema or resource is not labelled as
            a contract violation.
          </p>
        </section>
        <TrustPanel report={report} />
        <section className={styles.limits}>
          <h2>What this does not verify</h2>
          <p>
            A matching schema does not prove semantic truth, model quality, payment finality or a cryptographic
            attestation. This audit samples safe inputs. It does not cover every possible request. The devnet can reset.
          </p>
          <p>
            The quote verifier is simulated. Empty trust keys and inconsistent advisory dates cannot establish that an
            attestation is valid. The harness also needs public evidence before it can decide its UNVERIFIABLE claims.
          </p>
          <div className={styles.heroLinks}>
            <MotionLink href="/harness">See the harness evidence gaps ↗</MotionLink>
            <MotionLink href={`${source}/last-run.json`} target="_blank" rel="noreferrer">
              Full recorded report ↗
            </MotionLink>
            <MotionLink href={`${source}/README.md`} target="_blank" rel="noreferrer">
              Audit method and quick start ↗
            </MotionLink>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}
