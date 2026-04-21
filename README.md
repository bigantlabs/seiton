# seiton

An interactive command-line auditor for [Bitwarden](https://bitwarden.com/) vaults. seiton detects duplicates, weak and reused passwords, missing fields, and disorganized folders, then walks you through each finding so you can approve or reject changes one at a time. Plaintext never leaves the local machine: seiton itself makes no direct network calls, telemetry, or update checks — any network access is performed by the `bw` CLI it invokes — and every mutation flows through `bw` with per-item confirmation.

The name derives from Japanese 整頓 ("set in order"), one of the five principles of the 5S workplace-organization methodology.

## Prerequisites

- **Node.js** >= 22
- **Bitwarden CLI** (`bw`) installed and on your `PATH`

## Install

```sh
npm install -g seiton
```

Verify the installation:

```sh
seiton --version
```

To verify integrity against the published SHA256SUMS (optional):

```sh
# Download the release tarball and checksum from GitHub Releases
curl -LO "https://github.com/AntPerez69367/seiton/releases/download/v$(seiton --version)/SHA256SUMS"
curl -LO "https://github.com/AntPerez69367/seiton/releases/download/v$(seiton --version)/seiton-$(seiton --version).tgz"
sha256sum -c SHA256SUMS
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

| Command         | Description                                             |
| --------------- | ------------------------------------------------------- |
| `seiton audit`  | Fetch, analyze, review findings, apply approved changes |
| `seiton resume` | Resume a previously interrupted audit session           |
| `seiton discard`| Delete the saved pending-ops queue                      |
| `seiton report` | Read-only analysis (supports `--json`)                  |
| `seiton doctor` | Preflight checks for `bw`, session, and config          |
| `seiton config` | Get, set, edit, reset configuration                     |

Run `seiton --help` or `seiton <command> --help` for detailed usage.

## How It Works

seiton reads your vault through the `bw` CLI, runs five analyzers (duplicates, password reuse, weak passwords, missing fields, folder classification), and presents findings interactively. You approve or reject each change. Approved changes are queued and applied serially through `bw`. If interrupted, the queue is saved and can be resumed later.

seiton never makes direct API calls, never handles your master password, and never writes secrets to disk.

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

## Platform Support

Linux and macOS are first-class targets. Windows is currently untested and unsupported.

## License

[MIT](LICENSE)
