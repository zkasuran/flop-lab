// SPDX-License-Identifier: Apache-2.0
import { evidence, object, recording, text, time, type Event, type Gap, type Recording } from "./model";

const versionPattern = /^\d+\.\d+\.\d+(?:[a-zA-Z0-9.+-]*)$/;

/** Read registry publication dates, not semantic-version order or dist-tags. @example npmHistory(raw).events */
export function npmHistory(input: Recording): { events: Event[]; gaps: Gap[] } {
  const r = recording(input),
    events: Event[] = [],
    gaps: Gap[] = [];
  if (r.status !== 200)
    return { events, gaps: [{ ...evidence(r), kind: "sdk", reason: `npm returned HTTP ${r.status}` }] };
  const data = object(JSON.parse(r.body)),
    name = text(data.name),
    dates = object(data.time),
    versions = object(data.versions);
  if (!/^@flop-labs\/[a-z0-9-]+$/.test(name)) throw new Error("Unexpected npm package");
  if (decodeURIComponent(new URL(r.source).pathname).slice(1) !== name) throw new Error("Package/source mismatch");
  for (const [version, artifact] of Object.entries(versions)) {
    if (!versionPattern.test(version) || text(object(artifact).version) !== version)
      throw new Error("Invalid npm version");
    if (dates[version] === undefined) {
      gaps.push({ ...evidence(r), kind: "sdk", reason: `${name}@${version}: publication date missing` });
      continue;
    }
    events.push({
      id: `npm:${name}:${version}`,
      kind: "sdk",
      at: time(dates[version]),
      clock: "published",
      source: r.source,
      measuredAt: r.measuredAt,
      title: `${name} ${version}`,
      detail: "npm publication time. It does not establish compatibility or a deployed runtime version.",
      changes: [{ name: "Published artifact", before: null, after: `${name}@${version}` }],
      links: [
        { label: "Registry metadata", url: r.source },
        { label: "Package", url: `https://www.npmjs.com/package/${name}/v/${version}` },
      ],
    });
  }
  if (!Object.keys(versions).length)
    gaps.push({ ...evidence(r), kind: "sdk", reason: `${name}: no published versions in response` });
  return { events, gaps };
}

/** Use the earliest artifact upload per PyPI release and retain its clock semantics. @example pythonHistory(raw).events */
export function pythonHistory(input: Recording): { events: Event[]; gaps: Gap[] } {
  const r = recording(input),
    events: Event[] = [],
    gaps: Gap[] = [];
  if (r.status !== 200)
    return { events, gaps: [{ ...evidence(r), kind: "sdk", reason: `PyPI returned HTTP ${r.status}` }] };
  const data = object(JSON.parse(r.body));
  if (object(data.info).name !== "flop-sdk" || r.source !== "https://pypi.org/pypi/flop-sdk/json")
    throw new Error("Unexpected Python package");
  for (const [version, files] of Object.entries(object(data.releases))) {
    if (!versionPattern.test(version) || !Array.isArray(files) || files.length > 100)
      throw new Error("Invalid Python release");
    const dates = files.map((file) => time(object(file).upload_time_iso_8601)).sort();
    if (!dates[0]) {
      gaps.push({ ...evidence(r), kind: "sdk", reason: `flop-sdk ${version}: no dated artifacts` });
      continue;
    }
    const yanked = files.every((file) => object(file).yanked === true);
    events.push({
      id: `pypi:flop-sdk:${version}`,
      kind: "sdk",
      at: dates[0],
      clock: "published",
      source: r.source,
      measuredAt: r.measuredAt,
      title: `flop-sdk ${version}${yanked ? " (yanked)" : ""}`,
      detail: "Earliest recorded PyPI artifact upload for this release. Later uploads can have other dates.",
      changes: [{ name: "Published artifact", before: null, after: `flop-sdk==${version}` }],
      links: [{ label: "PyPI release", url: `https://pypi.org/project/flop-sdk/${version}/` }],
    });
  }
  return { events, gaps };
}

/** Read the page's labelled update date or HTTP Last-Modified, never fetch time. @example docsHistory(raw).gaps */
export function docsHistory(input: Recording): { events: Event[]; gaps: Gap[] } {
  const r = recording(input);
  const unavailable = (reason: string): { events: Event[]; gaps: Gap[] } => ({
    events: [],
    gaps: [{ ...evidence(r), kind: "docs", reason }],
  });
  if (r.status !== 200) return unavailable(`Docs returned HTTP ${r.status}`);
  const dates = [...r.body.matchAll(/<p\s+class="doc__updated">Last updated (\d{4}-\d{2}-\d{2})<\/p>/g)].map(
    (m) => m[1]!,
  );
  if (dates.length === 1) {
    const date = dates[0]!;
    time(`${date}T00:00:00Z`);
    if (date > r.measuredAt.slice(0, 10)) return unavailable("Page update date is later than reception.");
    return {
      gaps: [],
      events: [
        {
          id: `docs:${r.source}:${date}`,
          kind: "docs",
          at: date,
          clock: "page-date",
          source: r.source,
          measuredAt: r.measuredAt,
          title: new URL(r.source).pathname,
          detail:
            "Page labels this as Last updated. Day precision only. It is not a verified edit time or a content diff.",
          changes: [{ name: "Page label", before: null, after: `Last updated ${date}` }],
          links: [{ label: "Docs page", url: r.source }],
        },
      ],
    };
  }
  if (dates.length > 1) return unavailable("Multiple page update labels. Last change is ambiguous.");
  if (!r.lastModified)
    return unavailable("No labelled update date or HTTP Last-Modified header. Last content change is unobservable.");
  const parsed = Date.parse(r.lastModified);
  if (!Number.isFinite(parsed) || parsed > Date.parse(r.measuredAt))
    return unavailable("Last-Modified header is invalid or later than reception.");
  return {
    gaps: [],
    events: [
      {
        id: `docs:${r.source}:${parsed}`,
        kind: "docs",
        at: new Date(parsed).toISOString(),
        clock: "last-modified",
        source: r.source,
        measuredAt: r.measuredAt,
        title: new URL(r.source).pathname,
        detail: "HTTP Last-Modified for this representation. This is not a verified edit date or a content diff.",
        changes: [{ name: "Last-Modified header", before: null, after: r.lastModified }],
        links: [{ label: "Docs page", url: r.source }],
      },
    ],
  };
}
