// SPDX-License-Identifier: Apache-2.0
import { Fragment, type ReactNode } from "react";
import { MotionLink } from "../../components/motion";
import { readmeHref, type Block } from "./model";
import styles from "./docs.module.css";

function inline(text: string, source: string): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern = /(`+)([^`]*?)\1|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|<(https:\/\/[^>]+)>/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    result.push(text.slice(offset, match.index));
    if (match[1]) result.push(<code key={match.index}>{match[2]}</code>);
    else if (match[3] || match[7]) {
      const target = readmeHref(match[4] ?? match[7]!, source);
      const label = match[3] ?? match[7]!;
      result.push(
        target ? (
          <MotionLink key={match.index} href={target}>
            {label}
          </MotionLink>
        ) : (
          label
        ),
      );
    } else if (match[5]) result.push(<strong key={match.index}>{match[5]}</strong>);
    else result.push(<em key={match.index}>{match[6]}</em>);
    offset = match.index + match[0].length;
  }
  result.push(text.slice(offset));
  return result;
}

/** Render inert README blocks. Source HTML stays text. Example: <Readme blocks={doc.blocks} source={doc.source} />. */
export function Readme({ blocks, source }: { blocks: Block[]; source: string }) {
  return (
    <div className={styles.prose}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const Tag = `h${Math.min(6, block.depth + 1)}` as "h2" | "h3" | "h4" | "h5" | "h6";
            return (
              <Tag key={index} id={block.id}>
                {block.title}
              </Tag>
            );
          }
          case "code":
            return (
              <pre key={index} tabIndex={0} aria-label={block.language ? `${block.language} example` : "Code example"}>
                <code>{block.text}</code>
              </pre>
            );
          case "paragraph":
            return <p key={index}>{inline(block.text, source)}</p>;
          case "quote":
            return <blockquote key={index}>{inline(block.text, source)}</blockquote>;
          case "rule":
            return <hr key={index} />;
          case "list": {
            const items = block.items.map((item, i) => <li key={i}>{inline(item, source)}</li>);
            return block.ordered ? (
              <ol key={index} start={block.start}>
                {items}
              </ol>
            ) : (
              <ul key={index}>{items}</ul>
            );
          }
          case "table":
            return (
              <div key={index} className={styles.table} tabIndex={0} role="region" aria-label="README table">
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, i) => (
                        <th scope="col" key={i}>
                          {inline(cell, source)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{inline(cell, source)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <Fragment key={index} />;
        }
      })}
    </div>
  );
}
