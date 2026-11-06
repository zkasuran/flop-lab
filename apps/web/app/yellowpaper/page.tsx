// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedIssues, recordedReader } from "../../../../packages/yellowpaper/src/recorded";
import { readerPageData } from "./model";
import { ReaderView } from "./view";
import styles from "./reader.module.css";

export const metadata: Metadata = {
  title: "Spec reader",
  description:
    "Read the pinned FLOP yellowpaper beside dated parameter evidence. Search sections and terms, follow cross-references and inspect public issue states.",
};

export default function YellowpaperPage() {
  try {
    const { summary, issues, issuesMeasuredAt, sections } = readerPageData(recordedReader(), recordedIssues());
    return (
      <ReaderView reader={summary} issues={issues} issuesMeasuredAt={issuesMeasuredAt}>
        <div className={styles.paper} data-paper>
          {sections.map((section, index) => (
            <div key={index} className={styles.paperSection} dangerouslySetInnerHTML={{ __html: section }} />
          ))}
        </div>
      </ReaderView>
    );
  } catch {
    return (
      <section className="section">
        <h1>Spec recording unavailable</h1>
        <p>The saved paper or evidence failed validation. No parameter values are shown.</p>
      </section>
    );
  }
}
