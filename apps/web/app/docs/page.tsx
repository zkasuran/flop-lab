// SPDX-License-Identifier: Apache-2.0
import { paletteEntries } from "@/components/suite/docs";
import { DocsView } from "../zh/docs/view";
import { docs } from "../zh/translations/docs";
import { languageMetadata } from "../zh/routes";
export const metadata = { ...languageMetadata("/docs", "en"), title: docs.en.title, description: docs.en.question };
export default async function Page() {
  return <DocsView locale="en" entries={await paletteEntries()} />;
}
