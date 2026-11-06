// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

export const BUDGET = { performance: 90, cls: 0.05, runs: 3 } as const;

export type Measurement = {
  measuredAt: string;
  source: string;
  performance: number;
  cls: number;
  lcpMs: number;
  fcpMs: number;
  tbtMs: number;
  requests: number;
  jsTransferBytes: number;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

function number(value: unknown, label: string, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`Missing or invalid ${label}`);
  }
  return value;
}

/** Read this site's flat Next sitemap and deduplicate paths. @example sitemapRoutes(xml) */
export function sitemapRoutes(xml: string): string[] {
  if (xml.length > 1_000_000 || !/<urlset(?:\s[^>]*)?>/.test(xml) || !xml.includes("</urlset>")) {
    throw new Error("Expected a nonempty flat sitemap urlset");
  }
  const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)];
  if (!locations.length || locations.length !== [...xml.matchAll(/<url(?:\s[^>]*)?>/g)].length) {
    throw new Error("Sitemap has missing locations");
  }
  let origin: string | undefined;
  return [
    ...new Set(
      locations.map((match) => {
        const url = new URL(match[1]!);
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
          throw new Error("Sitemap locations must be HTTP page URLs without credentials, queries or fragments");
        }
        origin ??= url.origin;
        if (url.origin !== origin) throw new Error("Sitemap contains mixed origins");
        return url.pathname;
      }),
    ),
  ];
}

/** Validate a successful mobile report before using its numbers. @example readMeasurement(lhr, url) */
export function readMeasurement(value: unknown, source: string): Measurement {
  const lhr = object(value);
  if (lhr.runtimeError) throw new Error(`Lighthouse runtime error: ${JSON.stringify(lhr.runtimeError)}`);
  if (lhr.finalDisplayedUrl !== source) throw new Error("Lighthouse navigated to an unexpected URL");
  if (typeof lhr.fetchTime !== "string" || !Number.isFinite(Date.parse(lhr.fetchTime))) {
    throw new Error("Lighthouse report has no measurement time");
  }
  const settings = object(lhr.configSettings);
  if (settings.formFactor !== "mobile" || settings.throttlingMethod !== "simulate") {
    throw new Error("Expected Lighthouse mobile simulated throttling");
  }
  const audits = object(lhr.audits);
  const metric = (key: string) => number(object(audits[key]).numericValue, key);
  const requests = object(object(audits["network-requests"]).details).items;
  if (!Array.isArray(requests) || !requests.length) throw new Error("Missing network requests");
  const records = requests.map(object);
  const document = records.find((item) => item.resourceType === "Document" && item.url === source);
  if (!document || document.statusCode !== 200) throw new Error("Page did not return HTTP 200");
  return {
    measuredAt: lhr.fetchTime,
    source,
    performance: number(object(object(lhr.categories).performance).score, "performance score", 1) * 100,
    cls: metric("cumulative-layout-shift"),
    lcpMs: metric("largest-contentful-paint"),
    fcpMs: metric("first-contentful-paint"),
    tbtMs: metric("total-blocking-time"),
    requests: records.length,
    jsTransferBytes: records
      .filter((item) => item.resourceType === "Script")
      .reduce((sum, item) => sum + number(item.transferSize, "script transfer size"), 0),
  };
}

/** Median of exactly three valid samples. No missing sample becomes zero. @example median([91, 89, 95]) */
export function median(values: readonly number[]): number {
  if (values.length !== BUDGET.runs) throw new Error(`Expected ${BUDGET.runs} measurements`);
  return values.map((value) => number(value, "sample")).sort((a, b) => a - b)[1]!;
}

/** Gate each metric independently without rounding. @example summarize(runs).pass */
export function summarize(runs: readonly Measurement[]) {
  const performance = median(runs.map((run) => number(run.performance, "performance", 100)));
  const cls = median(runs.map((run) => run.cls));
  return {
    performance,
    cls,
    lcpMs: median(runs.map((run) => run.lcpMs)),
    tbtMs: median(runs.map((run) => run.tbtMs)),
    requests: median(runs.map((run) => run.requests)),
    jsTransferBytes: median(runs.map((run) => run.jsTransferBytes)),
    pass: performance >= BUDGET.performance && cls <= BUDGET.cls,
  };
}

/** Sum unique initial JS files emitted by Next for the page, including shared chunks. @example buildJs(html, ".next") */
export async function buildJs(html: string, nextDirectory: string) {
  const directory = resolve(nextDirectory);
  const sources = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]!))];
  const files = await Promise.all(
    sources.map(async (source) => {
      const path = source.split("?")[0]!;
      if (!/^\/_next\/static\/[\w./-]+\.js$/.test(path)) throw new Error(`Unexpected initial script: ${source}`);
      const file = resolve(directory, path.slice("/_next/".length));
      if (!file.startsWith(`${directory}${sep}static${sep}`)) throw new Error("Script escaped Next static output");
      return { path, bytes: (await stat(file)).size };
    }),
  );
  if (!files.length) throw new Error("No initial Next JS found in page HTML");
  return { bytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
}

/** Identify the output being measured without executing build manifests. @example await buildIdentity(".next") */
export async function buildIdentity(nextDirectory: string) {
  const id = (await readFile(resolve(nextDirectory, "BUILD_ID"), "utf8")).trim();
  if (!id) throw new Error("Build first: pnpm --filter web build");
  return { id, builtAt: (await stat(resolve(nextDirectory, "BUILD_ID"))).mtime.toISOString() };
}
