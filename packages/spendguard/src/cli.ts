#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { evaluate, parsePolicyText, parseRequest } from "./policy";
import { FileLedger } from "./ledger";

const usage = `flop-spendguard init LEDGER
flop-spendguard verify LEDGER [EXPECTED_HEAD]
flop-spendguard evaluate POLICY.json|yaml REQUEST.json [--ledger LEDGER] --dry-run

The CLI signs nothing. Policies use decimal FLOP strings.
Output includes every rule and source. JSON or strict policy YAML.`;

async function main(args: string[]) {
  const [command, path, extra, ...rest] = args;
  if (!command || command === "--help") {
    console.log(usage);
    return;
  }
  if (!path) throw new Error(usage);
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
