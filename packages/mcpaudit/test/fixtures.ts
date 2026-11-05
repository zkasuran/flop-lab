// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { Trace } from "../src/types";
const directory = new URL("../fixtures/", import.meta.url);
export const traces = readdirSync(directory)
  .filter((name) => /^audit-\d+\.json$/.test(name))
  .map((name) => {
    const record = JSON.parse(readFileSync(new URL(name, directory), "utf8")) as Trace & { rawGzipBase64?: string };
    return {
      ...record,
      raw: record.rawGzipBase64 ? gunzipSync(Buffer.from(record.rawGzipBase64, "base64")).toString("utf8") : record.raw,
    };
  })
  .sort((a, b) => a.id - b.id);
