// SPDX-License-Identifier: Apache-2.0
import { issuesFor } from "../../../../packages/yellowpaper/src/issues";
import type { Reader, IssueCatalog } from "../../../../packages/yellowpaper/src/model";

/** Project dated client evidence separately from the complete server document. @example readerPageData(recordedReader(), recordedIssues()) */
export function readerPageData(reader: Reader, catalog: IssueCatalog) {
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
  return { summary, issues, issuesMeasuredAt: catalog.measuredAt, sections: reader.html.split(/(?=<h2 id=)/) };
}
