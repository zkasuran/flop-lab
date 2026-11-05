// SPDX-License-Identifier: Apache-2.0
"use client";
import { tools, toolHref } from "@/content/tools";
import { MotionLink, ReadingReveal } from "./motion";

export function ToolGrid() {
  return (
    <div className="tool-grid">
      {tools.map((tool, index) => (
        <MotionLink key={tool.slug} className="tool-card" href={toolHref(tool)}>
          <ReadingReveal order={index}>
            <div className="card-top">
              <span className="eyebrow">{tool.slug}</span>
              <span className={`badge ${tool.status}`}>{tool.status}</span>
            </div>
            <h3>{tool.name}</h3>
            <p>{tool.tagline}</p>
            <span className="card-link">{tool.status === "planned" ? tool.repoPath : "Open tool"} ↗</span>
          </ReadingReveal>
        </MotionLink>
      ))}
    </div>
  );
}
