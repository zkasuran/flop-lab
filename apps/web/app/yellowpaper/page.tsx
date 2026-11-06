// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedIssues, recordedReader } from "../../../../packages/yellowpaper/src/recorded";
import { issuesFor } from "../../../../packages/yellowpaper/src/issues";
import { ReaderView } from "./view";
import styles from "./reader.module.css";

export const metadata: Metadata = {
  title: "Spec reader",
  description:
    "Read the pinned FLOP yellowpaper beside dated parameter evidence. Search sections and terms, follow cross-references and inspect public issue states.",
};

export default function YellowpaperPage() {
  try {
    const reader = recordedReader();
    const catalog = recordedIssues();
    const issues = reader.openItems.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      internalReferences: item.internalReferences,
      links: issuesFor(item, catalog),
    }));
    const summary = {
      sha: reader.sha,
      measuredAt: reader.measuredAt,
      source: reader.source,
      search: reader.search,
      warnings: reader.warnings,
      headingCount: reader.headings.length,
      glossaryCount: reader.glossary.length,
      openItemCount: reader.openItems.length,
      parameters: reader.parameters.map((row) => ({
        id: row.id,
        name: row.name,
        result: row.result,
        reason: row.reason,
        runtime: row.runtime,
        spec: row.spec
          ? {
              value: row.spec.value,
              unit: row.spec.unit,
              evidence: { source: row.spec.evidence.source, measuredAt: row.spec.evidence.measuredAt },
            }
          : null,
      })),
    };
    return (
      <ReaderView reader={summary} issues={issues} issuesMeasuredAt={catalog.measuredAt}>
        <div className={styles.paper} data-paper>
          {reader.html.split(/(?=<h2 id=)/).map((section, index) => (
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
