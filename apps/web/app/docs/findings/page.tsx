// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "../../../components/motion";
import { parseRecording } from "./model";
import network from "./network.json";
import yellowpaper from "./yellowpaper.json";
import styles from "../docs.module.css";

export const metadata: Metadata = {
  title: "Dated upstream findings",
  description: "Public FLOP issue reports by zkasuran with recorded GitHub states, dates and source links.",
};
export const dynamic = "force-dynamic";

export default function FindingsPage() {
  return (
    <>
      <header className="page-heading">
        <MotionLink href="/docs">← Suite documentation</MotionLink>
        <ReadingReveal>
          <p className="eyebrow">Findings / Public reports</p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h1>
            What we reported.
            <br />
            What GitHub records.
          </h1>
        </ReadingReveal>
        <ReadingReveal order={2}>
          <p className="intro">
            Upstream reports authored by zkasuran in the network and yellowpaper trackers. This includes work before
            flop-lab. Each list keeps its observation time. Follow an issue for its latest state.
          </p>
        </ReadingReveal>
      </header>
      {[network, yellowpaper].map((recording) => {
        try {
          const catalog = parseRecording(recording);
          return (
            <section className="section" key={catalog.repository} aria-label={catalog.repository}>
              <ReadingReveal>
                <h2>{catalog.repository}</h2>
                <p className={styles.meta}>
                  Observed {catalog.measuredAt}. <MotionLink href={catalog.source}>GitHub source query ↗</MotionLink>
                </p>
                <p>
                  <ObservedNumber value={catalog.issues.length} /> reports.{" "}
                  <ObservedNumber value={catalog.issues.filter((issue) => issue.state === "OPEN").length} /> open at
                  capture.
                </p>
              </ReadingReveal>
              {catalog.issues.length === 0 ? (
                <p>No authored issues were returned by this query.</p>
              ) : (
                <ol className={styles.findings}>
                  {[...catalog.issues]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((issue) => (
                      <li key={issue.number}>
                        <ReadingReveal>
                          <p className="eyebrow">
                            {issue.state} at capture / #{issue.number}
                          </p>
                          <h2>
                            <MotionLink href={issue.url}>{issue.title.replace(/[\u2013\u2014]/g, "-")} ↗</MotionLink>
                          </h2>
                          <p className={styles.meta}>
                            Filed {issue.createdAt}. Updated {issue.updatedAt}.
                            {issue.closedAt ? ` Closed ${issue.closedAt}.` : ""}
                          </p>
                        </ReadingReveal>
                      </li>
                    ))}
                </ol>
              )}
            </section>
          );
        } catch {
          return (
            <section className="panel" key={recording.repository}>
              <h2>{recording.repository}</h2>
              <p>Recording unavailable or invalid. No issue count or state is inferred.</p>
              <MotionLink href={`https://github.com/${recording.repository}/issues`}>Open the tracker ↗</MotionLink>
            </section>
          );
        }
      })}
      <ReadingPath
        title="A report is not a verdict"
        steps={[
          {
            title: "Reproduce from a public source",
            text: "The report links the observed behavior and the expected rule. Tool READMEs keep the checks and their limits.",
          },
          {
            title: "Record the upstream response",
            text: "Open and closed are GitHub issue states. Closing a report does not establish that every deployed service was fixed.",
          },
          {
            title: "Recheck before relying",
            text: "These lists update when a maintainer records the queries again and builds the site. They are not live monitors.",
          },
        ]}
      />
    </>
  );
}
