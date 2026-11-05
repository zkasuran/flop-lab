// SPDX-License-Identifier: Apache-2.0
"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal } from "@/components/motion";
import type { Report, Role, Status } from "../../../../packages/doctor/src/types";
import styles from "./doctor.module.css";

const labels: Record<Status, string> = {
  READY: "Ready for this check",
  NOT_READY: "Below requirement",
  UNKNOWN: "Needs evidence",
};
const statuses: Status[] = ["READY", "NOT_READY", "UNKNOWN"];
const external = {
  miner:
    "curl --connect-timeout 5 --max-time 10 -sS -o /dev/null -w '%{http_code}\\n' 'https://REPLACE_WITH_PUBLIC_DNS/session/info'",
  validator:
    "nc -vz -w 5 REPLACE_WITH_PEER_HOST 30333\nnc -vz -w 5 REPLACE_WITH_PEER_HOST REPLACE_WITH_APPROVED_DA_PORT",
};

export function Doctor({ reports }: { reports: Record<Role, Report> }) {
  const [role, setRole] = useState<Role>("miner");
  const [filter, setFilter] = useState<Status | "all">("all");
  const reduced = useReducedMotion() !== false;
  const checklist = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: checklist, offset: ["start 80%", "end 65%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const report = reports[role];
  const rows = report.requirements.filter((row) => filter === "all" || row.status === filter);
  const command = `node packages/cli/dist/cli.js doctor ${role} --markdown`;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <ReadingReveal>
          <p className="eyebrow">Operate / operator doctor</p>
          <h1>
            Check the host.
            <br />
            <span>Keep the unknowns.</span>
          </h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <p className={styles.lead}>
            Is this machine ready to mine or validate on FLOP? Read local capacity, compare it with the docs and see
            what still needs evidence.
          </p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="muted">
            This page shows a recorded Linux host. It never probes your machine. A green check covers one observation,
            not network admission.
          </p>
        </ReadingReveal>
        <ReadingReveal order={3}>
          <div className={styles.command}>
            <code>{command}</code>
            <CopyButton text={command} label="Copy command" />
          </div>
          <p className="muted">
            Run from a built flop-lab workspace.{" "}
            <MotionLink href="https://github.com/zkasuran/flop-lab/tree/main/packages/doctor">
              Setup and options ↗
            </MotionLink>
          </p>
        </ReadingReveal>
      </header>

      <section className={styles.record} aria-labelledby="record-title">
        <div className={styles.recordHead}>
          <div>
            <p className="eyebrow">Recorded example / identifying details removed</p>
            <h2 id="record-title">
              {role === "miner" ? "Miner" : "Validator"} preflight: {report.status}
            </h2>
          </div>
          <div className={styles.controls} role="group" aria-label="Operator role">
            {(["miner", "validator"] as const).map((value) => (
              <MotionButton
                key={value}
                className="quiet-button"
                aria-pressed={role === value}
                onClick={() => {
                  setRole(value);
                  setFilter("all");
                }}
              >
                {value === "miner" ? "Miner" : "Validator"}
              </MotionButton>
            ))}
          </div>
        </div>
        <p className="muted">
          Measured <time dateTime={report.measuredAt}>{report.measuredAt}</time>. Sources: local read-only probes and
          public HTTPS responses. Validator results reuse the same hardware observations.
        </p>
        <div className={styles.metrics}>
          {statuses.map((status) => {
            const count = report.requirements.filter((row) => row.status === status).length;
            return (
              <div key={status} className={styles.metric} data-status={status}>
                <strong>
                  <ObservedNumber value={count} />
                </strong>
                <span>{labels[status]}</span>
                <div className={styles.barTrack} aria-hidden="true">
                  <motion.div
                    className={styles.bar}
                    initial={false}
                    animate={{ scaleX: count / report.requirements.length }}
                    transition={{ duration: reduced ? 0 : 0.4 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className={styles.note}>
          Local evidence is deliberately narrow. Missing NVIDIA tooling means UNKNOWN. The validator profile requires
          ECC and physical cores; capacity alone cannot establish either.
        </p>
      </section>

      <section ref={checklist} className={styles.checklist} aria-labelledby="checklist-title">
        <div className={styles.recordHead}>
          <div>
            <p className="eyebrow">Follow the evidence</p>
            <h2 id="checklist-title">What each result means</h2>
          </div>
          <div className={styles.controls} role="group" aria-label="Filter requirements">
            {(["all", ...statuses] as const).map((status) => (
              <MotionButton
                key={status}
                className="quiet-button"
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status === "all" ? "All checks" : status.replace("_", " ")}
              </MotionButton>
            ))}
          </div>
        </div>
        <p className="muted">
          The line tracks reading progress, not readiness. Open a source for its exact wording. Requirements are
          snapshots of the docs recorded with the package fixtures.
        </p>
        <div className={styles.rows}>
          <div className={styles.track} aria-hidden="true">
            <motion.div style={{ scaleY: reduced ? 1 : scaleY }} />
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row, index) => (
              <motion.article
                className={styles.row}
                data-status={row.status}
                key={`${role}-${row.id}`}
                layout={!reduced}
                initial={{ opacity: 1, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: reduced ? 1 : 0 }}
                transition={{ duration: reduced ? 0 : 0.24 }}
              >
                <ReadingReveal order={index % 3}>
                  <div className={styles.rowTitle}>
                    <h3>{row.title}</h3>
                    <span className={styles.status}>{row.status.replace("_", " ")}</span>
                  </div>
                  <p>{row.detail}</p>
                  <Disclosure title="Source and observation">
                    <blockquote>{row.source.quote}</blockquote>
                    <MotionLink href={row.source.url}>{row.source.locator} ↗</MotionLink>
                    <ul className={styles.evidence}>
                      {row.evidence.map((entry, n) => (
                        <li key={n}>
                          <code>{entry.source}</code>
                          <br />
                          <time dateTime={entry.measuredAt}>{entry.measuredAt}</time>
                          {entry.reason ? `: ${entry.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                    {!row.evidence.length && <p className="muted">A local probe cannot establish this requirement.</p>}
                  </Disclosure>
                </ReadingReveal>
              </motion.article>
            ))}
          </AnimatePresence>
          {rows.length === 0 && (
            <p className={styles.empty} role="status">
              No {filter.replace("_", " ")} results in this recorded report.
            </p>
          )}
        </div>
      </section>

      <section className={styles.bottom} aria-labelledby="outside-title">
        <ReadingReveal>
          <p className="eyebrow">The view from outside</p>
          <h2 id="outside-title">A local bind does not cross NAT.</h2>
          <p>
            A transient loopback bind only shows whether this process could claim a local socket. It cannot prove
            firewall rules, port forwarding or an external route. This recorded run skipped service-port binds to
            respect the shared machine's port allocation.
          </p>
          <p>
            {role === "miner"
              ? "The miner manual supports public HTTPS or your own tunnel. After deployment, run this from a second host. A 401 response shows the unauthenticated session path. Keep the raw worker port private."
              : "Use an authorized validator peer as the second host. Choose the DA port from your reviewed release. A successful TCP connection does not prove the peer protocol or DA custody."}
          </p>
          <div className={styles.command}>
            <pre>
              <code>{external[role]}</code>
            </pre>
            <CopyButton text={external[role]} label="Copy external check" />
          </div>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h2>Turn gaps into a useful request.</h2>
          <p>
            Use the access draft when you need an operator action. It follows the public issue form and omits hostnames
            and IPs by default. Add your public account address yourself.
          </p>
          <div className={styles.command}>
            <code>node packages/cli/dist/cli.js doctor {role} --access-request</code>
            <CopyButton
              text={`node packages/cli/dist/cli.js doctor ${role} --access-request`}
              label="Copy draft command"
            />
          </div>
          <p className="muted">
            Nothing is submitted. Devnet miners need no request while automatic sponsorship has room.
          </p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <h2>What this does not verify</h2>
          <p>
            No throughput trial, container startup, clock synchronization, installed NVMe inspection or ECC detection.
            No exact checkpoint fit, stake, calibration, DA availability, peer ingress or network activation. Missing
            tools and ambiguous requirements stay UNKNOWN.
          </p>
          <MotionLink href="/">Back to the suite ↗</MotionLink>
        </ReadingReveal>
      </section>
    </div>
  );
}
