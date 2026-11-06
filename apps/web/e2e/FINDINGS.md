# Browser findings

The browser suite intentionally fails on product defects. It does not waive them as expected failures. This inventory was measured against the production site built from `97600ee` on 2026-11-06 with the committed offline test clock and recorded data.

## Shared mobile Search control

- Page: every published sitemap page at the mobile viewport.
- Owner: shared web shell, `apps/web/components`.
- Reproduction: run a mobile browser contract and inspect the axe attachment.
- Observed: `button-name` is serious. The `.find-button` has no accessible name when its text is hidden at mobile width.
- Expected: the icon-only Search button has an accessible name at every width.

## SDK main landmark

- Page: `/sdk` at both viewport widths.
- Owner: SDK conformance page, `apps/web/app/sdk` and `packages/sdkconf`.
- Reproduction: `pnpm --filter web e2e --grep '/sdk browser'` after the offline build.
- Observed: the shared `main#main` contains a second `main` from the SDK page.
- Expected: one main landmark. The page's content container can use a section or div.

## Scope of the findings

These are site defects, not protocol findings. Fixes belong to the owning pages. Keyboard detector and selector corrections are test changes. Run the suite again after product fixes and review visual differences before updating baselines.
