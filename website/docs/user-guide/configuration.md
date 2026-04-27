---
sidebar_position: 3
---

# Configuration Reference

seiton uses a JSON configuration file. All settings have sensible defaults — no config file is required to get started.

## Config File Location

seiton searches for a config file in this order (first match wins):

1. `--config <path>` CLI flag
2. `$SEITON_CONFIG` environment variable
3. `$XDG_CONFIG_HOME/seiton/config.json`
4. `$HOME/.config/seiton/config.json`
5. `$HOME/.seitonrc.json`

If no file is found, built-in defaults are used. Find your active config path:

```bash
seiton config path
```

## Example Configuration

```json
{
  "version": 1,
  "strength": {
    "min_length": 14,
    "zxcvbn_min_score": 3
  },
  "dedup": {
    "name_similarity_threshold": 3,
    "treat_www_as_same_domain": true
  },
  "folders": {
    "enabled_categories": ["Banking & Finance", "Email", "Social", "Development"],
    "custom_rules": [
      { "folder": "Crypto", "keywords": ["binance", "kraken", "coinbase"] },
      { "folder": "Work", "keywords": ["acme.internal", "acme-corp.com"] }
    ]
  }
}
```

## All Configuration Sections

Every section is optional. Missing sections use their defaults.

### `core` — Output and verbosity

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `output_format` | `"text"` \| `"json"` | `"text"` | Output format |
| `color` | `"auto"` \| `"always"` \| `"never"` | `"auto"` | ANSI color mode |
| `verbose` | `0`--`2` | `0` | Verbosity level (0 = quiet, 1 = info, 2 = debug) |
| `quiet` | boolean | `false` | Suppress non-essential output |

### `paths` — File paths

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pending_queue` | string \| `null` | `null` | Custom pending-ops queue file path |
| `bw_binary` | string \| `null` | `null` | Custom `bw` binary path (if not on `PATH`) |

### `audit` — Audit behavior

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `skip_categories` | string[] | `[]` | Finding categories to skip (e.g. `["weak", "reuse"]`) |
| `limit_per_category` | integer \| `null` | `null` | Max findings shown per category (1+) |
| `save_pending_on_sigint` | boolean | `true` | Save pending-ops queue when interrupted by Ctrl+C |

### `strength` — Password strength rules

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `min_length` | integer | `12` | Minimum acceptable password length |
| `require_digit` | boolean | `true` | Require at least one digit |
| `require_symbol` | boolean | `true` | Require at least one special character |
| `min_character_classes` | `1`--`4` | `2` | Minimum distinct character classes (lower, upper, digit, symbol) |
| `zxcvbn_min_score` | `0`--`4` | `2` | Minimum [zxcvbn](https://github.com/dropbox/zxcvbn) score |
| `extra_common_passwords` | string[] | `[]` | Additional passwords to flag as weak |

### `dedup` — Duplicate detection

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `name_similarity_threshold` | integer | `3` | Levenshtein distance for near-duplicate names (0 = exact only) |
| `treat_www_as_same_domain` | boolean | `true` | Treat `www.example.com` and `example.com` as the same domain |
| `case_insensitive_usernames` | boolean | `true` | Ignore case when comparing usernames |
| `compare_only_primary_uri` | boolean | `true` | Only compare the primary URI (not all URIs on an item) |

### `folders` — Folder classification

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `preserve_existing` | boolean | `true` | Skip items that already have a folder assignment |
| `enabled_categories` | string[] | All 9 built-in | Which built-in categories to suggest |
| `custom_rules` | object[] | `[]` | User-defined keyword-to-folder rules (evaluated before built-ins) |

**Built-in categories:** Banking & Finance, Email, Social, Shopping, Development, Entertainment, Utilities, Government & ID, Health.

**Custom rule format:**

```json
{
  "folder": "Crypto",
  "keywords": ["binance", "kraken", "coinbase", "ledger"]
}
```

Custom rules are matched against item names and URIs. They take priority over built-in categories. Rules can also be captured interactively during an audit — when you override a folder suggestion, seiton offers to save a new rule to your config file (see [Analyzers > Interactive Rule Capture](./analyzers.md#interactive-rule-capture)).

### `ui` — User interface

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mask_character` | string (1--4 chars) | `"•"` | Character used to mask passwords in output |
| `show_revision_date` | boolean | `true` | Show the item's last-modified date in findings |
| `color_scheme` | `"auto"` \| `"light"` \| `"dark"` | `"auto"` | Color scheme hint |
| `prompt_style` | `"clack"` \| `"plain"` | `"clack"` | Interactive prompt style (`plain` for accessibility) |

### `logging` — Log output

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `format` | `"text"` \| `"json"` | `"text"` | Log output format |
| `level` | `"error"` \| `"warn"` \| `"info"` \| `"debug"` | `"info"` | Minimum log level |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BW_SESSION` | Bitwarden session token (required for vault access) |
| `SEITON_CONFIG` | Override the config file path |
| `NO_COLOR` | Disable ANSI color output (any non-empty value) |
| `VISUAL` / `EDITOR` | Editor for `seiton config edit` |
| `HOME` / `USERPROFILE` | Home directory for config file discovery |

Section-level overrides use the format `SEITON_<SECTION>_<KEY>` in uppercase:

```bash
export SEITON_STRENGTH_MIN_LENGTH=14
export SEITON_UI_PROMPT_STYLE=plain
```
