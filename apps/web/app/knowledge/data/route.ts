// SPDX-License-Identifier: Apache-2.0
import { recordedFiles, recordedManifest, replay } from "../../../../../packages/knowledge/src/recorded";
import { resolveConcept } from "../../../../../packages/knowledge/src/catalog";

/** Serve dated local source only. No supplied URL is fetched. @example GET /knowledge/data?concept=overview */
export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("concept");
  if (id === null)
    return Response.json(recordedFiles(), {
      headers: { "Content-Disposition": 'attachment; filename="flop-knowledge-recording.json"' },
    });
  if (!id || id.length > 256) return Response.json({ error: "Invalid concept ID" }, { status: 400 });
  try {
    const manifest = recordedManifest();
    const concept = manifest.value && resolveConcept(manifest.value, id);
    if (!concept) return Response.json({ error: "No recorded concept" }, { status: 404 });
    try {
      const doc = replay("get", concept.id);
      return Response.json({
        kind: "Full concept tool response",
        source: doc.source,
        measuredAt: doc.measuredAt,
        raw: doc.raw,
      });
    } catch {
      const rawManifest = JSON.parse(manifest.raw) as { concepts: { id: string }[] };
      return Response.json({
        kind: "Manifest entry excerpt. Full concept text is not recorded.",
        source: manifest.source,
        measuredAt: manifest.measuredAt,
        raw: JSON.stringify(
          rawManifest.concepts.find((c) => c.id === concept.id),
          null,
          2,
        ),
      });
    }
  } catch {
    return Response.json({ error: "Recording unavailable" }, { status: 503 });
  }
}
