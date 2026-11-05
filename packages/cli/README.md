# flop

Which flop-lab tool answers my question? `flop` is one command for the whole suite. Each subcommand runs that tool's own CLI with the arguments you pass, so `flop verify tape` is `flop-verify tape`.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/cli.js --help
```

## Commands

`flop --help` lists every tool by suite section. `flop list --json` prints the same list as JSON. `flop <command> --help` shows that tool's options. The exit code is the tool's exit code. An unknown command or a tool that is not built exits 2 and runs nothing.

To add a tool, add one entry to `src/commands.ts` and a `workspace:*` dependency on its package. The registry test checks that the package exists and declares that bin.

## What this does not verify

`flop` only dispatches. It adds no checks of its own. What each tool verifies is in that tool's README.
