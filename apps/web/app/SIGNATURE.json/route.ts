// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  for (const file of [resolve(process.cwd(), "../../SIGNATURE.json"), resolve(process.cwd(), "SIGNATURE.json")]) {
    try {
      // The exact manifest file is traced explicitly in next.config.ts.
      if ((await stat(/* turbopackIgnore: true */ file)).size > 400000)
        return new Response("Build proof is too large", { status: 413 });
      return new Response(await readFile(/* turbopackIgnore: true */ file, "utf8"), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT")
        return new Response("Build proof unavailable", { status: 503 });
    }
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
