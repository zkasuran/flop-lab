// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { definitions, endpoints } from "../../../../packages/openapi/src/schema";
import { readResult } from "../../../../packages/openapi/src/recorded";
import { Reference } from "./reference";
export const metadata: Metadata = {
  title: "Suite API",
  description:
    "Read dated suite results through a versioned JSON API. Inspect response schemas, source dates and copyable curl commands.",
};
export default function OpenAPIPage() {
  return (
    <Reference
      entries={endpoints.map((tool) => ({
        title: definitions[tool].title,
        page: definitions[tool].page,
        result: readResult(tool),
      }))}
    />
  );
}
