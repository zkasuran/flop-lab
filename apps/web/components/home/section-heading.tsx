// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { ReadingReveal } from "../motion";

/** Numbered home section heading. Example: <SectionHeading index="01" eyebrow="Findings" id="f" title="...">Text</SectionHeading>. */
export function SectionHeading({
  index,
  eyebrow,
  title,
  id,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  id: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <ReadingReveal>
        <p className="eyebrow section-index">
          <b>{index}</b>
          <i aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 id={id}>{title}</h2>
      </ReadingReveal>
      {children && (
        <ReadingReveal order={1}>
          <p className="muted">{children}</p>
        </ReadingReveal>
      )}
    </div>
  );
}
