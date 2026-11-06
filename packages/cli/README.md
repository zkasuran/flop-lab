# flop

Which flop-lab tool answers my question? `flop` finds a tool by its question, shows its options and runs its CLI. For example, `flop verify tape` runs `flop-verify tape`.

## Quick start

From the repository root with Node 22 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @flop-lab/cli... --workspace-concurrency=1 run build
node packages/cli/dist/cli.js --help
```

## Commands

The root `pnpm build` also builds the site. The quick start builds only the command suite. To use the shorter `flop` name after building:

```sh
alias flop='node /absolute/path/to/flop-lab/packages/cli/dist/cli.js'
flop which miner reliability
flop help score
```

## Find and run a tool

| Command                               | Result                                           |
| ------------------------------------- | ------------------------------------------------ |
| `flop --help`                         | Tools grouped by section and sorted by name      |
| `flop help verify`                    | The verifier's own options                       |
| `flop list --json`                    | Registry definitions, without launching tools    |
| `flop which "is my machine ready"`    | Matching questions with terms and a help command |
| `flop which budget --json`            | Structured search matches                        |
| `flop swap observe --recorded --json` | Recorded swap observations                       |

Search is local. It matches case-insensitive word prefixes in command names, package names, sections, summaries and question taglines. It drops common question words and duplicate terms. An exact command name comes first. Other results sort by the number of matched terms then by name. Partial matches remain visible. No matches means an empty JSON array or a short text message and exit 1. This is text search, not a recommendation about network safety.

Arguments pass to the child without a shell. Put `--json` last. For operations that already emit JSON, the wrapper removes that flag before launching the child. The operation list and output rules are in [JSON.md](JSON.md). Child exit codes are preserved, including findings and incomplete results. Suite usage and missing installations exit 2. Signals are forwarded to the child.

Tool binaries resolve to their canonical paths. This matters for entry-point checks that compare `argv[1]` to `import.meta.url` under pnpm workspace links.

## Shell completions

Generate again after updating the suite. These scripts complete suite names, help targets, shell names and suite flags. Tool-specific nested arguments remain in each tool's help.

```sh
# Bash, in a shell where the flop alias above is defined
source <(flop completions bash)

# Zsh, after defining a flop alias in that shell
autoload -Uz compinit && compinit
source <(flop completions zsh)

# Fish, after defining a flop function or alias in that shell
flop completions fish | source
```

Bash syntax and prefix completion run in the tests. Zsh and fish syntax checks run when those shells are installed. This audit host had neither shell. Their checks were skipped.

## Packaging

Git-URL `pnpm dlx` is not a working installation method for this monorepo. On 2026-11-06 with Node v22.22.2 and pnpm 11.25.0, this invocation reported `ERR_PNPM_DLX_NO_BIN: No binaries found in flop-lab`:

```sh
pnpm dlx 'git+https://github.com/zkasuran/flop-lab.git#b421a4a0db776b7f7f0409d3c0afe25a4c611c96' --help
```

The git URL selects the root package. Its manifest has no binary. The CLI is in `packages/cli`, depends on `workspace:*` packages and points to uncommitted build output. Installing that folder alone also requires a packaging step that includes and builds those dependencies. No npm release was made. Use a checkout and the quick start above.

## Importable API

Within this TypeScript workspace:

```ts
import { commands, searchCommands, completionScript } from "@flop-lab/cli";

const matches = searchCommands(commands, "miner reliability");
const bash = completionScript(commands, "bash");
```

The package exports TypeScript source. Use the workspace toolchain or a TypeScript-aware loader. The built binary runs on Node 22.

## Checks and audit

```sh
pnpm --filter @flop-lab/cli check
pnpm exec tsx packages/cli/scripts/audit.ts /tmp/flop-cli-audit
```

`check` builds the CLI and its dependencies before spawning each registered tool with `--help`. It checks golden suite help, reverse package inventory, site sections, search ordering, JSON adapters and real recorded-data results. The audit records invocation arguments, timestamps, revision, binary hash, output hashes, exit codes and cold process duration. Raw output is split into bounded files. Network calls are blocked during the audit. See [AUDIT.md](AUDIT.md) for the measured differences.

To add a tool, add an entry to `src/commands.ts` with a question tagline and add its `workspace:*` dependency. Run `pnpm install`. Update the help golden with `pnpm --filter @flop-lab/cli exec vitest run -u`. The reverse inventory test fails if a package bin has no command. Keep question text current with the site's tool entry.

## What this does not verify

Command discovery does not verify protocol behavior, inference, prices, transactions or a tool's conclusions. The wrapper does not reinterpret child result schemas or normalize their exit codes. A zero exit can mean only that a report was produced. Recorded fixtures describe their capture time. Successful help and JSON parsing do not establish live service health. Tool-specific limits remain in each package README.
