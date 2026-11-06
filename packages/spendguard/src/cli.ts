#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { evaluate, parsePolicyText, parseRequest } from "./policy";
import { FileLedger } from "./ledger";
import { lintPolicyText } from "./lint";
import { estimateTape, replayTape, settlementTape } from "./replay";
import { SharedBudget } from "./shared";

const usage = `flop-spendguard init LEDGER
flop-spendguard verify LEDGER [EXPECTED_HEAD]
flop-spendguard evaluate POLICY.json|yaml REQUEST.json [--ledger LEDGER] --dry-run
flop-spendguard lint POLICY.json|yaml
flop-spendguard replay POLICY.json|yaml RECORDING.json [--estimate AGENT MODEL MINER]
flop-spendguard shared-init POLICY.json|yaml LEDGER
flop-spendguard reserve POLICY.json|yaml LEDGER AGENT REQUEST.json [--preview]

The CLI signs nothing. Policies use decimal FLOP strings.
Output includes every rule and source. JSON or strict policy YAML.`;

async function main(args: string[]) {
  const [command, path, extra, ...rest] = args;
  if (!command || command === "--help") {
    console.log(usage);
    return;
  }
  if (!path) throw new Error(usage);
  if (command === "lint" && !extra) {
    const report = lintPolicyText(await readFile(path, "utf8"));
    console.log(JSON.stringify({ ...report, source: path, measuredAt: new Date().toISOString() }, null, 2));
    process.exitCode = !report.valid ? 1 : report.findings.length ? 2 : 0;
    return;
  }
  if (command === "replay" && extra) {
    if (rest.length !== 0 && !(rest.length === 4 && rest[0] === "--estimate")) throw new Error(usage);
    const recording: unknown = JSON.parse(await readFile(extra, "utf8"));
    const tape = rest.length
      ? estimateTape(recording, { agent: rest[1]!, model: rest[2]!, miner: rest[3]! })
      : settlementTape(recording);
    const result = replayTape(parsePolicyText(await readFile(path, "utf8")), tape);
    console.log(
      JSON.stringify(
        {
          ...result,
          source: { policy: path, recording: extra, upstream: tape.source },
          measuredAt: new Date().toISOString(),
          capturedAt: tape.measuredAt,
          assumptions: tape.assumptions,
          partial: tape.partial,
        },
        null,
        2,
      ),
    );
    return;
  }
  if ((command === "shared-init" || command === "reserve") && extra) {
    const shared = new SharedBudget(new FileLedger(extra), parsePolicyText(await readFile(path, "utf8")));
    if (command === "shared-init" && !rest.length) {
      await shared.initialize();
      console.log(JSON.stringify({ initialized: extra, measuredAt: new Date().toISOString() }));
      return;
    }
    if (command !== "reserve" || (rest.length !== 2 && !(rest.length === 3 && rest[2] === "--preview")))
      throw new Error(usage);
    const request = parseRequest(JSON.parse(await readFile(rest[1]!, "utf8")) as unknown);
    const result = rest[2] ? await shared.preview(rest[0]!, request) : await shared.reserve(rest[0]!, request);
    console.log(
      JSON.stringify(
        {
          ...result,
          preview: !!rest[2],
          source: extra,
          agent: rest[0],
          measuredAt: new Date().toISOString(),
          mode: "local reservation only",
        },
        null,
        2,
      ),
    );
    if (result.decision === "deny") process.exitCode = 2;
    return;
  }
  if (command === "init" && !extra) {
    await new FileLedger(path).initialize();
    console.log(JSON.stringify({ initialized: path, measuredAt: new Date().toISOString() }));
    return;
  }
  if (command === "verify" && rest.length === 0) {
    const result = await new FileLedger(path).verify(extra);
    console.log(
      JSON.stringify({
        verified: true,
        source: path,
        measuredAt: new Date().toISOString(),
        head: result.head,
        records: result.events.length,
        reservations: result.reservations.length,
      }),
    );
    return;
  }
  if (command !== "evaluate" || !extra) throw new Error(usage);
  let ledgerPath: string | undefined,
    dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--dry-run" && !dryRun) dryRun = true;
    else if (rest[i] === "--ledger" && !ledgerPath && rest[i + 1]) ledgerPath = rest[++i];
    else throw new Error(`Unknown or duplicate option ${rest[i]}`);
  }
  if (!dryRun) throw new Error("CLI evaluation requires --dry-run");
  const policy = parsePolicyText(await readFile(path, "utf8"));
  const request = parseRequest(JSON.parse(await readFile(extra, "utf8")) as unknown);
  request.dryRun = true;
  const ledger = ledgerPath ? (await new FileLedger(ledgerPath).verify()).reservations : [];
  const result = evaluate(policy, ledger, request);
  console.log(
    JSON.stringify(
      {
        ...result,
        dryRun: true,
        measuredAt: new Date().toISOString(),
        source: { policy: path, request: extra, ledger: ledgerPath ?? "empty scenario ledger" },
        requestTime: new Date(request.at).toISOString(),
        mode: "offline policy evaluation",
      },
      null,
      2,
    ),
  );
  if (result.decision === "deny") process.exitCode = 2;
}
main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
