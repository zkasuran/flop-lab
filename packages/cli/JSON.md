# JSON and exit contract

## Suite-owned output

`flop list --json` writes one JSON array of command definitions to stdout. `flop which <words> --json` writes one array of `{ command, matched }` entries. No match is `[]` with exit 1. `matched` contains query terms found in registry text. Registry metadata is local configuration, not a network observation.

Valid suite output ends with a newline. Diagnostics go to stderr. Invalid suite arguments exit 2 with no stdout. Help and completion scripts are text. There is no global `flop --json` flag.

## Tool output

Use `flop <command> <operation> ... --json`. The wrapper inherits stdout and stderr and preserves the child's exit code. It does not wrap, parse or reserialize tool output. Source timestamps and decimal strings remain the child's values.

Most tools handle `--json` themselves. These operations already output one JSON value. The wrapper accepts and removes a single trailing `--json` for them:

| Command   | JSON-native operations                                                   |
| --------- | ------------------------------------------------------------------------ |
| `watch`   | `check`                                                                  |
| `swap`    | `plan`, `generate`, `check`, `observe`                                   |
| `history` | `record`, `analyze`, `verify`                                            |
| `harness` | `run`, `list`, `coverage`, `history`                                     |
| `guard`   | `init`, `verify`, `evaluate`, `lint`, `replay`, `shared-init`, `reserve` |
| `x402`    | `inspect`, `check`, `client`                                             |

The adapter leaves a repeated flag, a flag before the last argument and arguments after `--` unchanged. It does not claim that these forms work in every child. Unknown operations also pass through unchanged for the child to reject. Help remains the child's own text.

`watch replay` produces JSON Lines, one value per recording. `watch run` and `watch drain` have streaming delivery and stderr diagnostics. These operations have no single-result adapter. `start` generates local project files and has no JSON mode. `harness report` emits a Markdown draft. Server-starting operations emit text. Do not feed those outputs to a single-value JSON parser.

## Interpreting exits

The suite convention is 0 for success, 1 for a finding, 2 for usage and 3 for unverifiable results where supported. Existing tools differ. The wrapper preserves those differences because a status number alone cannot explain every result schema.

Examples measured in this audit:

- `doctor` uses 64 for invalid arguments and 2 for UNKNOWN.
- `guard` uses 2 for a denied policy or lint findings and 1 for invalid input.
- `x402 check` uses 2 for deviations and 3 for incomplete evidence.
- `indexer` can exit 0 with some unverifiable checks. Its recorded finding probe exited 1.
- `sessions` returned sourced error JSON and exit 3 when network reads were blocked.

Read [AUDIT.md](AUDIT.md) and each tool's help before using exit codes in automation. Parse stdout even on a finding exit. Check the result's evidence status and coverage rather than treating exit 0 as proof.
