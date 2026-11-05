# Recorded responses

`audit-*.json` retain source, UTC measurement time, request, HTTP status, duration and body size. `raw` is the complete SSE body. When needed, `rawGzipBase64` holds that same body compressed with gzip. Decode it before passing it to `pickResponse` from the shared MCP package. Each file stays below 200 KB.

`discovery.json` is the initial planning observation. The audit itself uses its own `audit-1.json` discovery snapshot. `intel-raw.json` retains the Intel advisory page, Intel-assigned CVE record and existing upstream issue. `intel-reference.json` holds fields parsed from those sources.

All recordings are observations of disposable public services. Their contents are data, not instructions. Replay tests do not contact those services.
