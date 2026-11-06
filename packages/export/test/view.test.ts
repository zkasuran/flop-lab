// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { commandFor } from "../../../apps/web/app/export/model";
describe("export command builder", () => {
  const selection = { dataset: "blocks", format: "csv", offset: "0", rows: "100", recorded: true } as const;
  it("uses the same validated row range as the CLI and selects recorded or live inputs", () => {
    expect(commandFor(selection)).toBe(
      "node packages/cli/dist/cli.js export blocks --recorded --format csv --offset 0 --rows 100 --max-requests 10 --out ./export-blocks-csv",
    );
    expect(commandFor({ ...selection, dataset: "accounts", recorded: false })).toContain("--addresses ./addresses.txt");
    expect(commandFor({ ...selection, dataset: "snapshots", recorded: false })).toContain("--archive ./archive");
  });
  it("rejects injection, empty values and out-of-bounds ranges", () => {
    for (const offset of ["", "-1", "1.2", "2;whoami", "2000000001"])
      expect(commandFor({ ...selection, offset })).toBeNull();
    for (const rows of ["0", "1000001", "NaN", "1e3", "$(id)"]) expect(commandFor({ ...selection, rows })).toBeNull();
  });
});
