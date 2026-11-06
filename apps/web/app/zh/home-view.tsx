// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingReveal, ReadingSteps } from "@/components/motion";
import { ToolGrid } from "@/components/tool-grid";
import { SectionHeading } from "@/components/home/section-heading";
import type { Observation, Snapshot } from "@/lib/devnet";
import type { ClaimRun, PromiseLedger, SettlementTape } from "@/lib/evidence";
import { compareSample, isStale } from "@/lib/observation-view";
import { home } from "./translations/home";
import { common } from "./translations/common";
import styles from "./zh.module.css";

const c = home.zh;
const command = "curl --fail https://api.flop.network/v1/models";
const promises = [
  [c.promise1, c.outside1],
  [c.promise2, c.outside2],
  [c.promise3, c.outside3],
  [c.promise4, c.outside4],
];
function Source({ observation, now }: { observation: Observation<unknown>; now: number }) {
  return (
    <div className={styles.meta}>
      <span>{isStale(observation, now) ? c.lastKnown : c.observed}</span>
      <p>
        {c.measured}:{" "}
        {observation.measuredAt ? <time dateTime={observation.measuredAt}>{observation.measuredAt}</time> : c.noData}
      </p>
      <span lang="en">{observation.source}</span>
      {observation.error && (
        <p>
          {c.unavailable}: <span lang="en">{observation.error}</span>
        </p>
      )}
    </div>
  );
}
function Recorded({ at, href }: { at: string | null; href: string }) {
  return (
    <p className={styles.meta}>
      {common.zh.recorded}
      <br />
      {at ? <time dateTime={at}>{at}</time> : c.noData}
      <br />
      <MotionLink href={href}>{common.zh.recording} ↗</MotionLink>
    </p>
  );
}

