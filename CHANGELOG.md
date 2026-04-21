# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Added
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
- Version synchronization: `package.json`, `src/version.ts`, and `VERSION` file now all report `0.3.0`.

- Synchronized version across `package.json`, `src/version.ts`, `VERSION`, and `package-lock.json` to `0.3.0` (M9)
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
