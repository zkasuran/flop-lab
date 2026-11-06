// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { recordedSnapshot } from "../../../../packages/community/src/recorded";
import { rows } from "../../../../packages/community/src/model";
import { CommunityView } from "./view";

export const metadata: Metadata = {
  title: "Community pulse | flop-lab",
  description:
    "Read dated public requests by area and age. Inspect observed response times and check access-form fields locally.",
};

export default function CommunityPage() {
  const snapshot = recordedSnapshot();
  return (
    <CommunityView
      report={{
        measuredAt: snapshot.measuredAt,
        repos: snapshot.repos.map(({ items, ...repo }) => ({ ...repo, count: items.length })),
        chat: snapshot.chat,
        items: rows(snapshot).map(({ responses, ...item }) => ({ ...item, responseCount: responses.length })),
      }}
    />
  );
}