/** Chinese home copy over the same validated observations as the English home. @example <ChineseHome {...data} /> */
export function ChineseHome({
  snapshot,
  run,
  tape,
  ledger,
}: {
  snapshot: Snapshot;
  run: ClaimRun | null;
  tape: SettlementTape;
  ledger: PromiseLedger;
}) {
  const reduced = useReducedMotion() !== false;
  const router = useRouter();
  const [now, setNow] = useState(Date.parse(snapshot.renderedAt));
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      if (!document.hidden) router.refresh();
    };
    setNow(Date.now());
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  const sample = compareSample(snapshot.miners.value, snapshot.settlements.value);
  return (
    <>
      <header className={styles.hero}>
        <ReadingReveal>
          <p className="eyebrow">{c.eyebrow}</p>
          <h1>
            {c.title}
            <br />
            {c.subtitle}
          </h1>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <p>{c.intro}</p>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <div className={styles.actions}>
            <MotionLink className="button" href="#tools">
              {c.explore} ↓
            </MotionLink>
            <MotionLink className="quiet-button" href="/zh/docs">
              {common.zh.docs} →
            </MotionLink>
            <MotionLink href="https://docs.flop.network">{c.protocol} ↗</MotionLink>
          </div>
        </ReadingReveal>
      </header>
      <section className="section" id="findings" aria-labelledby="findings-heading">
        <SectionHeading index="01" eyebrow={c.findings} id="findings-heading" title={c.findingsTitle}>
          {c.findingsText}
        </SectionHeading>
        <div className={styles.grid}>
          <ReadingReveal>
            <article className={styles.card}>
              <p className="eyebrow" lang="en">
                Settlement verifier
              </p>
              <h3>{c.settlement}</h3>
              <p>
                {c.settlements}: <ObservedNumber value={tape.rows.length} />
              </p>
              <p>
                {c.checks}: <ObservedNumber value={tape.checks} />
              </p>
              <p>
                {c.pass}: <ObservedNumber value={tape.pass} /> / {c.fail}: <ObservedNumber value={tape.fail} />
              </p>
              <p>{c.settlementLimit}</p>
              <Recorded at={tape.measuredAt} href={tape.recording} />
              <MotionLink href="/verify">{common.zh.open} ↗</MotionLink>
            </article>
          </ReadingReveal>
          <ReadingReveal order={1}>
            <article className={styles.card}>
              <p className="eyebrow" lang="en">
                Conformance harness
              </p>
              <h3>{c.claim}</h3>
              {run ? (
                <>
                  <p>
                    <ObservedNumber value={run.claims.length} /> {c.claims}
                  </p>
                  {(
                    [
                      ["PASS", c.pass],
                      ["FAIL", c.fail],
                      ["UNVERIFIABLE", c.unverifiable],
                      ["SKIPPED", c.skipped],
                    ] as const
                  ).map(([status, label]) => (
                    <p key={status}>
                      {label}: <ObservedNumber value={run.counts[status]} />
                    </p>
                  ))}
                  <p>
                    {c.requests}: {run.requests} / {c.spent}: {run.spentFlop}
                  </p>
                  <Recorded at={run.measuredAt} href={run.recording} />
                  <Disclosure title={c.original}>
                    <ul className={styles.list} lang="en">
                      {run.claims.map((claim) => (
                        <li key={claim.id}>
                          <strong>{claim.title}</strong>
                          <p>
                            {claim.status}: {claim.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                </>
              ) : (
                <p>{c.missingRun}</p>
              )}
              <MotionLink href="/harness">{c.details} ↗</MotionLink>
            </article>
          </ReadingReveal>
          <ReadingReveal order={2}>
            <article className={styles.card}>
              <p className="eyebrow" lang="en">
                Gateway / price sources
              </p>
              <h3>{c.priceTitle}</h3>
              <p>
                {c.addresses}: <ObservedNumber value={snapshot.miners.value?.length} missingLabel={c.noData} />
              </p>
              <p>
                {sample ? (
                  <>
                    {c.matches}: <ObservedNumber value={sample.matches.length} /> / {sample.total}
                  </>
                ) : (
                  c.sampleUnavailable
                )}
              </p>
              <div className={styles.track} aria-hidden="true">
                <motion.div
                  data-sample-bar
                  className={styles.fill}
                  initial={false}
                  whileInView={{ scaleX: sample?.ratio ?? 0 }}
                  style={{ scaleX: reduced ? (sample?.ratio ?? 0) : 0 }}
                  transition={{ duration: reduced ? 0 : 0.4 }}
                />
              </div>
              <p>{c.sampleNote}</p>
              <p>{c.priceText}</p>
              <Source observation={snapshot.miners} now={now} />
              <Source observation={snapshot.settlements} now={now} />
              <MotionLink href="/scoreboard">{common.zh.open} ↗</MotionLink>
            </article>
          </ReadingReveal>
        </div>
      </section>
      <section className="section" aria-labelledby="promises-heading">
        <SectionHeading index="02" eyebrow={c.promiseTitle} id="promises-heading" title={c.promiseTitle}>
          {c.promiseIntro}
        </SectionHeading>
        <div className={styles.ledger}>
          {ledger.rows.map((row, index) => (
            <ReadingReveal key={row.promise} order={index}>
              <article className={styles.card}>
                <h3>{promises[index]?.[0] ?? row.promise}</h3>
                <p>{promises[index]?.[1] ?? row.outside}</p>
                <ul lang="en">
                  {row.chips.map((chip) => (
                    <li key={`${chip.tool}-${chip.id}`}>
                      <code>{chip.title}</code>: {chip.status ?? "Not recorded"}
                    </li>
                  ))}
                </ul>
                <p className={styles.meta}>
                  {common.zh.recorded}:{" "}
                  <time dateTime={ledger.harnessAt ?? undefined}>{ledger.harnessAt ?? c.noData}</time> /{" "}
                  <time dateTime={ledger.verifierAt ?? undefined}>{ledger.verifierAt ?? c.noData}</time>
                </p>
                <MotionLink href={row.href}>{common.zh.open} ↗</MotionLink>
              </article>
            </ReadingReveal>
          ))}
        </div>
      </section>
      <section className="section" id="observe" aria-labelledby="observe-heading">
        <SectionHeading index="03" eyebrow={c.observations} id="observe-heading" title={c.observeTitle}>
          {c.observeText}
        </SectionHeading>
        <p className="muted">{c.refresh}</p>
        <div className={styles.grid}>
          {[
            { label: c.block, value: snapshot.stats.value?.block, observation: snapshot.stats },
            { label: c.accounts, value: snapshot.stats.value?.accounts, observation: snapshot.stats },
            { label: c.addresses, value: snapshot.miners.value?.length, observation: snapshot.miners },
          ].map((item, index) => (
            <ReadingReveal key={item.label} order={index}>
              <article className={styles.card}>
                <h3>{item.label}</h3>
                <p className={styles.value}>
                  <ObservedNumber value={item.value} missingLabel={c.noData} />
                </p>
                <Source observation={item.observation} now={now} />
              </article>
            </ReadingReveal>
          ))}
        </div>
        <div className="section">
          <h3>{c.map}</h3>
          <ReadingSteps
            steps={[
              { title: c.read, text: c.readText },
              { title: c.sample, text: c.sampleNote },
              { title: c.inspect, text: c.inspectText },
            ]}
          />
        </div>
      </section>
      <section className="section" id="tools" aria-labelledby="tools-heading">
        <SectionHeading index="04" eyebrow={c.workbench} id="tools-heading" title={c.toolsTitle}>
          {c.toolsText}
        </SectionHeading>
        <ToolGrid locale="zh" />
      </section>
      <section className="section" id="start" aria-labelledby="start-heading">
        <SectionHeading index="05" eyebrow={c.start} id="start-heading" title={c.startTitle}>
          {c.startText}
        </SectionHeading>
        <pre className={styles.code} lang="en">
          <code>{command}</code>
        </pre>
        <MotionButton
          className="quiet-button"
          aria-label={c.copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setCopied("copied");
            } catch {
              setCopied("failed");
            }
          }}
        >
          <span role="status">{copied === "copied" ? c.copied : copied === "failed" ? c.copyFailed : c.copy}</span>
        </MotionButton>
      </section>
      <section className="section" aria-labelledby="process-heading">
        <SectionHeading index="06" eyebrow={c.process} id="process-heading" title={c.processTitle}>
          {c.processText}
        </SectionHeading>
        <ReadingSteps
          steps={[
            { title: c.step1, text: c.step1Text },
            { title: c.step2, text: c.step2Text },
            { title: c.step3, text: c.step3Text },
            { title: c.step4, text: c.step4Text },
          ]}
        />
        <div className={styles.actions}>
          <MotionLink href="/about">{c.about} →</MotionLink>
          <MotionLink href="/provenance">{c.provenance} →</MotionLink>
        </div>
      </section>
    </>
  );
}
