// SPDX-License-Identifier: Apache-2.0
import { checkNames, type CheckName, type Options } from "./types";

/** Validate action or CLI strings before doing work. @example parseOptions({ checks: 'tape,spec' }).checks */
export function parseOptions(input: {
  checks?: string;
  mode?: string;
  maxRequests?: string;
  failOnIncomplete?: string;
}): Options {
  const checks = (input.checks ?? "tape").split(",").map((name) => name.trim());
  if (
    !checks.length ||
    checks.some((name) => !checkNames.includes(name as CheckName)) ||
    new Set(checks).size !== checks.length
  )
    throw new Error("checks must be unique names from tape,spec,contracts");
  const mode = input.mode ?? "recorded";
  if (mode !== "recorded" && mode !== "live") throw new Error("mode must be recorded or live");
  const budget = input.maxRequests ?? "10";
  if (!/^(0|[1-9]\d*)$/.test(budget) || Number(budget) > 30)
    throw new Error("max-requests must be an integer from 0 through 30");
  const incomplete = input.failOnIncomplete ?? "true";
  if (!["true", "false"].includes(incomplete)) throw new Error("fail-on-incomplete must be true or false");
  return { checks: checks as CheckName[], mode, maxRequests: Number(budget), failOnIncomplete: incomplete === "true" };
}
