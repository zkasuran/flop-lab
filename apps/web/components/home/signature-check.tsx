// SPDX-License-Identifier: Apache-2.0
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Story } from "@/app/about/recording";
import { parseManifest, type Verification } from "@/lib/did";
import { extractProof, verifyContribution } from "@/lib/provenance";
import { EASE_OUT, MotionButton } from "../motion";
import styles from "./home.module.css";

function shortHashLine(line: string): string {
  const [hash = "", ...rest] = line.split("  ");
  return hash.length > 16 ? `${hash.slice(0, 12)}…  ${rest.join("  ")}` : line;
}

/**
 * Verify a real recorded pull request signature in this browser. Flipping the first byte is the negative control.
 * Example: <SignatureCheck story={readStory()!} />.
 */
export function SignatureCheck({ story }: { story: Story }) {
  const reduced = useReducedMotion() !== false;
  const [tamper, setTamper] = useState(false);
  const [checked, setChecked] = useState<{ tamper: boolean; result: Verification } | null>(null);
  const result = checked?.tamper === tamper ? checked.result : null;
  useEffect(() => {
    let current = true;
    void verifyContribution(story.pr, tamper).then((value) => {
      if (current) setChecked({ tamper, result: value });
    });
    return () => {
      current = false;
    };
  }, [story.pr, tamper]);
  let lines: string[] = [];
  let files = 0;
  let signature = "";
  try {
    const proof = extractProof(story.pr.body);
    lines = proof.manifest.split("\n");
    files = parseManifest(proof.manifest).files.length;
    signature = proof.signature;
  } catch {
    /* The verifier reports malformed proofs in the result line. */
  }
  const head = lines[0] ?? "";
  const first = head.charAt(0);
  const flipped = first ? String.fromCharCode(first.charCodeAt(0) ^ 1) : "";
  const shown = lines.slice(1, 3).map(shortHashLine);
  return (
    <div className={`${styles.signature} frame`}>
      <div className={styles.signatureHead}>
        <p className="eyebrow">Signed manifest / pull request {story.pr.number}</p>
        <span className={`badge ${result ? (result.valid ? "success" : "warning") : ""}`}>
          {result ? (result.valid ? "PASS" : "FAIL") : "Checking"}
        </span>
      </div>
      {head && (
        <pre className={styles.manifestPreview} aria-label="First lines of the signed manifest">
          <motion.span
            key={tamper ? "flipped" : "original"}
            className={styles.signedByte}
            data-flipped={tamper}
            initial={{ y: reduced ? 0 : tamper ? "-60%" : "60%", opacity: reduced ? 1 : 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT }}
          >
            {tamper ? flipped : first}
          </motion.span>
          {head.slice(1)}
          {shown.map((line) => `\n${line}`)}
          {"\n"}
          <span className="muted">+ {Math.max(0, files - shown.length)} more file hashes</span>
        </pre>
      )}
      {signature && (
        <p className={styles.signatureLine}>
          Ed25519 signature <code>{signature.slice(0, 22)}…</code>
        </p>
      )}
      <p className={`verification-result ${result ? (result.valid ? "success" : "error") : "muted"}`} role="status">
        {result
          ? `${result.valid ? "PASS" : "FAIL"} / ${result.reason}`
          : "Checking the recorded signature in this browser..."}
      </p>
      <div className={styles.signatureActions}>
        <MotionButton className="quiet-button" aria-pressed={tamper} onClick={() => setTamper(!tamper)}>
          {tamper ? "Restore the signed byte" : `Flip the first byte: ${first} to ${flipped}`}
        </MotionButton>
      </div>
    </div>
  );
}
