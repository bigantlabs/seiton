---
sidebar_position: 1
---

# User Guide Overview

seiton audits your Bitwarden vault by running five analyzers, presenting each finding interactively, and applying approved changes through the `bw` CLI.

## The Audit Workflow

The `seiton audit` command runs through five phases:

```
1. Fetch  →  2. Analyze  →  3. Review  →  4. Apply  →  5. Sync
```

### 1. Fetch

seiton calls `bw list items` and `bw list folders` to read your vault. All data stays in memory — nothing is written to disk at this stage. The output is validated with strict schemas to ensure data integrity.

### 2. Analyze

Five analyzers run against the fetched data:

- **[Duplicate detection](/docs/user-guide/analyzers#duplicate-detection)** — exact and near-duplicate items
- **[Password strength](/docs/user-guide/analyzers#password-strength)** — weak passwords by length, complexity, and zxcvbn score
- **[Password reuse](/docs/user-guide/analyzers#password-reuse)** — items sharing the same password
- **[Missing fields](/docs/user-guide/analyzers#missing-fields)** — items without URIs, usernames, or other key fields
- **[Folder classification](/docs/user-guide/analyzers#folder-classification)** — suggested folder assignments for unfiled items

Analysis is pure computation with no side effects. The same vault input always produces identical findings.

### 3. Review

Findings are split into two groups:

- **Informational findings** (weak passwords, reused passwords, missing fields) are displayed in a consolidated batch report before the interactive loop. These are FYI-only — seiton does not generate or rotate passwords.
- **Actionable findings** (duplicates, folder suggestions) are presented interactively. There is no `--force` or `--yes-to-all` flag.

For duplicates, all items across every group are shown in a single flat multiselect. You check items to delete (unchecked = keep). Each item shows its folder, group key, and password-revision date. If your selections would delete every item in a group, a safety confirmation fires before proceeding.

For folder suggestions, you can Accept the suggestion, Choose a different folder from your configured categories, or Skip. Approved actions are queued as pending operations.

You can skip entire categories with `--skip <category>` or cap the number of findings per category with `--limit <n>`.

### 4. Apply

Approved changes are applied serially through `bw` in three phases: folder creation, folder assignment, then item deletion. A live status line updates with each operation so you can follow progress:

```
Creating folder 3/5 — Development
Assigning folder 12/30 — Banking & Finance [1 failed]
```

When the phase completes, a timed breakdown summary shows how long each phase took and how many operations succeeded or failed. If any operation fails, remaining operations are saved to the pending queue for later retry with `seiton resume`.

Use `--dry-run` to see what would be changed without applying anything.

### 5. Sync

After all operations complete, seiton triggers `bw sync` to push changes to the Bitwarden server. This is fire-and-forget — sync failures produce a warning but do not affect the exit code.

## Interrupt Recovery

If you press Ctrl+C during an audit, seiton saves unfinished operations to a pending-ops queue file (when `audit.save_pending_on_sigint` is enabled, which is the default). The queue stores only operation kinds and item IDs — never passwords or secrets.

- **`seiton resume`** — review and apply the saved queue
- **`seiton discard`** — delete the queue without applying

## Read-Only Mode

`seiton report` runs the same analyzers but skips the review and apply phases. It outputs findings as text or JSON (`--json`) and does not require a TTY. This is useful for CI pipelines, scripted audits, or previewing findings before a full interactive audit.

```bash
seiton report --json | jq '.findings[] | select(.category == "weak")'
```

## Security Model

- seiton accesses your vault exclusively through the `bw` CLI — it never calls the Bitwarden API directly
- It never handles your master password
- Plaintext secrets (passwords, TOTP seeds, notes) never reach disk, logs, or network
- The pending-ops queue stores only item IDs and operation kinds
- JSON output redacts passwords, TOTP seeds, and embedded URI credentials
- All files seiton writes use mode `0600` (owner read/write only)
- Log output sanitizes sensitive values before writing
