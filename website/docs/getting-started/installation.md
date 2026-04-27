---
sidebar_position: 1
---

# Installation

## Prerequisites

- **Node.js** >= 22 ([download](https://nodejs.org/))
- **Bitwarden CLI** (`bw`) installed and on your `PATH` ([install guide](https://bitwarden.com/help/cli/))

## Install from npm

```bash
npm install -g seiton
```

Verify the installation:

```bash
seiton --version
```

## Verify Integrity (Optional)

You can verify the downloaded package against published checksums:

```bash
curl -LO "https://github.com/AntPerez69367/seiton/releases/download/v$(seiton --version)/SHA256SUMS"
curl -LO "https://github.com/AntPerez69367/seiton/releases/download/v$(seiton --version)/seiton-$(seiton --version).tgz"

# Linux
sha256sum --ignore-missing -c SHA256SUMS

# macOS
shasum -a 256 --ignore-missing -c SHA256SUMS
```

## Platform Support

| Platform | Status |
|----------|--------|
| Linux    | Fully supported |
| macOS    | Fully supported |
| Windows  | Untested / unsupported |

## Bitwarden CLI Setup

seiton requires an unlocked Bitwarden vault. If you haven't already:

```bash
# Log in (first time only)
bw login

# Unlock and export the session token
export BW_SESSION=$(bw unlock --raw)
```

The `BW_SESSION` environment variable must be set for seiton to access your vault. seiton never handles your master password directly.

## Verify Your Setup

Run the built-in preflight check:

```bash
seiton doctor
```

This confirms that `bw` is reachable, your session is valid, and your configuration is sound.
