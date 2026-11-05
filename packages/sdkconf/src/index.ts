// SPDX-License-Identifier: Apache-2.0
import { Worker } from "node:worker_threads";
import { catalogue } from "./catalogue.ts";
import { parseReport, versions } from "./model.ts";
import type { Report, Sdk } from "./model.ts";
export { catalogue } from "./catalogue.ts";
export { ScriptedService, endpoints } from "./mock.ts";
export type { Step } from "./mock.ts";
export * from "./model.ts";

/** Run offline checks against installed pins in an isolated worker. @example await runSuite({ sdk: "client" }) */
export async function runSuite(options: { sdk?: Sdk; scenario?: string; python?: string } = {}): Promise<Report> {
  if (options.sdk && !Object.hasOwn(versions, options.sdk))
    throw new Error("Unknown SDK. Use sdk, client, cli or python.");
  if (options.scenario && !catalogue.some((s) => s.id === options.scenario && (!options.sdk || s.sdk === options.sdk)))
    throw new Error("Unknown scenario for this SDK");
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js", import.meta.url),
      { workerData: options },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Conformance worker exceeded its 45-second deadline"));
    }, 45000);
    worker.once("message", (value: unknown) => {
      clearTimeout(timer);
      void worker.terminate();
      try {
        const report = parseReport(value);
        report.durationMs = Math.round((performance.now() - started) * 100) / 100;
        resolve(report);
      } catch (error) {
        reject(error);
      }
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      // Reject even a clean early exit. A successful run must send a report first.
      reject(new Error(`Conformance worker exited ${code} before reporting`));
    });
  });
}
