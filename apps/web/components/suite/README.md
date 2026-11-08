# Shared suite shell

How does a tool fit into the suite? The shell reads `content/tools.ts` for sections, status labels and destinations. Section routes always start with `/sections/`.

## Run

From the repository root with Node 22 and pnpm. Open http://localhost:3790.

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3790
```

## Adopt the header

Place the shared header inside the existing hero where the page heading belongs. Keep one `h1` on the page. Use `titleId` when the hero has `aria-labelledby`.

```tsx
import { ToolHeader } from "@/components/tool-header";

<ToolHeader slug="verify" titleId="tool-heading" />;
```

The component reads the name, section, status, question and source path from the registry. It links back to `/sections/<section>`. The command uses the umbrella CLI's existing names. It copies a help command and never starts a network operation. Kestra has no umbrella command and says so.

`ToolMark` is a named React view transition between a card and its header. The header marker always travels. Pass `travel` to a card marker only while that card is hovered or focused, so the followed card morphs into the header and no other card moves. The small slug marker has the same type size in both places, so wrapped titles stay readable during travel. Reduced motion sets view transitions to zero duration. The original tool workbench remains responsible for its own input and result motion.

The layout adds a context bar above every tool page and section page. It also adds a related tools strip below every tool page. On a tool page the bar lists the other available tools in the section with previous and next. On a section page it switches sections. Both read the registry, so a tool appears in them once its entry is available. They are in `components/shell/tool-context.tsx`.

## Section evidence

`evidence.ts` runs on the server. Each adapter projects a small value from a committed real recording. It retains the capture time, a source link, the recording path and a limit statement. It makes no network requests. Static section pages retain these values until the next build.

Add an adapter when a tool becomes available. Use that tool's own recording. Do not substitute another tool's observation when evidence is missing. The default card says `No data`. Tests require an adapter for each available registry entry. `parseMetric` rejects missing dates, unsafe counts and non-HTTPS links. A measured zero stays zero.

The section bar is available tools divided by registered tools. It measures registry coverage, not network health. Its exact counts are readable before motion completes. The reading line tracks scroll position through the explanation.

## Search

The palette indexes tools, sections and actual local README headings. It ignores fenced examples and disambiguates repeated headings with GitHub anchors. Missing README files are skipped. It makes no search API requests. All query words must match. Exact titles sort first. Long lists show an explicit bounded result count and ask for a more specific query.

Press `/`, Ctrl-K or Cmd-K. Arrows move between results. Enter opens the first result from the input or the focused link. Home returns from a link to the search input. Escape closes the native modal and restores focus. The modal supplies native focus containment.

## Social images

The permitted tool routes have a small `opengraph-image.tsx` wrapper around `toolImage(slug)`. The section route uses `sectionImage(id)`. Next.js generates these images at build time. The wrappers supply alt text and image dimensions. New tool pages inherit the image automatically when they use the same route.

The DID trail image wrapper could not be created because this build environment denies edits to its route path. The shared section route still provides the Identity section image. Add the tool wrapper when that path is available to the contributor.

## What this does not verify

Section recordings do not describe current network health. Source links locate evidence but do not authenticate it. Counts from local SDK runs and host probes are labelled as such. The shell does not check inference correctness, chain finality, miner availability or deployed-site performance.

Search uses bundled README headings. It does not crawl the hosted FLOP docs or guarantee remote documents will keep their anchors. Planned source locations can precede the creation of their packages. Social images describe release status and contain no live metrics.
