# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.16] - 2026-04-26

### Added
- Interactive batch folder page display replacing the sequential one-at-a-time folder review loop (M21)
## [0.3.15] - 2026-04-24

### Added
- **Interactive batch report category browser (clack + plain):** `renderBatchReport` is now async and presents informational findings via a category-selection prompt. When multiple categories exist (weak, reuse, missing), a `select` prompt lets users pick which category to view. Viewed categories are marked with a "viewed" hint. Users can select "Continue" or press Escape to dismiss. Single-category cases render directly without a select.

## [0.3.14] - 2026-04-24

### Added
- Added `.describe()` calls to every field in `ConfigSchema` (all sub-schemas: CustomRule, Core, Paths, Audit, Strength, Dedup, Folders, UI, Logging, and the root schema) (M20)
## [0.3.13] - 2026-04-24

### Added
- **Loop-back on safety confirm decline**: When the user's selections would delete all items in a group and they decline the safety confirmation, the multiselect is re-shown with their previous selections preserved (via `initialValues` in the clack adapter) so they can adjust. (M19)

## [0.3.12] - 2026-04-24

### Added
- Replaced per-group single-select duplicate review with a flat multiselect across all duplicate groups (M17)
## [0.3.11] - 2026-04-24

### Added
- Milestone 18: Live progress for the apply phase. (M18)

## [0.3.10] - 2026-04-24

### Added
- Milestone 16: Folder classifier transparency & interactive rule capture. (M16)

## [0.3.9] - 2026-04-24

### Added
- **Batch informational report**: Classified findings into "informational" (weak, reuse, missing) and "actionable" (duplicates, folders). Informational findings are now displayed in a consolidated batch report before the interactive review loop begins, instead of being prompted individually. The batch report groups findings by category and shows item details (name, URI, username, score, reasons, missing fields). Passwords are masked. If there are no informational findings, the batch section is skipped entirely. (M15)

## [0.3.8] - 2026-04-21

### Changed
- Renamed `ExitCode.MALFORMED_INPUT` to `ExitCode.INTERNAL_ERROR` (value unchanged: 2) to better reflect its use for unexpected runtime errors rather than user-supplied malformed input.

### Fixed
- Narrowed bare `catch` in `src/commands/audit.ts` pending-file removal to only ignore ENOENT/NOT_FOUND; non-ENOENT errors now logged via `logger.warn('audit: failed to remove pending file after successful apply', ...)`.
- `ensureConfigFileExists` in `src/commands/config-edit.ts` now re-throws non-ENOENT errors instead of silently swallowing them.
- Expanded `UNSAFE_PATTERNS` in `src/adapters/logging.ts` to redact `*_CREDENTIAL*`, `*_AUTH`, `*API_KEY*`, and `*PASSPHRASE` context keys (defense-in-depth).
- Rewrote `website/docs/user-guide/commands.md` with complete flag tables, exit codes, and usage for all 6 CLI commands (audit, resume, discard, report, doctor, config) including all config subcommands (show, get, set, path, edit, reset). Removed incorrect `--fix` flag from doctor. Added exit code reference table. (M14)
## [0.3.7] - 2026-04-21

### Added
- [MILESTONE 13] GitHub Actions workflow to build and deploy the Docusaurus site from `website/` to GitHub Pages. (M13)
- [MILESTONE 12] Implemented all remaining CLI commands with dedicated CLI wrappers and `--help` support. (M12)
  - **`seiton resume`**: loads pending operations from a prior interrupted audit and applies them after interactive confirmation.
  - **`seiton discard`**: deletes the saved pending-ops queue.
  - **`seiton report`**: read-only vault analysis supporting `--json` output with redacted secrets.
  - **`seiton config get <key>`**: prints a specific configuration value.
  - **`seiton config set <key> <value>`**: sets a configuration value (supports `--unset`).
  - **`seiton config path`**: prints the active config file path.
  - **`seiton config edit`**: opens the config file in `$VISUAL`/`$EDITOR`.
  - **`seiton config reset`**: resets config to defaults (supports `--keep-custom-rules`, `--yes`).
  - CLI wrapper for `seiton audit` extracted into `src/cli/commands/audit.ts`.
