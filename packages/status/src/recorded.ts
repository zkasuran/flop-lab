// SPDX-License-Identifier: Apache-2.0
import first from "../test/fixtures/2026-11-06T05-23-46.400Z/run.json";
import second from "../test/fixtures/2026-11-06T05-29-43.883Z/run.json";
import { parseRun } from "./schema";
export const recordings = [parseRun(first), parseRun(second)];
