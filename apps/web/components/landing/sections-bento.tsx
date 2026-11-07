// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { sections, toolsIn } from "@/content/tools";
import { ArrowRight, SectionIcon } from "../icons";
import { sectionHref } from "../suite/catalogue";
import { BlockHeading } from "./block-heading";
import styles from "./landing.module.css";

/**
 * The six suite sections as a bento of large cards. Counts come from the registry release labels.
 * Example: <SectionsBento />.
 */
export function SectionsBento() {
  return (
    <section className={styles.block} aria-labelledby="sections-title">
      <BlockHeading
        id="sections-title"
        eyebrow="What you can do"
        title="Six ways to question a network."
        lede="Each section answers one kind of question. Each tool answers one question inside it."
      />
      <ul className={styles.bento}>
        {sections.map((section, index) => {
          const list = toolsIn(section.id);
          const available = list.filter((tool) => tool.status !== "planned");
          return (
            <li key={section.id} className={styles.bentoCell} data-cell={index}>
              <Link
                prefetch={false}
                href={sectionHref(section.id)}
                className={`${styles.bentoCard} reveal`}
                data-spotlight
                data-cursor="open"
                data-cursor-label="Explore"
              >
                <span className={styles.bentoArt} aria-hidden="true">
                  <SectionIcon section={section.id} size={168} strokeWidth={0.5} />
                </span>
                <span className={styles.bentoTop}>
                  <span className={styles.bentoIcon} aria-hidden="true">
                    <SectionIcon section={section.id} size={18} />
                  </span>
                  <span className={styles.bentoIndex}>{String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className={styles.bentoTitle}>{section.title}</span>
                <span className={styles.bentoQuestion}>{section.question}</span>
                <span className={styles.bentoTools}>
                  {available.slice(0, 4).map((tool) => (
                    <span key={tool.slug} className={styles.bentoTool}>
                      {tool.name}
                    </span>
                  ))}
                  {available.length > 4 && <span className={styles.bentoMore}>+{available.length - 4} more</span>}
                </span>
                <span className={styles.bentoFoot}>
                  <span className="mono">
                    {available.length} of {list.length} available
                  </span>
                  <ArrowRight />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
