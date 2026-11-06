// SPDX-License-Identifier: Apache-2.0
import type { PromiseLedger as Ledger } from "@/lib/evidence";
import { statusLabel } from "@/lib/status";
import { utc } from "@/app/harness/model";
import { MotionLink, ReadingReveal } from "../motion";
import { ArrowRight, ArrowUpRight } from "../icons";
import { SectionHeading } from "./section-heading";
import styles from "./home.module.css";

/** Documented promises beside recorded check results. Example: <PromiseLedger ledger={await readPromiseLedger(run)} />. */
export function PromiseLedger({ ledger }: { ledger: Ledger }) {
  return (
    <section className="section" id="promises" aria-labelledby="promises-heading">
      <SectionHeading
        index="02"
        eyebrow="The promise / The outside view"
        id="promises-heading"
        title="Proofs should stand up to questions."
      >
        FLOP promises verified AI inference. Each promise sits next to what public data lets us check today and the
        recorded checks behind it.{" "}
        <MotionLink href="https://docs.flop.network/docs/verification-stack">
          Read the design <ArrowUpRight size={13} />
        </MotionLink>
      </SectionHeading>
      <div className={styles.ledger}>
        <div className={styles.ledgerHeader} aria-hidden="true">
          <span />
          <span>The promise</span>
          <span>The outside view</span>
          <span>Recorded checks</span>
        </div>
        {ledger.rows.map((row, index) => (
          <ReadingReveal key={row.promise} order={index}>
            <article className={styles.ledgerRow} aria-labelledby={`promise-${index}`}>
              <span className={styles.ledgerIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 id={`promise-${index}`} className={styles.ledgerPromise}>
                {row.promise}
              </h3>
              <div className={styles.ledgerOutside}>
                <p className="muted">{row.outside}</p>
                <MotionLink className="text-link" href={row.href}>
                  {row.action} <ArrowRight />
                </MotionLink>
              </div>
              <ul className={styles.ledgerChips} aria-label="Recorded checks">
                {row.chips.map((chip) => (
                  <li key={`${chip.tool}-${chip.id}`} title={`${chip.tool} / ${chip.id}`}>
                    <span className={styles.chipSource}>{chip.tool}</span>
                    <span className={styles.chipTitle}>{chip.title}</span>
                    <span className={styles.statusChip} data-status={chip.status ?? "MISSING"}>
                      {chip.status ? statusLabel(chip.status) : "Not recorded"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </ReadingReveal>
        ))}
      </div>
      <p className={styles.ledgerNote}>
        Harness results from the run recorded{" "}
        {ledger.harnessAt ? <time dateTime={ledger.harnessAt}>{utc(ledger.harnessAt)}</time> : "at an unknown time"}.
        Verifier results from the channel captured{" "}
        {ledger.verifierAt ? <time dateTime={ledger.verifierAt}>{utc(ledger.verifierAt)}</time> : "at an unknown time"}.
        A pass is a narrow claim about named inputs.
      </p>
    </section>
  );
}
