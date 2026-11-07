// SPDX-License-Identifier: Apache-2.0
import { paletteEntries } from "@/components/suite/docs";
import { languageMetadata } from "../routes";
import { docs } from "../translations/docs";
import { DocsView } from "./view";
export const metadata = { ...languageMetadata("/docs", "zh"), title: docs.zh.title, description: docs.zh.question };
export default async function Page() {
  return <DocsView locale="zh" entries={await paletteEntries()} />;
}
