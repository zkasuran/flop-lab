// SPDX-License-Identifier: Apache-2.0
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import lighthouse from "lighthouse";
import { launch, type LaunchedChrome } from "chrome-launcher";
import {
  BUDGET,
  buildIdentity,
  buildJs,
  readMeasurement,
  sitemapRoutes,
  summarize,
  type Measurement,
} from "../../../scripts/perf/index";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "3810" },
    "chrome-port": { type: "string", default: "3811" },
    "chrome-path": { type: "string" },
    "no-sandbox": { type: "boolean", default: false },
    output: { type: "string" },
    route: { type: "string", multiple: true },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(
    "pnpm --filter web perf [--output DIR] [--port 3810] [--chrome-port 3811] [--chrome-path PATH] [--no-sandbox] [--route /about]\nBuild first. Audits the production sitemap with three cold-cache mobile runs per route. Exit 1 on budgets or incomplete measurements. --route limits coverage explicitly.",
  );
} else {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

function port(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error("Port must be 1024 to 65535");
  return Number(value);
}

async function available(port: number) {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function text(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const web = fileURLToPath(new URL("..", import.meta.url));
  const next = resolve(web, ".next");
  const build = await buildIdentity(next);
  const serverPort = port(values.port);
  const chromePort = port(values["chrome-port"]);
  if (serverPort === chromePort) throw new Error("Server and Chrome ports must differ");
  await available(serverPort);
  await available(chromePort);
  const output = resolve(values.output ?? resolve(next, "perf", new Date().toISOString().replaceAll(":", "-")));
  await mkdir(output, { recursive: true });
  // Refuse accidental evidence replacement. An interrupted run stays inspectable.
  await writeFile(resolve(output, "started.json"), JSON.stringify({ startedAt: new Date().toISOString(), build }), {
    flag: "wx",
  });
  const source = `http://127.0.0.1:${serverPort}`;
  type Route = {
    route: string;
    buildJs?: Awaited<ReturnType<typeof buildJs>>;
    runs: Measurement[];
    median?: ReturnType<typeof summarize>;
    errors: string[];
  };
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    source,
    build,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: web, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: web, encoding: "utf8" }).trim().length > 0,
    host: {
      node: process.version,
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
    },
    budgets: BUDGET,
    coverage: values.route ? "selected routes" : "complete sitemap",
    sitemapRoutes: [] as string[],
    serverReadyMs: 0,
    lighthouseVersion: "",
    userAgent: "",
    settings: {} as unknown,
    routes: [] as Route[],
    errors: [] as string[],
    pass: false,
  };
  const save = async () => {
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    const rows = report.routes.map(
      (row) =>
        `| ${row.route} | ${row.median?.performance ?? "error"} | ${row.median?.cls ?? "error"} | ${row.buildJs?.bytes ?? "error"} | ${row.median?.requests ?? "error"} | ${row.median?.pass && !row.errors.length ? "pass" : "fail"} |`,
    );
    await writeFile(
      resolve(output, "report.md"),
      `# Mobile performance\n\nSource: ${source}\n\nStarted: ${report.startedAt}\n\nCoverage: ${report.coverage}. Three runs per route. Independent medians. JS bytes are uncompressed initial Next output files.\n\n| Route | Performance | CLS | Build JS bytes | Requests | Budget |\n| --- | ---: | ---: | ---: | ---: | --- |\n${rows.join("\n")}\n`,
    );
  };
  const started = performance.now();
  const require = createRequire(import.meta.url);
  const server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(serverPort)],
    { cwd: web, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverLog = "";
  let chrome: LaunchedChrome | undefined;
  let stopping: Promise<void> | undefined;
  server.stdout.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server.stderr.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server.on("error", (error) => report.errors.push(error.message));
  const stop = () =>
    (stopping ??= (async () => {
      try {
        await chrome?.kill();
      } finally {
        if (server.exitCode === null && server.signalCode === null) {
          const exit = once(server, "exit");
          server.kill("SIGTERM");
          const timer = setTimeout(() => server.kill("SIGKILL"), 5_000);
          await exit;
          clearTimeout(timer);
        }
        await writeFile(resolve(output, "server.log"), serverLog);
      }
    })());
  const interrupt = () => {
    void stop().finally(() => process.exit(130));
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    let xml: string | undefined;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null || server.signalCode !== null)
        throw new Error(`Next exited before ready: ${serverLog}`);
      try {
        const response = await fetch(`${source}/sitemap.xml`, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          xml = await response.text();
          break;
        }
      } catch {
        /* The local process has not bound its port yet. */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!xml) throw new Error("Production server did not become ready");
    report.serverReadyMs = performance.now() - started;
    await writeFile(resolve(output, "sitemap.xml"), xml);
    report.sitemapRoutes = sitemapRoutes(xml);
    const routes = values.route ? [...new Set(values.route)] : report.sitemapRoutes;
    if (routes.some((route) => !report.sitemapRoutes.includes(route)))
      throw new Error("Selected route is absent from the sitemap");
    for (const route of routes) {
      const row: Route = { route, runs: [], errors: [] };
      report.routes.push(row);
      try {
        row.buildJs = await buildJs(await text(`${source}${route}`), next);
      } catch (error) {
        row.errors.push(String(error));
      }
    }
    chrome = await launch({
      chromePath: values["chrome-path"],
      port: chromePort,
      handleSIGINT: false,
      chromeFlags: ["--headless", "--disable-dev-shm-usage", ...(values["no-sandbox"] ? ["--no-sandbox"] : [])],
    });
    // Round-robin order reduces the effect of server age on any one route's median.
    for (let run = 1; run <= BUDGET.runs; run++) {
      for (const [index, row] of report.routes.entries()) {
        try {
          const result = await lighthouse(`${source}${row.route}`, {
            port: chrome.port,
            output: "json",
            onlyCategories: ["performance"],
            logLevel: "error",
            formFactor: "mobile",
            throttlingMethod: "simulate",
            disableStorageReset: false,
          });
          if (!result) throw new Error("Lighthouse returned no report");
          await writeFile(resolve(output, `${index}-${run}.json.gz`), gzipSync(JSON.stringify(result.lhr)));
          const measurement = readMeasurement(result.lhr, `${source}${row.route}`);
          row.runs.push(measurement);
          report.lighthouseVersion = result.lhr.lighthouseVersion;
          report.userAgent = result.lhr.userAgent;
          report.settings = result.lhr.configSettings;
          if (row.runs.length === BUDGET.runs) row.median = summarize(row.runs);
          console.log(JSON.stringify({ route: row.route, run, ...measurement }));
        } catch (error) {
          row.errors.push(`Run ${run}: ${String(error)}`);
          console.error(`${row.route}: ${String(error)}`);
        }
        await save();
      }
    }
    if ((await buildIdentity(next)).id !== build.id) throw new Error("Build changed during measurement");
    report.pass =
      report.routes.length > 0 &&
      report.routes.every((row) => row.median?.pass && row.errors.length === 0) &&
      report.errors.length === 0;
  } catch (error) {
    report.errors.push(String(error));
  } finally {
    await stop();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    report.finishedAt = new Date().toISOString();
    await save();
  }
  console.log(`${report.pass ? "PASS" : "FAIL"}: ${report.coverage}. Report: ${output}/report.json`);
  if (!report.pass) process.exitCode = 1;
}
