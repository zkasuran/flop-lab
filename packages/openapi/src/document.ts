// SPDX-License-Identifier: Apache-2.0
import {
  definitions,
  documentSchema,
  endpoints,
  errorSchema,
  revalidateSeconds,
  resultSchema,
  schemaVersion,
} from "./schema";

/** Generate the contract directly from the response schemas. @example openapiDocument().paths */
export function openapiDocument() {
  const response = <T>(description: string, schema: T) => ({
    description,
    content: { "application/json": { schema } },
  });
  const paths = Object.fromEntries(
    [...endpoints, "openapi.json"].map((tool) => {
      const summary =
        tool === "openapi.json" ? "OpenAPI document" : definitions[tool as keyof typeof definitions].title;
      const responses = {
        "200": response(summary, {
          $ref: `#/components/schemas/${tool === "openapi.json" ? "OpenAPIDocument" : tool}`,
        }),
        "400": response("Query parameters are not accepted", { $ref: "#/components/schemas/Error" }),
        "404": response("Unknown endpoint", { $ref: "#/components/schemas/Error" }),
        "405": response("Read-only endpoint", { $ref: "#/components/schemas/Error" }),
        "429": {
          ...response("Per-instance IP quota reached", { $ref: "#/components/schemas/Error" }),
          headers: {
            "Retry-After": {
              description: "Seconds until the quota window resets",
              schema: { type: "integer", minimum: 1 },
            },
          },
        },
        "503": response("Bundled result failed validation", { $ref: "#/components/schemas/Error" }),
      };
      return [
        `/api/v1/${tool}`,
        {
          get: {
            operationId: tool === "openapi.json" ? "getOpenAPI" : `get_${tool}`,
            summary,
            description: `Read-only bundled evidence. Cache revalidation is ${revalidateSeconds} seconds. Observation times never advance on reads. No query parameters.`,
            responses,
          },
          head: {
            operationId: `head_${tool.replace(".", "_")}`,
            summary: `${summary} headers`,
            responses: Object.fromEntries(
              Object.entries(responses).map(([code, value]) => [code, { description: value.description }]),
            ),
          },
        },
      ];
    }),
  );
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "FLOP suite results",
      version: schemaVersion,
      description:
        "Dated recorded evidence, not current network health. Rate limit: 60 reads per IP per 60 seconds per server instance. Private responses prevent shared caches from bypassing the limiter.",
      license: { name: "Apache-2.0", identifier: "Apache-2.0" },
    },
    servers: [{ url: "/" }],
    paths,
    components: {
      schemas: {
        ...Object.fromEntries(endpoints.map((tool) => [tool, resultSchema(tool)])),
        Error: errorSchema,
        OpenAPIDocument: documentSchema,
      },
    },
  };
}
