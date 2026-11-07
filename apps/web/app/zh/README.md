# Simplified Chinese pages

Can Chinese-speaking readers use the suite? `/zh` explains the home evidence in Simplified Chinese. `/zh/sections/<id>` uses the existing section recordings. `/zh/docs` and `/docs` index the same local README headings.

## Quick start

From the repository root with Node 22 and pnpm. Open http://localhost:3830/zh:

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3830
```

## Translation contract

Page copy lives in `translations/home.ts`, `translations/docs.ts` and a typed file per translated section. Shared control copy lives in `translations/common.ts`. Chinese values must cover every English key. Tests compare section keys with the current tool registry and promise text with the English evidence reader. A new tool or changed question requires a translation update.

The build environment denied the dedicated Identity translation file. That route keeps its original introduction and tool question in English, marked as such. Its shared controls and reading guide are translated. This gap is visible on the page.

Tool names, code, signatures, legal text and raw evidence retain their original form. Source annotations and original document headings are marked as English. Every Chinese route displays a machine-assistance notice. Chinese content has a `zh-Hans` language boundary; the surrounding English footer keeps its original language.

The language control has a fixed size before hydration. It links to the matching route when a translation exists. Other tool pages link to the Chinese home. Both versions publish canonical URLs and reciprocal `en`, `zh-Hans` and `x-default` alternates. Tool destinations continue to use the registry.

## Data and motion

The home uses `getCachedSnapshot`, `readClaimRun`, `readSettlementTape` and `readPromiseLedger`, also used by the English home. It uses the same cache key, refresh interval, source validation and dated fallback. There is no new network client. Missing data stays missing. Zero remains a measured zero. Section metrics are passed through without changing their values, dates or source links.

The Chinese home presents the evidence as summaries and links to the full tools. It does not duplicate the English matrix, settlement selector or signature demonstration. The docs index uses real local README headings and can search translated tool questions. Heading links open the original English documents.

Motion follows reading order, observed values, filtered entries and shared tool markers. Scroll lines track reading. Reduced motion uses immediate states. Run the translation and data-parity tests with `pnpm --filter web test tests/i18n.test.ts`.

## What this does not verify

Machine-assisted translation has not had a human language review. The Identity introduction remains untranslated because of the denied file path. Original evidence annotations and linked tool pages remain English. The pages do not verify inference correctness, chain finality, current service health or legal meaning. The docs index does not translate source documents or execute their commands.
