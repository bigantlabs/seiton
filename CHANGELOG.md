# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
