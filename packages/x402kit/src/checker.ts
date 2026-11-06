// SPDX-License-Identifier: Apache-2.0
import { flopUnits, hex, object, parseProof, text } from "./protocol";
import { bindingHeaders, RULES, type RuleId } from "./rules";

export interface Round {
  measuredAt: string;
  request: { method: string; url: string; headers: [string, string][]; body: string };
  response: { status: number; headers: [string, string][]; body: string };
}
export interface Exchange {
  schemaVersion: 1;
  profile: "sdk-0.4.0" | "reference";
  source: string;
  measuredAt: string;
  rounds: Round[];
}
export interface Deviation {
  round: number;
  side: "client" | "server" | "capture";
  code: string;
  message: string;
  rule: RuleId;
  evidence: (typeof RULES)[RuleId];
}
export interface CheckReport {
  outcome: "deviations" | "no-deviations" | "incomplete";
  source: string;
  measuredAt: string;
  requestCount: number;
  unpaidRequests: number;
  proofRequests: number;
  deviations: Deviation[];
  limitations: string[];
}

function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT.*Z$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Expected a UTC capture time");
  return value;
}
function bounded(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid or oversized transcript string");
  return value;
}
function pairs(value: unknown): [string, string][] {
  if (!Array.isArray(value) || value.length > 64) throw new Error("Expected at most 64 raw header pairs");
  return value.map((pair: unknown) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error("Expected [name, value] headers");
    return [bounded(pair[0], 128), bounded(pair[1], 8192)];
  });
}

/** Validate a bounded raw transcript while preserving duplicate headers for diagnosis. @example parseExchange(JSON.parse(input)) */
export function parseExchange(value: unknown): Exchange {
  const root = object(value);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 131072) throw new Error("Exchange exceeds 128 KiB");
  if (root.schemaVersion !== 1 || !["reference", "sdk-0.4.0"].includes(String(root.profile)))
    throw new Error("Unsupported exchange schema or profile");
  if (!Array.isArray(root.rounds) || root.rounds.length > 16) throw new Error("Expected at most 16 rounds");
  const source = bounded(root.source, 512);
  if (!source.trim()) throw new Error("Capture source is required");
  return {
    schemaVersion: 1,
    profile: root.profile as Exchange["profile"],
    source,
    measuredAt: date(root.measuredAt),
    rounds: root.rounds.map((value: unknown) => {
      const round = object(value),
        request = object(round.request),
        response = object(round.response);
      if (
        typeof response.status !== "number" ||
        !Number.isInteger(response.status) ||
        response.status < 100 ||
        response.status > 599
      )
        throw new Error("Invalid HTTP status");
      const method = bounded(request.method, 24),
        url = bounded(request.url, 4096);
      if (!/^[A-Z]+$/.test(method) || !/^https?:$/.test(new URL(url).protocol))
        throw new Error("Invalid method or URL");
      return {
        measuredAt: date(round.measuredAt),
        request: { method, url, headers: pairs(request.headers), body: bounded(request.body, 65536) },
        response: { status: response.status, headers: pairs(response.headers), body: bounded(response.body, 65536) },
      };
    }),
  };
}

