// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from "node:fs";
import { pickResponse } from "@flop-lab/mcp";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import type { Evidence } from "../src/types";
import { object } from "../src/validation";

const directory = new URL("../fixtures/", import.meta.url);
const records = readdirSync(directory)
  .filter((name) => /^run-\d+\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as Evidence);

function key(body: string): string {
  const parsed = object(JSON.parse(body));
  return JSON.stringify({ method: parsed.method, params: parsed.params });
}

export function recordedFetch(mutate?: (name: string, value: unknown) => unknown): typeof fetch {
  return async (url, init) => {
    const body = init?.body ? String(init.body) : undefined;
    const record = records.find(
      (item) =>
        item.request.url === String(url) &&
        (body ? item.request.body && key(item.request.body) === key(body) : !item.request.body),
    );
    if (!record) throw new Error(`No recorded request: ${String(url)} ${body ?? ""}`);
    if (record.error) throw new Error(record.error);
    if (!body) {
      const value: unknown = JSON.parse(record.response);
      return new Response(JSON.stringify(mutate ? mutate("gateway", value) : value), { status: record.status ?? 200 });
    }
    const request = object(JSON.parse(body));
    const params = request.params ? object(request.params) : {};
    const name = request.method === "tools/list" ? "tools-list" : String(params.name);
    let raw = record.response;
    if (mutate && name !== "tools-list") {
      const message = pickResponse(raw, Number(object(JSON.parse(record.request.body!)).id));
      const result = object(message.result);
      const content = result.content as { type: string; text: string }[];
      const item = content.find((item) => item.type === "text");
      if (item) {
        let value: unknown;
        try {
          value = JSON.parse(item.text);
        } catch {
          value = item.text;
        }
        item.text = JSON.stringify(mutate(name, value));
      }
      raw = JSON.stringify(message);
    }
    return replayFetch({ [name === "tools-list" ? name : `call-${name}`]: raw })(url, init);
  };
}