- [MILESTONE 10/11] Analysis orchestrator, interactive review loop, Clack UI layer, password masking. (M10, M11)
- Resolved all unresolved architectural drift observations in `.tekhton/DRIFT_LOG.md`.

### Changed
- Main CLI router (`src/bw-organize.ts`) refactored to dispatch all subcommands to dedicated CLI wrappers. (M12)
- `src/cli/commands/config.ts` expanded to route all config sub-subcommands (show, get, set, path, edit, reset). (M12)
## [0.3.2] - 2026-04-21

### Added
- **Analysis orchestrator** (`src/lib/analyze/index.ts`): Pure function `analyzeItems()` that runs all 5 analyzers (duplicates, password reuse, weak passwords, missing fields, folder suggestions) over vault items. Replaces the inline stub in audit.ts that only checked for missing passwords. (M10)
- **Clack UI layer** (`src/ui/prompts.ts`): Thin wrapper around `@clack/prompts` providing `intro`, `outro`, `select`, `confirm`, `multiselect`, `text`, `spinner`, and log methods. Falls back to plain readline prompts when `ui.prompt_style: "plain"` is configured. (M11)
- **Password masking** (`src/ui/mask.ts`): `maskPassword` and `maskPartial` helpers respecting `ui.mask_character` config.
- **Interactive review loop** (`src/ui/review-loop.ts`): `interactiveReview` function walks findings one by one using clack prompts, presenting duplicates as keep-one-delete-rest, folder suggestions as accept/skip, and weak/missing/reuse as acknowledge.
- `@clack/prompts` runtime dependency for interactive terminal UI (spinners, select, confirm, intro/outro banners).

### Changed
- `seiton audit` now displays clack-styled intro/outro banners, spinners during fetch/analyze/apply, and per-finding interactive prompts.
- `seiton doctor` now displays clack-styled intro/outro banners and per-check success/error log messages.
- Dry-run mode continues to use the non-interactive batch review path (no prompts shown).

## [0.3.1] - 2026-04-20

### Added
- **Audit command orchestrator** (`src/commands/audit.ts`): Full pipeline — TTY enforcement, BW_SESSION check, preflight, fetch, validate, analyze, review, apply, sync. Handles `--dry-run`, `--skip`, `--limit`, and SIGINT gracefully. (M10)
- `seiton audit` command — the default subcommand that orchestrates the full pipeline: preflight checks, vault fetch, schema validation, analysis, interactive review, apply mutations, and sync.
- CLI flags `--skip <category>` (repeatable) and `--limit <n>` for the audit command.
- `--dry-run` flag skips the apply phase and exits 0 after presenting findings.
- TTY enforcement: `seiton audit` exits 64 when stdin/stdout is not a TTY, suggesting `seiton report` instead.
- SIGINT handling persists in-progress `PendingOp[]` to `pending.json` (mode 0600) and exits 130, honoring `audit.save_pending_on_sigint` config.
- Partial apply failure persists remaining + failed ops to `pending.json` and exits 1.
- `bw sync` runs after successful apply; sync failure is warn-only.
- `BwAdapter` interface in `src/lib/bw.ts` for structured vault operations (list items, list folders, edit, delete, create folder, sync).

### Changed
- Running `seiton` with no arguments now dispatches to the `audit` command instead of showing help text.

## [0.3.0] - 2026-04-20

### Added
- Release workflow (`.github/workflows/release.yml`): pushing a `vX.Y.Z` tag triggers build, test, npm publish with provenance, GitHub Release with SHA256SUMS, and a container-based smoke test.
- Smoke test (`test/integration/release-smoke.test.ts`): verifies the npm tarball contents, `--help`, `--version`, and VERSION file consistency.
- Install instructions in `README.md` updated with verification commands.

