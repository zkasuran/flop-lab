// SPDX-License-Identifier: Apache-2.0
import { assertModelList } from "@flop-labs/contracts";
import { escrowConserved, McpError, parseSettlement } from "@flop-lab/mcp";
import { Context, Unavailable } from "./context";
import { array, integer, object, schemaErrors, text } from "./validation";
import type { Claim, Observation } from "./types";

const pass = (observed: unknown, reason: string): Observation => ({ status: "PASS", observed, reason });
const fail = (observed: unknown, reason: string): Observation => ({ status: "FAIL", observed, reason });
const unavailable = (reason: string): Observation => ({ status: "UNVERIFIABLE", observed: null, reason });

/** Compare source lifetime in milliseconds without treating a stale quote as a live price. @example priceLifetime({ effective_at: "2026-11-05T00:00:00Z", expires_at: "2026-11-05T00:02:00Z" }) */
export function priceLifetime(source: Record<string, unknown>): boolean {
  const start = Date.parse(text(source.effective_at));
  const end = Date.parse(text(source.expires_at));
  return Number.isFinite(start) && Number.isFinite(end) && end - start === 120_000;
}

function page(raw: unknown, limit: number, offset: number) {
  const result = object(raw);
  const rows = array(result.data).map(object);
  const pagination = object(result.pagination);
  const total = integer(pagination.total);
  const valid =
    integer(pagination.limit) === limit &&
    integer(pagination.offset) === offset &&
    rows.length <= limit &&
    typeof pagination.hasMore === "boolean" &&
    pagination.hasMore === offset + rows.length < total;
  return { rows, total, hasMore: pagination.hasMore, valid, pagination };
}

