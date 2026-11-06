// SPDX-License-Identifier: Apache-2.0
import { createApi } from "../../../../../../packages/openapi/src/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// HTTP stays dynamic so the per-IP limiter runs on every read. Validated data caches for 300 seconds in createApi.
const serve = createApi();
export const GET = serve;
export const HEAD = serve;
export const POST = serve;
export const PUT = serve;
export const PATCH = serve;
export const DELETE = serve;
export const OPTIONS = serve;