### Fixed
- Version synchronization: `package.json`, `src/version.ts`, `VERSION`, and `package-lock.json` now all report `0.3.0` (M9).

## [0.2.7] - 2026-04-20

### Added
- [MILESTONE 8 ✓] feat: Implement Milestone 8: Error recovery and idempotency

## [0.2.6] - 2026-04-20

### Added
- **Journal system** (`src/core/journal-types.ts`, `src/core/journal.ts`): Versioned transaction log format (version 1) for multi-step mutations. Supports creating, reading, writing, and removing journal entries. Includes backup/restore of original files, rollback on failure, and recovery detection for interrupted runs. (M8)

## [0.2.5] - 2026-04-20

### Added
- **Logging facade** (`src/adapters/logging.ts`): Structured logging adapter supporting text and JSON formats, configurable log level (error/warn/info/debug), context sanitization that redacts unsafe `SEITON_*` env var values, injectable clock for deterministic timestamps. (M7)

## [0.2.4] - 2026-04-20

### Added
- **BUG FIX:** `getEnvAsInt` in `src/adapters/process.ts` now treats empty string as invalid (throws `ProcessError` with `ENV_INVALID`) instead of returning 0. Test updated to match. (M6)

## [0.2.3] - 2026-04-20

### Added
- **Filesystem adapter** (`src/adapters/fs.ts`): Provides `readText`, `writeAtomic`, `remove`, `exists`, `ensureDir` operations. Atomic writes use temp-file + rename pattern. Symlink following is rejected. Optional root restriction prevents path escape. All errors are typed via `FsError` with discriminated `FsErrorCode`. (M5)

## [0.2.2] - 2026-04-20

### Added
- **Domain types** (`src/lib/domain/types.ts`): BwItem, BwFolder, BwLoginUri, BwLogin zod schemas with `.passthrough()` for round-trip safety. ItemType enum. BwErrorCode discriminated error type with `makeBwError` constructor. (M4)

## [0.2.1] - 2026-04-19

### Added
- Layered config loader (`src/config/loader.ts`) that discovers and reads config from a priority stack: `--config` CLI flag > `$SEITON_CONFIG` env var > `$XDG_CONFIG_HOME/seiton/config.json` > `$HOME/.config/seiton/config.json` > `$HOME/.seitonrc.json` > built-in defaults (M3)
- Zod-based config schema validation with strict mode rejecting unknown keys (M3)
- Environment variable overrides of the form `SEITON_<SECTION>_<KEY>` (M3)
- `seiton config show` command printing the effective merged config as JSON (M3)
- Path-sensitive values (`bw_binary`, `pending_queue`) redacted in `config show` output (M3)
- `config/default.yaml` and `config/schema.yaml` documenting defaults and schema constraints (M3)
- `zod` runtime dependency for config schema validation (M3)

## [0.2.0] - 2026-04-19

### Added
- Project bootstrap with `package.json`: ESM (`"type": "module"`), `bin` field pointing to `dist/bw-organize.js`, `engines.node >= 22`, npm scripts for build/lint/test (M2)
- TypeScript build system: `tsconfig.json` with strict mode, NodeNext modules, ES2022 target (M2)
- CLI entry point `src/bw-organize.ts` with `--version` and `--help` flags (M2)
- `ExitCode` enum in `src/exit-codes.ts` with BSD sysexits-compatible codes (M2)
- Version constant in `src/version.ts` with unit test verifying semver validity (M2)
- `.nvmrc` pinning Node 22, `.editorconfig` for consistent formatting (M2)

## [0.1.1] - 2026-04-19

### Added
- Created `README.md` with project description, prerequisites, quick start, command table, and configuration overview (M1)
