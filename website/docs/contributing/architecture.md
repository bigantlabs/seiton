---
sidebar_position: 2
---

# Architecture

## Data Flow

```
argv/env/config  →  Bootstrap  →  RunContext
RunContext       →  Preflight (bw status, version)
RunContext       →  Fetch (bw list items, bw list folders)  →  raw JSON
raw JSON         →  Validate (zod)                          →  Item[], Folder[]
Item[]           →  Analyze (pure)                          →  Findings
Findings         →  Present (Clack prompts)                 →  PendingOp[]
PendingOp[]      →  Apply (serial bw edit/create/delete)    →  applied / failed
(on failure)     →  persist PendingOp[] to pending.json
(on success)     →  bw sync (fire-and-forget warn-only)
```

No stage calls backwards. The analyzer cannot invoke `bw`. The apply phase cannot re-analyze.

## Module Layers

### Commands (`src/commands/`)

The composition root. May import from anywhere under `src/` but is never imported by library code. Reads `process.argv`, `process.env`, and `process.stdout.isTTY`.

### Library (`src/lib/`)

Pure analysis and infrastructure code. Subdivided by concern:

- **`bw.ts`** — the sole subprocess boundary (CLI adapter). Only file allowed to call `child_process` for `bw` commands.
- **`bw-serve.ts`** — HTTP adapter implementing `BwAdapter` via `bw serve` REST API. Uses `node:http` instead of subprocesses. An alternative transport behind the same interface; opt-in via `bw_serve.enabled` config.
- **`bw-serve-lifecycle.ts`** — manages the `bw serve` child process lifecycle: spawn, health-check polling, graceful stop. Registered with signal handlers for cleanup on SIGINT/SIGTERM.
- **`domain/`** — shared types (`BwItem`, `Finding`, `PendingOp`). No logic, only type definitions and zod schemas.
- **`analyze/`**, **`dedup/`**, **`strength/`**, **`folders/`** — pure analysis modules. No I/O, no `bw` calls, no `process.*` reads.
- **`pending.ts`** — reads/writes the pending queue to disk.

### Config (`src/config/`)

Schema definition, file discovery, loading, and migration. May not import from `bw.ts` or commands.

### CLI (`src/cli/`)

Argument parsing, help text, TTY/color detection. The bridge between raw `process` state and typed `RunContext`.

### Core (`src/core/`)

Cross-cutting infrastructure: write-ahead journal, transactions, signal handling.

## Trust Boundaries

The only external trust boundary is the `bw` CLI subprocess. seiton validates all `bw` output with zod schemas using `.passthrough()` to preserve unknown fields for round-tripping.

User input (config files, CLI args) is validated at entry with zod. Invalid input fails immediately with a typed error.

## Error Strategy

Every module boundary uses a discriminated error union (`BwError`, `ConfigError`, `PendingQueueError`, `UserAbortError`). The command dispatcher maps error codes to BSD `sysexits` exit codes.

No error is swallowed. Every `catch` either converts to a typed error and rethrows, or logs and makes a deliberate recovery decision.
