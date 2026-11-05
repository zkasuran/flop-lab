// SPDX-License-Identifier: Apache-2.0
"use client";
import { sections, toolHref, toolsIn } from "@/content/tools";
import { MotionLink, ReadingReveal } from "./motion";

export function ToolGrid() {
  return (
    <div className="tool-sections">
      {sections.map((section) => {
        const list = toolsIn(section.id);
        if (!list.length) return null;
        return (
          <section key={section.id} className="tool-section" aria-labelledby={`section-${section.id}`}>
            <ReadingReveal order={0}>
              <div className="tool-section-head">
                <h3 id={`section-${section.id}`}>{section.title}</h3>
                <p>{section.question}</p>
              </div>
            </ReadingReveal>
            <div className="tool-grid">
              {list.map((tool, index) => (
                <MotionLink key={tool.slug} className="tool-card" href={toolHref(tool)}>
                  <ReadingReveal order={index + 1}>
                    <div className="card-top">
                      <span className="eyebrow">{tool.slug}</span>
                      <span className={`badge ${tool.status}`}>{tool.status}</span>
                    </div>
                    <h4>{tool.name}</h4>
                    <p>{tool.tagline}</p>
                    <span className="card-link">{tool.status === "planned" ? tool.repoPath : "Open tool"} ↗</span>
                  </ReadingReveal>
                </MotionLink>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
