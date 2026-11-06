// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import styles from "./landing.module.css";

/**
 * The one heading pattern for landing sections: eyebrow, a short heading, one lede sentence and an optional
 * action. Example: <BlockHeading id="x" eyebrow="Findings" title="The arithmetic passes." lede="..." />.
 */
export function BlockHeading({
  id,
  eyebrow,
  title,
  lede,
  action,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className={`${styles.blockHead} reveal-soft`}>
      <div>
        <p className={`eyebrow ${styles.blockEyebrow}`}>
          <span aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 id={id}>{title}</h2>
      </div>
      {(lede || action) && (
        <div className={styles.blockAside}>
          {lede && <p className="muted">{lede}</p>}
          {action}
        </div>
      )}
    </header>
  );
}
