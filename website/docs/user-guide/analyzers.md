---
sidebar_position: 4
---

# Analyzers

seiton runs five analyzers against your Bitwarden vault. Each analyzer produces findings that are presented for your review. This page describes what each analyzer detects, how it works, and how to tune its behavior.

## Duplicate Detection

Finds items that appear to be duplicates based on their URIs and usernames.

**Exact duplicates** share the same domain and username. All duplicates across every group are presented in a single flat multiselect screen where you check items to delete (unchecked items are kept). Each item displays its name, folder, username/URI, duplicate-group key, and password-revision date so you can confidently pick the freshest copy.

**Near duplicates** have item names within a configurable [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance) of each other. These are flagged for manual review since they may be intentional (e.g. "GitHub" and "GitHub Enterprise").

### Duplicate Review Workflow

The default state is "keep all" — no items are pre-checked for deletion. You can select any combination of items for deletion, including keeping multiple items within the same group (e.g. "keep two of these three" when items are intentionally distinct).

If your selections would delete every item in one or more groups (leaving zero keepers), seiton shows a targeted safety confirmation listing only the affected groups. Accepting proceeds with deletion; declining returns you to the multiselect with your previous selections preserved so you can adjust.

Canceling the multiselect skips duplicate review without aborting the rest of the audit — folder suggestions and other findings continue normally.

### Configuration

| Key | Effect |
|-----|--------|
| `dedup.name_similarity_threshold` | Levenshtein distance for near-duplicates (default: `3`, set to `0` to disable) |
| `dedup.treat_www_as_same_domain` | Treat `www.example.com` the same as `example.com` (default: `true`) |
| `dedup.case_insensitive_usernames` | Ignore case when comparing usernames (default: `true`) |
| `dedup.compare_only_primary_uri` | Only compare the first URI on each item (default: `true`) |

## Password Strength

Evaluates each password against configurable strength rules. A password is flagged as weak if it fails any of the checks:

- **Minimum length** — below the configured character count
- **Character class requirements** — missing required digits, symbols, or character class diversity
- **zxcvbn scoring** — below the configured [zxcvbn](https://github.com/dropbox/zxcvbn) score threshold (0 = trivial, 4 = very strong)
- **Common password list** — matches a known common password or one of your custom entries

Strength findings are informational. seiton does not generate or replace passwords — you handle rotation yourself using Bitwarden or a password generator.

### Configuration

| Key | Effect |
|-----|--------|
| `strength.min_length` | Minimum password length (default: `12`) |
| `strength.require_digit` | Require at least one digit (default: `true`) |
| `strength.require_symbol` | Require at least one special character (default: `true`) |
| `strength.min_character_classes` | Minimum distinct character classes: lower, upper, digit, symbol (default: `2`) |
| `strength.zxcvbn_min_score` | Minimum zxcvbn score, 0--4 (default: `2`) |
| `strength.extra_common_passwords` | Additional passwords to flag (default: `[]`) |

## Password Reuse

Groups items that share the same password. Comparison uses SHA-256 hashes — plaintext is never logged or stored. Reuse findings highlight the risk of credential-stuffing attacks, where a breach at one service exposes all accounts sharing that password.

Reuse findings are informational. They tell you which items share a password so you can prioritize rotation.

## Missing Fields

Identifies login items that are incomplete:

- **Missing URI** — no website or app URL, which breaks browser auto-fill
- **Missing username** — no username or email address
- **Other incomplete entries** — fields that reduce the usefulness of your vault

These findings help you clean up items imported from other password managers or created hastily.

## Folder Classification

Suggests folder assignments for unfiled items based on keyword matching against item names and URIs. Uses two rule sources:

1. **Custom rules** (evaluated first) — your own keyword-to-folder mappings
2. **Built-in categories** — ten predefined categories covering common item types

### Match Transparency

Every folder suggestion includes the reason it was made. During interactive review, the prompt shows which keyword triggered the match and whether it came from a built-in or custom rule:

```
Assign "GitHub" to folder "Development"? (matched keyword: github)
```

For custom rules the label changes to reflect the source:

```
Assign "Acme Portal" to folder "Work"? (matched custom rule: acme.internal)
```

This makes it easy to understand why a suggestion was made and whether your rules are working as expected.

### Interactive Rule Capture

When you override a folder suggestion by choosing a different folder, seiton offers to save your choice as a custom rule:

```
Save rule so items matching "example.com" go to "Work" next time?
  ● Yes   — adds custom rule: example.com → Work
  ○ No
  ○ Don't ask again this session
```

Selecting **Yes** appends a new entry to `folders.custom_rules` in your config file. The keyword is extracted from the item's primary URI hostname (stripping `www.`), or falls back to the item name if no URI is present.

Selecting **Don't ask again this session** suppresses the rule-capture prompt for the remainder of the audit session without affecting future sessions.

### Built-in Categories

Banking & Finance, Email, Social, Shopping, Development, Entertainment, Utilities, Government & ID, Health, and Other.

### Configuration

| Key | Effect |
|-----|--------|
| `folders.preserve_existing` | Skip items that already have a folder (default: `true`) |
| `folders.enabled_categories` | Which built-in categories to suggest (default: all 10) |
| `folders.custom_rules` | Your keyword-to-folder rules, evaluated before built-ins |

Custom rules example:

```json
{
  "folders": {
    "custom_rules": [
      { "folder": "Crypto", "keywords": ["binance", "kraken", "coinbase"] },
      { "folder": "Work", "keywords": ["acme.internal", "slack", "jira"] }
    ]
  }
}
```

Custom rules can be added manually or captured interactively during an audit (see [Interactive Rule Capture](#interactive-rule-capture) above).

## Output Redaction

When producing output (especially with `seiton report --json`), seiton redacts sensitive data:

- **Passwords** are masked with the configured `ui.mask_character` (default: `•`)
- **TOTP seeds** are fully redacted
- **Note bodies** are stripped
- **URI credentials** (embedded usernames/passwords in URLs) are removed

The pending-ops queue stores only item IDs and operation kinds — never passwords or secrets.
