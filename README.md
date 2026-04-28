# seiton

An interactive command-line auditor for [Bitwarden](https://bitwarden.com/) vaults. seiton detects duplicates, weak and reused passwords, missing fields, and disorganized folders, then walks you through each finding so you can approve or reject changes one at a time. Plaintext never leaves the local machine: seiton itself makes no direct network calls, telemetry, or update checks — any network access is performed by the `bw` CLI it invokes — and every mutation flows through `bw` with per-item confirmation.

The name derives from Japanese 整頓 ("set in order"), one of the five principles of the 5S workplace-organization methodology.

**[Documentation](https://bigantlabs.github.io/seiton/)**

## Features

- **Five analyzers**: duplicates, password reuse, weak passwords, missing fields, folder classification
- **Interactive review**: per-item approval for every vault change — no `--force` flag
- **Interrupt recovery**: Ctrl+C saves progress; `seiton resume` picks up where you left off
- **Read-only mode**: `seiton report` outputs findings without mutations (supports `--json`)
- **Configurable rules**: tune password strength thresholds, dedup sensitivity, folder categories, and custom keyword rules
- **Preflight checks**: `seiton doctor` verifies your environment before you start

## Prerequisites

- **Node.js** >= 22
- **Bitwarden CLI** (`bw`) installed and on your `PATH`

## Install

```sh
npm install -g @bigantlabs/seiton
```

Verify the installation:

```sh
seiton --version
```

## Quick Start

```sh
# Unlock your vault and export the session
export BW_SESSION=$(bw unlock --raw)

# Run a preflight check
seiton doctor

# Audit your vault interactively
seiton audit
```

## Commands

| Command | Description |
| --- | --- |
| `seiton audit` | Fetch, analyze, review findings, apply approved changes (default) |
| `seiton resume` | Resume a previously interrupted audit session |
| `seiton discard` | Delete the saved pending-ops queue |
| `seiton report` | Read-only analysis (supports `--json`) |
| `seiton doctor` | Preflight checks for `bw`, session, and config |
| `seiton config` | Get, set, edit, reset configuration |

Run `seiton --help` or `seiton <command> --help` for detailed usage.

## Configuration

seiton looks for a config file at `$XDG_CONFIG_HOME/seiton/config.json` (or `$HOME/.config/seiton/config.json`). All settings have sensible defaults; no config file is required.

```sh
# See the config file path
seiton config path

# Adjust a threshold
seiton config set strength.min_length 14

# Open in your editor
seiton config edit
```

See the [configuration reference](https://bigantlabs.github.io/seiton/docs/user-guide/configuration) for all available options.

## Contributing Changes

This project uses [changesets](https://github.com/changesets/changesets) to track changes and automate releases.

**Adding a changeset when your PR modifies source code:**

```sh
npx changeset
```

Follow the prompts to select a bump type (patch, minor, or major) and describe your change. This creates a `.changeset/<name>.md` file — commit it with your PR.

**What happens when a PR merges:** The changesets bot opens a "Version Packages" PR that bumps the version, updates `CHANGELOG.md`, and consumes all pending changeset files. Merging that PR triggers the release workflow.

**Skipping the requirement:** If your PR doesn't touch source code (e.g., docs-only or CI config), add the `no-changelog-needed` label to bypass the changeset check.

## Platform Support

Linux and macOS are first-class targets. Windows is currently untested and unsupported.

## License

[MIT](LICENSE)
