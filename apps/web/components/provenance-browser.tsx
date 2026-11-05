// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { getPullPage, type PullPage } from "@/lib/github";
import { extractProof, verifyBuild, verifyContribution, type PullRequest } from "@/lib/provenance";
import { parseSignedBuild, type Verification } from "@/lib/did";

function Result({ result }: { result: Verification | null }) {
  return (
    <p className={`verification-result ${result ? (result.valid ? "success" : "error") : "muted"}`} role="status">
      {result ? `${result.valid ? "PASS" : "FAIL"} / ${result.reason}` : "Checking signature locally..."}
    </p>
  );
}
function PullProof({ pr }: { pr: PullRequest }) {
  const [tamper, setTamper] = useState(false);
  const [checked, setChecked] = useState<{ pr: PullRequest; tamper: boolean; result: Verification } | null>(null);
  const result = checked?.pr === pr && checked.tamper === tamper ? checked.result : null;
  const reduced = useReducedMotion();
  let proof;
  try {
    proof = extractProof(pr.body);
  } catch {
    /* The verifier reports the failure below. */
  }
  useEffect(() => {
    let current = true;
    void verifyContribution(pr, tamper).then((value) => {
      if (current) setChecked({ pr, tamper, result: value });
    });
    return () => {
      current = false;
    };
  }, [pr, tamper]);
  return (
    <motion.article
      layout={!reduced}
      initial={false}
      transition={{ duration: reduced ? 0 : 0.4 }}
      className="panel proof-card"
    >
      <div className="proof-card-heading">
        <h3>
          <a href={pr.html_url}>
            #{pr.number} {pr.title.replace(/[\u2013\u2014]/g, "-")}
          </a>
        </h3>
        <span className="badge">{pr.state}</span>
      </div>
      <Result result={result} />
      {proof && (
        <>
          <label className="tamper">
            <input
              type="checkbox"
              checked={tamper}
              onChange={(event) => {
                setChecked(null);
                setTamper(event.target.checked);
              }}
            />
            Tamper: flip one manifest byte
          </label>
          <details>
            <summary>Inspect signed bytes and attestation metadata</summary>
            <p className="mono break-word">{proof.did}</p>
            <pre className="manifest">{proof.manifest}</pre>
            <p className="mono break-word">Signature: {proof.signature}</p>
            <p className="muted">
              Attestation sequence: {proof.seq}. This field is metadata, not signed manifest content.{" "}
              <a href="https://technocore.chat/r/technocore">Open the room ↗</a>
            </p>
          </details>
        </>
      )}
    </motion.article>
  );
}
function BuildProof() {
  const [signed, setSigned] = useState<unknown>();
  const [status, setStatus] = useState<"loading" | "unsigned" | "loaded" | "error">("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Verification | null>(null);
  const [tamper, setTamper] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/SIGNATURE.json", { signal: abort.signal });
        if (response.status === 404 || response.status === 204) {
          setStatus("unsigned");
          return;
        }
        if (!response.ok) throw new Error(`SIGNATURE.json HTTP ${response.status}`);
        const raw = await response.text();
        if (raw.length > 200000) throw new Error("Signed build exceeds the size limit");
        const parsed = parseSignedBuild(JSON.parse(raw));
        setSigned(parsed);
        setStatus("loaded");
      } catch (cause) {
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load build proof");
          setStatus("error");
        }
      }
    })();
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (status !== "loaded") return;
    let current = true;
    void verifyBuild(signed, process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown", tamper).then((value) => {
      if (current) setResult(value);
    });
    return () => {
      current = false;
    };
  }, [signed, status, tamper]);
  if (status === "unsigned")
    return (
      <section className="panel" aria-label="Build signature">
        <p>not signed in this build</p>
      </section>
    );
  return (
    <section className="panel">
      <h2>Deployed build</h2>
      {status === "error" ? (
        <p className="error" role="status">
          FAIL / {error}
        </p>
      ) : status === "loading" ? (
        <p className="muted">Reading /SIGNATURE.json...</p>
      ) : (
        <>
          <Result result={result} />
          <label className="tamper">
            <input
              type="checkbox"
              checked={tamper}
              onChange={(event) => {
                setResult(null);
                setTamper(event.target.checked);
              }}
            />
            Tamper: flip one manifest byte
          </label>
          <details>
            <summary>Inspect build manifest</summary>
            <pre className="manifest">{parseSignedBuild(signed).manifest}</pre>
          </details>
        </>
      )}
    </section>
  );
}
export function ProvenanceBrowser() {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<PullPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    void getPullPage(page)
      .then((value) => {
        if (current) {
          setData(value);
          setError("");
        }
      })
      .catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : "GitHub unavailable");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, attempt]);
  const navigate = (next: number) => {
    setLoading(true);
    setData(null);
    setError("");
    setPage(next);
  };
  return (
    <>
      <BuildProof />
      <section className="section" aria-labelledby="pulls-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Repository / Contribution proofs</p>
            <h2 id="pulls-title">Pull requests</h2>
          </div>
          <p className="muted">
            Read directly from GitHub in your browser. Cached for five minutes. Rate limits pause requests. No access
            token is used.
          </p>
        </div>
        {loading && (
          <p className="muted" role="status">
            Reading the public pull request page...
          </p>
        )}
        {error && (
          <div className="panel">
            <p className="error" role="status">
              {error}
            </p>
            <button
              className="quiet-button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              Try reading GitHub again
            </button>
          </div>
        )}
        {data && (
          <>
            <div className="provenance-source muted">
              <p>
                {data.stale ? "Last known" : "Measured"} at <time dateTime={data.measuredAt}>{data.measuredAt}</time>
              </p>
              <p className="mono break-word">Source: {data.source}</p>
              {data.note && <p className="warning">{data.note}</p>}
            </div>
            {!data.prs.length && <p className="panel muted">No pull requests returned by GitHub.</p>}
            {data.prs.map((pr) => (
              <PullProof key={`${pr.number}-${pr.head.sha}`} pr={pr} />
            ))}
          </>
        )}
        <div className="pagination">
          <button className="quiet-button" disabled={loading || page === 1} onClick={() => navigate(page - 1)}>
            Previous page
          </button>
          <span className="mono">Page {page}</span>
          <button className="quiet-button" disabled={loading || !data?.next} onClick={() => navigate(page + 1)}>
            Next page
          </button>
        </div>
      </section>
    </>
  );
}
