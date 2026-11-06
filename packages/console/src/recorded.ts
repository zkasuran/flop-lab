// SPDX-License-Identifier: Apache-2.0
import { pickResponse } from "@flop-lab/mcp";
import tools from "../fixtures/tools.json";
import stats from "../fixtures/flop_get_stats.json";
import introspection from "../fixtures/flop_indexer_query.json";
import cost from "../fixtures/flop_estimate_cost.json";
import inference from "../fixtures/flop_estimate_inference_cost.json";
import pricing from "../fixtures/flop_get_model_pricing.json";
import comparison from "../fixtures/flop_compare_pricing.json";
import models from "../fixtures/models.json";
import { DEFAULT_MODEL, gatewayPrice, observation } from "./core";
import { completions } from "./query";
import { object, parseTools } from "./schema";
import type { Estimate } from "./service";

type Recording = {
  source: string;
  measuredAt: string;
  raw: string;
  request: { id: number; params?: { name: string; arguments: Record<string, unknown> } };
};

/** Dated real answers for initial rendering and offline examples. @example recordedConsole().catalog.tools.length */
export function recordedConsole() {
  const catalog = {
    tools: parseTools(object(pickResponse(tools.raw, tools.request.id).result).tools),
    source: tools.source,
    measuredAt: tools.measuredAt,
  };
  const decode = (record: Recording) => {
    const result = object(pickResponse(record.raw, record.request.id).result);
    if (!Array.isArray(result.content)) throw new Error("Recorded content is missing");
    const text = object(result.content[0]).text;
    if (typeof text !== "string" || !record.request.params) throw new Error("Invalid recorded call");
    const tool = catalog.tools.find((tool) => tool.name === record.request.params?.name);
    if (!tool) throw new Error("Recorded tool is absent");
    return {
      ...observation(tool, record.request.params.arguments, {
        value: JSON.parse(text) as unknown,
        raw: text,
        measuredAt: record.measuredAt,
        durationMs: 0,
        attempts: 1,
      }),
      durationMs: null,
    };
  };
  const indexer = decode(introspection);
  const estimate: Estimate = {
    input: { model: DEFAULT_MODEL, tokens: 1000, outputTokens: 500 },
    observations: [cost, inference, pricing, comparison].map(decode),
    errors: [],
    gateway: gatewayPrice(JSON.parse(models.raw), DEFAULT_MODEL, models.measuredAt),
    gatewayError: null,
  };
  return { catalog, stats: decode(stats), indexer, fields: completions(indexer.value), estimate };
}
