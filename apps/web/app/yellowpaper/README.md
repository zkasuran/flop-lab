# Yellowpaper reader page

What does the pinned paper say beside the public value? This page renders the full recorded yellowpaper on the server. Client-side search covers headings, glossary rows, parameter names and Appendix E items. A parameter drawer shows exact pinned and catalog values with dates and links.

## Run

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3680
```

Open http://localhost:3680/yellowpaper. Search for `dispute window`, select the parameter and inspect its catalog evidence. Escape closes the drawer and returns focus. The full document and normal anchor links are readable without JavaScript.

The page makes no network requests for evidence. It uses the same validated paper and catalog as `flop spec-read`. Public issue states are dated recordings. Open the issue-state panel for public citations, related discussions and unmapped internal references.

## Motion and performance

The shared header reveals the question, command and pin in reading order. The measured catalog coverage bar fills from real counts. Search filters share a layout marker and result rows animate position. A native dialog contains focus while its evidence panel enters. Reading progress tracks the full paper's scroll position. Reduced motion uses immediate states and keeps the same information. Source links retain CSS hover and focus feedback.

The Markdown parser runs on the server. Raw paper chunks and parser code are not imported by the client view. The document stays mounted during search and drawer use. The source equations and diagrams remain readable notation rather than an extra client math runtime.

The browser skips off-screen chapter rendering before the paper enters view. Entering the document or following an anchor expands chapter layout once. This preserves exact deep-link positions and stable reading progress while keeping the initial mobile view fast. All document text remains in the server HTML.

## What this does not verify

The catalog does not establish deployed runtime values. Public issue closure does not establish implementation or spec ratification. Bare tracker references are internal and their states are unavailable. The page does not execute equations, proofs or transactions. Local performance checks do not measure deployed hosting performance.
