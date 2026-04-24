---
sidebar_position: 2
---

# Command Reference

All commands support `--help` (`-h`) for usage details. Run `seiton --help` for the top-level summary, or `seiton <command> --help` for command-specific flags.

## Global Flags

These flags are accepted by every command:

| Flag | Description |
|------|-------------|
| `--config <path>` | Override the config file location |
| `--no-color` | Disable ANSI color output (also honors `NO_COLOR` env var) |
| `--verbose`, `-v` | Increase log detail (stack: `-vv` for trace-level) |
| `--quiet`, `-q` | Suppress non-essential output |
| `--help`, `-h` | Print help and exit |
| `--version`, `-V` | Print version and exit (root level only) |

## `seiton audit`

The primary command. Fetches your vault, runs all five analyzers, and reviews findings. Informational findings (weak passwords, reused passwords, missing fields) are displayed in a consolidated batch report. Actionable findings (duplicates, folder suggestions) are presented interactively — you approve or reject each one. For folder suggestions, you can Accept the suggestion, Choose a different folder from your configured categories, or Skip. Approved changes are applied through `bw`. This is the default command when you run `seiton` with no subcommand.

```bash
seiton audit [flags]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be changed without applying |
| `--skip <category>` | Skip a finding category (repeatable, e.g. `--skip weak --skip reuse`) |
| `--limit <n>` | Stop after _n_ findings per category (1--100,000) |

**Requires:** interactive terminal (TTY), `BW_SESSION` set.

**Exit codes:** `0` success, `1` apply failures, `64` bad args or non-TTY, `69` `bw` not found, `77` session missing.

## `seiton report`

Read-only analysis. Outputs findings without interactive review or vault mutations. Does not require a TTY, so it can be piped to other tools or saved to a file.

```bash
seiton report [flags]
```

| Flag | Description |
|------|-------------|
| `--json` | Output findings as JSON (secrets redacted) |
| `--skip <category>` | Skip a finding category (repeatable) |
| `--limit <n>` | Stop after _n_ findings per category |

**Requires:** `BW_SESSION` set. No TTY required.

**Exit codes:** `0` success, `1` fetch failed, `3` malformed `bw` output, `64` bad args, `77` session missing.

## `seiton resume`

Resumes applying pending operations saved from a prior audit that was interrupted (e.g. by Ctrl+C). Shows the queued operations and asks for confirmation before applying.

```bash
seiton resume [flags]
```

No command-specific flags beyond the global set.

**Requires:** interactive terminal (TTY), `BW_SESSION` set.

**Exit codes:** `0` all applied (or nothing to resume), `1` some operations failed, `64` bad args or non-TTY, `77` session missing.

## `seiton discard`

Deletes the pending-ops queue without applying any changes. This is non-reversible.

```bash
seiton discard [flags]
```

No command-specific flags beyond the global set.

**Exit codes:** `0` queue deleted (or already absent), `64` bad args, `73` file removal failed.

## `seiton doctor`

Preflight checks that verify your environment is ready:

- `bw` CLI is on `PATH` and reports its version
- `BW_SESSION` environment variable is set
- Node.js version meets the minimum (>= 22)
- Config file is valid (if present)

```bash
seiton doctor [flags]
```

| Flag | Description |
|------|-------------|
| `--debug` | Show full stack traces on unexpected errors |

**Exit codes:** `0` all checks passed, `1` one or more checks failed, `2` internal error.

## `seiton config`

Manage the configuration file. Has six subcommands:

### `seiton config show`

Display the full resolved configuration as JSON. Sensitive paths (`bw_binary`, `pending_queue`) are redacted.

```bash
seiton config show
```

### `seiton config get <key>`

Read a specific configuration value by dotted key path.

```bash
seiton config get strength.min_length
seiton config get folders.enabled_categories
```

### `seiton config set <key> <value>`

Set a configuration value. Creates the config file if it does not exist.

```bash
seiton config set strength.min_length 14
seiton config set ui.prompt_style plain
seiton config set strength.min_length --unset   # reset key to default
```

| Flag | Description |
|------|-------------|
| `--unset` | Remove the key, reverting it to its default value |

### `seiton config path`

Print the active config file path, or a message indicating defaults are in use.

```bash
seiton config path
```

### `seiton config edit`

Open the config file in `$VISUAL` or `$EDITOR`. Creates the file if it does not exist.

```bash
seiton config edit
```

### `seiton config reset`

Reset the entire config file to defaults. Asks for confirmation unless `--yes` is passed.

```bash
seiton config reset [--yes] [--keep-custom-rules]
```

| Flag | Description |
|------|-------------|
| `--yes` | Skip the confirmation prompt |
| `--keep-custom-rules` | Preserve your `folders.custom_rules` during reset |

**Exit codes (all subcommands):** `0` success, `64` bad args or unknown subcommand.

## Exit Code Reference

seiton uses BSD `sysexits`-compatible exit codes:

| Code | Name | Meaning |
|------|------|---------|
| 0 | `SUCCESS` | Operation completed successfully |
| 1 | `GENERAL_ERROR` | Partial failure (e.g. some apply operations failed) |
| 2 | `INTERNAL_ERROR` | Unexpected internal error |
| 3 | `MALFORMED_BW_OUTPUT` | Could not parse `bw` CLI output |
| 64 | `USAGE` | Invalid arguments, unknown command, or non-interactive terminal |
| 69 | `UNAVAILABLE` | `bw` CLI not found on `PATH` |
| 73 | `CANT_CREATE` | File creation or removal failed |
| 77 | `NO_PERMISSION` | `BW_SESSION` not set or vault locked |
| 130 | `USER_INTERRUPT` | User pressed Ctrl+C |
