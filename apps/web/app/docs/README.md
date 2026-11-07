# Suite documentation

Which tool answers my FLOP devnet question? This hub groups package READMEs by suite section and searches their titles, questions and headings. Next.js generates the package pages and raw README routes at build time.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run --config apps/web/app/docs/vitest.config.ts
pnpm --filter web build
```

Run `pnpm --filter web exec next start --port 3550` and open `/docs`. The home page links to the hub. Every workspace package with a package manifest must have a README or the build fails. A newly merged package is included in the next build without a copied guide.

## Sources and rendering

`catalog.ts` reads package manifests and README bytes from the checkout. It joins the site registry with `packages/cli/src/commands.ts` by package name. A shared library has no invented subcommand. The generated page links its source revision and prints a SHA-256 digest of the exact README bytes. Its `/readme` route serves those bytes as plain text.

The local renderer handles headings, fenced code, paragraphs, lists, quotes, tables and inline code or links. HTML stays inert text. Relative links resolve from the source README. Unsupported Markdown remains readable text. The source and raw view retain the original formatting. Only the search index enters the client bundle.

Search runs locally with literal case-insensitive words. Every query word must occur in the title, question, package name, command or headings. Section filtering is an additional condition. A zero-match search displays an empty result. The count and bar reflect matching package READMEs. The reading rail tracks scroll position.

## Findings

`/docs/findings` reads saved GitHub issue queries for author `zkasuran` in `flop-labs/network` and `flop-labs/yellowpaper`. It includes reports before the suite began. Each query keeps the raw response, source and acquisition time. A full response at the configured limit is rejected to avoid claiming completeness for a truncated list.

Refresh explicitly with `pnpm exec tsx apps/web/app/docs/findings/record.ts`. This makes bounded read-only GitHub queries through `gh`. It requires GitHub CLI access. A build uses recordings and makes no findings requests. A malformed recording is shown as unavailable, not as an empty tracker.

## Checks

The docs test command above checks real README coverage, command mapping, code fences, literal search, empty inputs, hostile links and recorded issue validation. The normal web check covers types, lint and formatting in this folder. Browser checks cover search, routes, raw bytes, heading navigation and reduced motion. Test files live here to keep the documentation scope together.

## What this does not verify

The hub does not execute every command in each package README. It does not verify the network claims in those guides. A source digest identifies README bytes, not their correctness. The Markdown view is not a full GitHub renderer. Recorded open and closed issue states do not prove a deployed fix or reflect changes after capture. Planned packages have no generated guide until their README exists.
