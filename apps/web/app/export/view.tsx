// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ToolHeader } from "@/components/tool-header";
import { CopyButton } from "@/components/controls";
import { Disclosure, MotionButton, MotionLink, ObservedNumber, ReadingPath, ReadingReveal } from "@/components/motion";
import { datasets, formats, type Dataset, type Format } from "../../../../packages/export/src/schema";
import { commandFor, type Sample } from "./model";
import styles from "./view.module.css";

const labels: Record<Dataset, string> = {
  settlements: "Settlements",
  channels: "Compute channels",
  blocks: "Blocks",
  transactions: "Transactions",
  accounts: "Supplied accounts",
  models: "Models",
  "price-sources": "Price sources",
  proofs: "Proof submissions",
  snapshots: "Recorder observations",
};
const hints: Record<Dataset, string> = {
  settlements: "Exact amounts in raw source units. No conversion to FLOP.",
  channels: "Indexed channel states can change between reads.",
  blocks: "Source row order is preserved. This is not a pinned chain snapshot.",
  transactions: "Arguments and success integers retain their source representation.",
  accounts: "The public schema has no account list. Live exports need one address per line in addresses.txt.",
  models: "Model-level quote units are absent from the recorded gateway response.",
  "price-sources": "Advertised addresses and quote intervals. No per-address price is supplied.",
  proofs: "An empty indexed proof page does not establish missing session evidence.",
  snapshots: "One row per recorder observation. Live mode reads your local archive directory.",
};
export function ExportView({ samples }: { samples: Sample[] }) {
  const [dataset, setDataset] = useState<Dataset>("settlements");
  const [format, setFormat] = useState<Format>("csv");
  const [offset, setOffset] = useState("0"),
    [rows, setRows] = useState("100");
  const [recorded, setRecorded] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const reduced = useReducedMotion() !== false,
    duration = reduced ? 0 : 0.24;
  const sample = samples.find((s) => s.dataset === dataset)!;
  const command = commandFor({ dataset, format, offset, rows, recorded });
  const preview = command ? sample.rows.slice(Number(offset), Number(offset) + Math.min(5, Number(rows))) : [];
  const ratio = sample.rows.length ? preview.length / sample.rows.length : 0;
  const visibleColumns = sample.columns.filter((c) => !["source", "measuredAt"].includes(c.name)).slice(0, 5);
  function changeDataset(value: Dataset) {
    setDataset(value);
    setOffset("0");
    setExpanded(null);
  }
  return (
    <main className={`container ${styles.page}`}>
      <ToolHeader slug="export" />
      <ReadingReveal order={2}>
        <p className={styles.intro}>
          Dated devnet rows for your spreadsheet or notebook. Choose a range, inspect the columns and run a bounded
          export on your machine.
        </p>
      </ReadingReveal>
      <div className={styles.workspace}>
        <ReadingReveal order={3} className={styles.builder}>
          <section aria-labelledby="choose-export">
            <p className="eyebrow">Build an export</p>
            <h2 id="choose-export">Choose your rows</h2>
            <label className={styles.field} htmlFor="dataset">
              Dataset
            </label>
            <motion.select
              id="dataset"
              value={dataset}
              onChange={(e) => changeDataset(e.target.value as Dataset)}
              whileFocus={reduced ? undefined : { scale: 1.01 }}
              transition={{ duration }}
            >
              {datasets.map((key) => (
                <option key={key} value={key}>
                  {labels[key]}
                </option>
              ))}
            </motion.select>
            <p className={styles.hint}>{hints[dataset]}</p>
            <div className={styles.range}>
              <label>
                First row offset
                <motion.input
                  aria-label="First row offset"
                  type="number"
                  min="0"
                  max="2000000000"
                  value={offset}
                  onChange={(e) => {
                    setOffset(e.target.value);
                    setExpanded(null);
                  }}
                  whileFocus={reduced ? undefined : { scale: 1.01 }}
                  transition={{ duration }}
                />
              </label>
              <label>
                Maximum rows
                <motion.input
                  aria-label="Maximum rows"
                  type="number"
                  min="1"
                  max="1000000"
                  value={rows}
                  onChange={(e) => {
                    setRows(e.target.value);
                    setExpanded(null);
                  }}
                  whileFocus={reduced ? undefined : { scale: 1.01 }}
                  transition={{ duration }}
                />
              </label>
            </div>
            <p className={styles.hint}>Offsets count rows in source order. They are not block numbers or dates.</p>
            <fieldset className={styles.formats}>
              <legend>Output format</legend>
              <div>
                {formats.map((value) => (
                  <MotionButton
                    className={styles.format}
                    key={value}
                    aria-pressed={format === value}
                    onClick={() => setFormat(value)}
                  >
                    {format === value && (
                      <motion.span
                        className={styles.selection}
                        layoutId={reduced ? undefined : "export-format"}
                        transition={{ duration }}
                      />
                    )}
                    <span>{value.toUpperCase()}</span>
                  </MotionButton>
                ))}
              </div>
            </fieldset>
            <p className={styles.hint}>
              {format === "csv"
                ? "Quoted UTF-8 cells. Import string columns as text. Formula-leading strings are prefixed."
                : format === "ndjson"
                  ? "One JSON object per line. Nulls and exact amount strings are preserved."
                  : "Typed columns in independently readable parts. Empty files keep their schema."}
            </p>
            <fieldset className={styles.mode}>
              <legend>Command input</legend>
              <MotionButton className="quiet-button" aria-pressed={recorded} onClick={() => setRecorded(true)}>
                Recorded sample
              </MotionButton>
              <MotionButton className="quiet-button" aria-pressed={!recorded} onClick={() => setRecorded(false)}>
                Live or local source
              </MotionButton>
            </fieldset>
            <p className={styles.hint}>
              {recorded
                ? "The command replays these dated rows without network calls."
                : "The CLI reads current public data or your local archive. The preview remains recorded."}
            </p>
          </section>
        </ReadingReveal>
        <ReadingReveal order={4} className={styles.preview}>
          <section aria-labelledby="preview-export">
            <div className={styles.previewHead}>
              <div>
                <p className="eyebrow">Recorded preview</p>
                <h2 id="preview-export">{labels[dataset]}</h2>
              </div>
              <div className={styles.count}>
                <ObservedNumber value={preview.length} />
                <span>shown / {sample.rows.length} recorded</span>
              </div>
            </div>
            <div className={styles.bar} aria-hidden="true">
              <motion.div data-preview-bar initial={false} animate={{ scaleX: ratio }} transition={{ duration }} />
            </div>
            <p className={styles.dates}>
              Source read:{" "}
              {sample.measuredAt.map((at) => (
                <time key={at} dateTime={at}>
                  {at}
                </time>
              ))}
            </p>
            <div className={styles.tableWrap}>
              <table>
                <caption className={styles.caption}>
                  First matching recorded rows. Inspect a row for every column.
                </caption>
                <thead>
                  <tr>
                    {visibleColumns.map((c) => (
                      <th scope="col" key={c.name}>
                        {c.name}
                      </th>
                    ))}
                    <th scope="col">Inspect</th>
                  </tr>
                </thead>
                <motion.tbody layout={!reduced}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {preview.map((row, index) => (
                      <motion.tr
                        key={`${dataset}-${offset}-${index}`}
                        layout={!reduced}
                        initial={{ opacity: 1, y: reduced ? 0 : 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: reduced ? 1 : 0 }}
                        transition={{ duration, delay: reduced ? 0 : index * 0.025 }}
                      >
                        {visibleColumns.map((c) => (
                          <td key={c.name} title={row[c.name] === null ? "null" : String(row[c.name])}>
                            <span>{row[c.name] === null ? <em>null</em> : String(row[c.name])}</span>
                          </td>
                        ))}
                        <td>
                          <MotionButton
                            className="quiet-button"
                            aria-expanded={expanded === index}
                            aria-controls="export-row-detail"
                            onClick={() => setExpanded(expanded === index ? null : index)}
                          >
                            Row {Number(offset) + index + 1}
                          </MotionButton>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </motion.tbody>
              </table>
              {!preview.length && (
                <p className={styles.empty} role="status">
                  {!command
                    ? "Enter a valid row range to preview."
                    : sample.rows.length === 0
                      ? "No rows in this recorded response."
                      : "This range is outside the recorded sample. Live output can differ."}
                </p>
              )}
            </div>
            <AnimatePresence initial={false}>
              {expanded !== null && preview[expanded] && (
                <motion.div
                  className={styles.detail}
                  id="export-row-detail"
                  layout={!reduced}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration }}
                >
                  <h3>Row {Number(offset) + expanded + 1}: full values</h3>
                  <pre>{JSON.stringify(preview[expanded], null, 2)}</pre>
                </motion.div>
              )}
            </AnimatePresence>
            <p className={styles.hint}>
              The preview is a bounded sample, not a network total. Large downloads run through the CLI.
            </p>
          </section>
        </ReadingReveal>
      </div>
      <ReadingReveal order={5}>
        <section className={styles.command} aria-labelledby="run-export">
          <div>
            <p className="eyebrow">Run in your checkout</p>
            <h2 id="run-export">Keep the data and its context</h2>
            <p>
              Run <code>pnpm install --frozen-lockfile</code> and <code>pnpm build</code> from the repository root
              first. Use an empty output directory.
            </p>
          </div>
          {command ? (
            <>
              <pre data-export-command>{command}</pre>
              <CopyButton text={command} label="Copy export command" />
            </>
          ) : (
            <p role="alert">Use a whole-number offset from 0 to 2000000000 and a row count from 1 to 1000000.</p>
          )}
          <p className={styles.hint}>
            The command permits at most 10 HTTP attempts. Partial output is resumable. See the CLI report before
            starting another run.
          </p>
          <Disclosure title="Resume this output">
            <pre>{`node packages/cli/dist/cli.js export --resume --out ./export-${dataset}-${format} --max-requests 10`}</pre>
            <p>Saved bytes and the last source page are checked. A moved boundary stops the resume.</p>
          </Disclosure>
        </section>
      </ReadingReveal>
      <section className={styles.schema}>
        <Disclosure title={`Stable columns: ${labels[dataset]}`}>
          <div className={styles.columns}>
            {sample.columns.map((c) => (
              <div key={c.name}>
                <code>{c.name}</code>
                <span>
                  {c.type}
                  {c.nullable ? " or null" : ""}
                </span>
              </div>
            ))}
          </div>
          <p>
            Amounts remain decimal strings. Event timestamps retain source units. Every row includes its source and
            measuredAt time.
          </p>
        </Disclosure>
        <Disclosure title="Sources and file manifests">
          <ul>
            {sample.sources.map((source) => (
              <li key={source}>
                {source.startsWith("https://") ? (
                  <MotionLink href={source}>{source}</MotionLink>
                ) : (
                  <code>{source}</code>
                )}
              </li>
            ))}
          </ul>
          <p>
            Every part has a sidecar manifest with the query, source dates, row count, schema and SHA-256 of the exact
            file bytes. Hashes do not authenticate their sidecars.
          </p>
          <MotionLink href={`https://github.com/zkasuran/flop-lab/blob/main/packages/export/fixtures/${dataset}.json`}>
            Read the raw recording ↗
          </MotionLink>
        </Disclosure>
      </section>
      <ReadingPath
        title="From source to notebook"
        steps={[
          {
            title: "Read within a budget",
            text: "The CLI pages public sources. Every HTTP attempt counts, including retries. Recorder input stays local.",
          },
          {
            title: "Write one complete part",
            text: "Rows use stable types. A CSV, NDJSON or Parquet part becomes committed when its sidecar is written.",
          },
          {
            title: "Carry the manifest with the rows",
            text: "Source dates and file hashes travel with the data. Resume rechecks saved files and the last page before reading on.",
          },
        ]}
      />
      <section className={styles.limits}>
        <h2>What this does not verify</h2>
        <p>
          These rows do not prove chain completeness, finality, inference correctness or proof validity. Mutable offsets
          can skip rows between sequential reads. A completed range is not a whole-chain snapshot. Devnet can reset.
        </p>
      </section>
    </main>
  );
}
