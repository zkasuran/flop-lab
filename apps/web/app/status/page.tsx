// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { pageHistory } from "./data";
import { StatusView } from "./view";
export const revalidate = 300;
export const metadata: Metadata = {
  title: "Service status",
  description: "Dated public service probes, measured response times and sample-based availability.",
};
export default async function StatusPage() {
  return <StatusView history={await pageHistory()} />;
}