/** List every supported deviation without sending a request or trusting settlement claims. @example checkExchange(recording) */
export function checkExchange(value: unknown): CheckReport {
  const exchange = parseExchange(value);
  const deviations: Deviation[] = [];
  const add = (round: number, side: Deviation["side"], code: string, message: string, rule: RuleId) =>
    deviations.push({ round, side, code, message, rule, evidence: RULES[rule] });
  const readHeaders = (pairs: [string, string][], round: number, side: Deviation["side"]) => {
    const map = new Map<string, string>();
    for (const [name, val] of pairs) {
      const key = name.toLowerCase();
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || /[^\x20-\x7e]/.test(val))
        add(round, side, "malformed_header", `Invalid HTTP header: ${name}`, "strict");
      if (map.has(key)) add(round, side, "duplicate_header", `Ambiguous duplicate header: ${name}`, "strict");
      else map.set(key, val);
    }
    return map;
  };
  type Challenge = { headers: Map<string, string>; binding: string; completed?: string; proof?: string };
  const challenges = new Map<string, Challenge>();
  const used = new Map<string, string>();
  let unpaidRequests = 0,
    proofRequests = 0,
    completed = 0;
  for (const [index, round] of exchange.rounds.entries()) {
    const n = index + 1;
    if (index && Date.parse(round.measuredAt) < Date.parse(exchange.rounds[index - 1]!.measuredAt))
      add(n, "capture", "time_order", "Round times are not in capture order", "capture");
    const request = readHeaders(round.request.headers, n, "client"),
      response = readHeaders(round.response.headers, n, "server");
    const binding = JSON.stringify([
      round.request.method,
      round.request.url,
      bindingHeaders(round.request.headers),
      round.request.body,
    ]);
    const id = exchange.profile === "reference" ? (request.get("x-flop-request-id") ?? binding) : binding;
    const challenge = challenges.get(id);
    const success = round.response.status >= 200 && round.response.status < 300;
    const proofHeader = request.get("x-payment-proof");
    if (exchange.profile === "reference" && !/^[a-zA-Z0-9_-]{16,128}$/.test(request.get("x-flop-request-id") ?? ""))
      add(n, "client", "invalid_request_id", "Reference requests need X-Flop-Request-Id", "binding");
    if (challenge && challenge.binding !== binding) {
      add(n, "client", "request_changed", "Retry changed the original request", "retry");
      if (success)
        add(
          n,
          "server",
          "changed_request_accepted",
          "Server accepted a changed request under the same quote",
          "binding",
        );
    }
    if (proofHeader === undefined) {
      unpaidRequests++;
      if (challenge)
        add(
          n,
          "client",
          "repeated_unpaid_request",
          "Another unpaid request discarded an existing challenge (network #89)",
          "retry",
        );
      if (round.response.status !== 402)
        add(
          n,
          "server",
          "wrong_status",
          `Unpaid paywall request returned HTTP ${round.response.status}; expected 402`,
          "challenge",
        );
    } else {
      proofRequests++;
      if (!challenge) add(n, "client", "unquoted_payment", "No matching earlier challenge was captured", "retry");
      let validProof: boolean;
      try {
        const proof = parseProof(proofHeader);
        validProof = true;
        if (challenge?.proof && challenge.proof !== JSON.stringify(proof)) {
          validProof = false;
          add(n, "client", "proof_changed", "Completed request retried with a different proof", "replay");
        }
        if (challenge && proof.hash_lock !== hex(challenge.headers.get("x-payment-hash-lock"))) {
          validProof = false;
          add(n, "client", "hash_lock_mismatch", "Proof does not match the challenged hash lock", "proof");
        }
        for (const token of [`tx:${proof.tx_hash}`, `htlc:${proof.htlc_id}`]) {
          if (used.has(token) && used.get(token) !== id) {
            validProof = false;
            add(
              n,
              "client",
              "payment_replayed",
              `Payment identifier reused for another request: ${token.startsWith("tx:") ? "transaction" : "HTLC"}`,
              "replay",
            );
            if (success)
              add(n, "server", "replay_accepted", "Server accepted a cross-request payment replay", "replay");
          }
          // Remember attempts as well as accepted proofs. HTTP success is not settlement evidence.
          if (!used.has(token)) used.set(token, id);
        }
      } catch {
        validProof = false;
        add(
          n,
          "client",
          "malformed_proof",
          "X-Payment-Proof must be plain JSON with hash_lock, htlc_id and tx_hash",
          "proof",
        );
      }
      if (success && (!validProof || !challenge))
        add(n, "server", "invalid_payment_accepted", "Server accepted an invalid or unquoted proof", "proof");
      if (challenge && exchange.profile === "reference") {
        if (!challenge.completed && Date.parse(round.measuredAt) >= Number(challenge.headers.get("x-flop-expires-at")))
          add(n, "client", "quote_expired", "Proof retry reached or passed quote expiry", "expiry");
        const result = JSON.stringify({
          ...round.response,
          headers: round.response.headers
            .map(([key, value]): [string, string] => [key.toLowerCase(), value])
            .filter(([key]) => !["date", "connection", "keep-alive"].includes(key))
            .sort(([a], [b]) => a.localeCompare(b)),
        });
        if (challenge.completed && challenge.completed !== result)
          add(
            n,
            "server",
            "cached_response_changed",
            "Identical completed request returned different captured bytes",
            "replay",
          );
        if (success && validProof) challenge.completed = result;
      }
      if (success && validProof && challenge) {
        completed++;
        challenge.proof = JSON.stringify(parseProof(proofHeader));
        if (exchange.profile === "sdk-0.4.0") challenge.completed = "observed";
      }
    }
    const hasQuote = response.has("x-payment-price") || response.has("x-payment-hash-lock");
    if (hasQuote && round.response.status !== 402)
      add(n, "server", "challenge_status", "Payment challenge headers accompanied a non-402 response", "challenge");
    if (round.response.status === 402 || hasQuote) {
      const field = (name: string, rule: RuleId, validate: (v: string) => unknown, mandatory = true) => {
        const val = response.get(name);
        if (val === undefined) {
          if (mandatory) add(n, "server", "missing_header", `Missing ${name}`, rule);
          return;
        }
        try {
          if (validate(val) === false) throw new Error();
        } catch {
          add(n, "server", "invalid_header", `Invalid ${name}`, rule);
        }
      };
      field("x-payment-price", "price", (v) => flopUnits(v) > 0n);
      field("x-payment-hash-lock", "hash", hex);
      field(
        "x-payment-timeout-blocks",
        "timeout",
        (v) => /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 7200,
      );
      field("x-payment-destination", "destination", text);
      field("x-payment-asset", "asset", (v) => v === "FLOP", exchange.profile === "reference");
      field(
        "x-payment-network",
        "network",
        (v) => (exchange.profile === "reference" ? v === "flop-devnet" : ["flop-devnet", "flop-simnet"].includes(v)),
        exchange.profile === "reference",
      );
      if (exchange.profile === "reference") {
        field("x-payment-required", "devnet", (v) => v === "true");
        field("x-flop-request-id", "binding", (v) => v === request.get("x-flop-request-id"));
        field("x-flop-request-hash", "binding", hex);
        field(
          "x-flop-expires-at",
          "expiry",
          (v) => /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) > Date.parse(round.measuredAt),
        );
        field("x-flop-executable", "devnet", (v) => v === "true" || v === "false");
      }
      if (!challenge && proofHeader === undefined && round.response.status === 402)
        challenges.set(id, { headers: response, binding });
    }
  }
  return {
    outcome: deviations.length
      ? "deviations"
      : completed && [...challenges.values()].every((c) => c.completed)
        ? "no-deviations"
        : "incomplete",
    source: exchange.source,
    measuredAt: exchange.measuredAt,
    requestCount: exchange.rounds.length,
    unpaidRequests,
    proofRequests,
    deviations,
    limitations: [
      "Checks only the listed SDK 0.4.0 rules and local policy. Numeric and header syntax checks are stricter than the SDK parser.",
      "HTTP success and mock proofs do not verify payment, finality, recipient ownership or handler execution count.",
      "Capture source and time are supplied metadata. Missing rounds and omitted header duplicates cannot be recovered.",
      "A request hash is checked for shape, not recomputed or authenticated by this transcript checker.",
    ],
  };
}
