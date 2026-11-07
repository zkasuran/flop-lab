# Pending package changes

Add one JSON note for each user-facing package change. Use a unique lowercase hyphenated filename. Notes use this shape:

```json
{
  "summary": "Reject malformed response records.",
  "packages": { "@flop-lab/mcp": "patch" }
}
```

Use `patch` for fixes, `minor` for additive APIs and `major` for breaking APIs. A major bump before 1.0 still increments the major version. Notes for the same package use the largest bump. Runtime workspace dependents receive a patch bump until the dependency graph is covered. Dev-only dependencies do not trigger a bump.

Run `pnpm --filter @flop-lab/release plan`. Add `--out /tmp/flop-preview` to generate candidate package manifests and changelogs in a new external directory. An empty note set keeps every current version. Invalid names, unknown packages and unsupported versions stop the command.

The tool never applies versions to this checkout. After a reviewed release, a maintainer can prepare a separate version PR using the preview manifests and changelogs for changed packages, archive consumed notes under `archive/` and run `pnpm install --no-frozen-lockfile`. Use preview output rather than the tarball staging tree, which has resolved dependencies and no scripts. Review the diff and run the gate. Until then the same notes produce the same candidate versions. The timestamp records each preview separately.
