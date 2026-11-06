# Suite API reference

How do I read the suite's results as an API? `/openapi` shows the exact bundled responses used by `/api/v1`, their source dates and their evidence limits. Select an endpoint and copy its curl command or JSON response.

## Run

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web exec next start --port 3780
```

Open `http://localhost:3780/openapi`. The page uses the suite header's shared route marker, reading-order reveals, a scroll-linked contract guide, layout selection and bars animated between measured outcomes. Reduced motion keeps the same information with immediate transitions. Values remain readable without JavaScript.

## What this does not verify

The page reads bundled evidence. It does not start live scans or establish current service health. The JSON contract checks shape and internal count consistency. It does not independently verify the upstream suite classifiers or inference correctness.