/** Execute a single claim against a shared context. @example await checkClaim(claim, context) */
export async function checkClaim(claim: Claim, context: Context): Promise<Observation> {
  if (claim.check === "unavailable")
    return unavailable(claim.reason ?? "The required evidence is not exposed by these read-only surfaces");
  if (claim.check === "contracts") {
    const value = await context.models();
    try {
      assertModelList(value);
    } catch (error) {
      return fail(value, String(error));
    }
    return pass(value, "Published assertModelList accepted the gateway envelope; this is structural validation only");
  }
  if (claim.check === "expiry") {
    const models = object(await context.models());
    const sources = array(models.data)
      .flatMap((model) => array(object(object(model)["x-flop"]).price_sources))
      .map(object);
    if (!sources.length) return unavailable("The gateway returned no price sources");
    const bad = sources.filter((source) => !priceLifetime(source));
    return bad.length
      ? fail(bad, "Price-source lifetime differs from the documented interval")
      : pass(
          { sources: sources.length },
          "All source lifetimes match; signature validity and current freshness are not checked",
        );
  }
  if (claim.check === "audit") {
    const root = object(await context.call("flop_trust_root"));
    const observed = integer(object(root.evidenceParams).softTierSpotCheckRatePpm);
    return observed === 25_000
      ? pass(observed, "Observed runtime API rate equals the documented design value")
      : fail(observed, "Runtime API audit rate differs from the documented design value; governance can change it");
  }
  if (claim.check === "registry") {
    const models = array(object(await context.call("flop_discover_models", { max_results: 1000 })).models).map(object);
    const registry = array(object(await context.call("flop_trust_root")).models).map(object);
    if (!models.length || !registry.length) return unavailable("Discovery or registry returned no models");
    const unknown = models.filter(
      (model) => !registry.some((entry) => text(entry.modelHash) === text(model.modelHash)),
    );
    return unknown.length
      ? fail(unknown, "Discovered model hashes are absent from the trust registry")
      : pass(
          { discovered: models.length, registered: registry.length },
          "Every discovered model hash is registered; these are separate snapshots",
        );
  }
  if (claim.check === "serving") {
    const discovery = object(await context.call("flop_discover_models", { max_results: 1000 }));
    if (discovery.availabilitySource !== "gateway") return unavailable("Discovery is not using gateway availability");
    const models = array(discovery.models).map(object);
    const gateway = array(object(await context.models()).data).map(object);
    if (!models.length || !gateway.length) return unavailable("No models to compare");
    const normalize = (name: unknown) => text(name).toLowerCase();
    const observed = models.map((model) => {
      const match = gateway.find((entry) => normalize(entry.id) === normalize(model.modelName));
      const sources = match ? array(object(match["x-flop"]).price_sources).map(object) : [];
      const miners = [...new Set(sources.map((source) => text(source.miner_address)))].sort();
      const actual = array(model.servingMiners).map(text).sort();
      return {
        model: model.modelHash,
        served: model.served,
        expectedServed: !!match,
        expectedMiners: miners,
        actualMiners: actual,
        onlineMinerCount: model.onlineMinerCount,
      };
    });
    const valid =
      observed.every(
        (row) =>
          row.served === row.expectedServed &&
          row.onlineMinerCount === row.expectedMiners.length &&
          JSON.stringify(row.expectedMiners) === JSON.stringify(row.actualMiners),
      ) && gateway.every((entry) => models.some((model) => normalize(model.modelName) === normalize(entry.id)));
    return valid
      ? pass(observed, "Gateway miners match discovery in these snapshots")
      : fail(observed, "Gateway and discovery availability differ; catalogue churn can cause a transient disagreement");
  }
  if (claim.check === "settlements") {
    const seen = new Set<string>();
    let offset = 0;
    let expectedTotal: number | undefined;
    const bad: unknown[] = [];
    for (;;) {
      const result = page(await context.call("flop_list_settlements", { limit: 100, offset }), 100, offset);
      if (!result.valid) return fail(result.pagination, "Settlement pagination is inconsistent");
      if (expectedTotal !== undefined && expectedTotal !== result.total)
        return unavailable("Settlement tape changed while paginating; no snapshot token is available");
      expectedTotal = result.total;
      for (const row of result.rows) {
        const settlement = parseSettlement(row);
        if (seen.has(settlement.channelId))
          return unavailable("Settlement pages overlap; cannot establish whole-tape coverage during churn");
        seen.add(settlement.channelId);
        if (!escrowConserved(settlement)) bad.push(row);
      }
      if (result.hasMore === false) break;
      if (!result.rows.length) return fail(result.pagination, "hasMore cannot advance an empty page");
      offset += result.rows.length;
    }
    if (!seen.size) return unavailable("Settlement tape is empty");
    if (seen.size !== expectedTotal) return unavailable("Could not establish whole-tape coverage");
    return bad.length
      ? fail(bad, "Exact raw-unit conservation failed")
      : pass(
          { rows: seen.size, total: expectedTotal },
          "Every observed settlement conserves escrow in integer arithmetic",
        );
  }
  if (claim.check === "pagination") {
    const tool = claim.tool ?? "flop_list_settlements";
    const first = page(await context.call(tool, { limit: 1, offset: 0 }), 1, 0);
    const second = page(await context.call(tool, { limit: 1, offset: 1 }), 1, 1);
    if (first.total !== second.total) return unavailable("The list changed between pagination reads");
    const observed = { first, second };
    if (!first.valid || !second.valid) return fail(observed, "limit, offset or hasMore violates pagination arithmetic");
    if (!first.rows.length) return unavailable("Empty list: offset movement cannot be verified");
    const whole = page(await context.call(tool, { limit: 2, offset: 0 }), 2, 0);
    if (whole.total !== first.total) return unavailable("The list changed between pagination reads");
    return whole.valid && JSON.stringify([...first.rows, ...second.rows]) === JSON.stringify(whole.rows)
      ? pass(observed, "Adjacent pages match the combined page")
      : fail(
          { ...observed, whole },
          "Offset slices do not match the combined page; concurrent edits can affect ordering",
        );
  }
  if (claim.check === "bad-input") {
    try {
      await context.call(claim.tool ?? "flop_list_settlements", claim.args ?? { limit: 0 }, true);
    } catch (error) {
      if (error instanceof McpError && (error.kind === "rpc" || error.kind === "tool"))
        return pass(
          { kind: error.kind, message: error.message, code: error.details.code ?? null },
          "Invalid input produced an explicit MCP error",
        );
      throw error;
    }
    return fail(null, "Input outside the published schema was accepted");
  }
  if (claim.check === "graphql") {
    const schema = object(
      await context.call("flop_indexer_query", { query: '{ __type(name: "Stats") { fields { name } } }' }),
    );
    const fields = array(object(schema.__type).fields).map((field) => text(object(field).name));
    const stats = object(object(await context.call("flop_get_stats")).stats);
    const missing = Object.keys(stats).filter((key) => !fields.includes(key));
    return missing.length
      ? fail({ missing, fields }, "MCP stats expose fields absent from the indexer Stats type")
      : pass({ fields, returned: Object.keys(stats) }, "Every returned MCP stats field is declared by GraphQL Stats");
  }
  if (claim.check === "simulated") {
    const value = object(await context.call("flop_verify_tee_quote", { quote_hex: "0x00" }));
    return value.verified === false && value.status === "unverified" && value.simulated === true
      ? pass(value, "Placeholder is explicitly labelled unverified; no attestation was verified")
      : fail(value, "Simulated verifier does not carry all advertised unverified markers");
  }
  if (claim.check === "probe" && claim.tool) {
    let args: Record<string, unknown>;
    try {
      args = await context.args(claim.args ?? {});
    } catch (error) {
      return unavailable(
        `Cannot obtain observed minimal input: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const tool = (await context.tools()).find((tool) => tool.name === claim.tool);
    if (!tool) return unavailable("Tool is no longer advertised");
    try {
      const value = await context.call(claim.tool, args);
      if (tool.outputSchema) {
        const errors = schemaErrors(tool.outputSchema, value);
        return errors.length
          ? fail({ errors, value }, "Response violates the advertised output schema")
          : pass(value, "Minimal input returned a response matching the advertised output schema");
      }
      if (typeof value === "string")
        return {
          status: "UNVERIFIABLE",
          observed: value,
          reason:
            "Tool returned text without an output schema; resource availability and semantics cannot be established",
        };
      if (value === null || typeof value !== "object")
        return unavailable("Tool returned no structured data or output schema");
      return pass(
        value,
        "Advertised minimal input returned structured data; no output schema or truth assertion is implied",
      );
    } catch (error) {
      if (error instanceof Unavailable) return unavailable(error.message);
      if (error instanceof McpError && error.kind === "tool")
        return fail(error.message, "Advertised minimal input returned a tool error");
      throw error;
    }
  }
  return unavailable("No executable predicate for this claim");
}
