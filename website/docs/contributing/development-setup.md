---
sidebar_position: 1
---

# Development Setup

## Prerequisites

- Node.js >= 22 (pinned via `.nvmrc`)
- Git >= 2.30
- A POSIX shell (bash or zsh)
- Optional: Bitwarden CLI for manual testing against a real vault

## Getting Started

```bash
git clone https://github.com/bigantlabs/seiton.git
cd seiton
nvm use            # picks up .nvmrc
npm install
npm run build
npm test
```

## Development Workflow

### Build

```bash
npm run build      # Compile TypeScript
```

### Run Locally

During development, use `tsx` to run without a build step:

```bash
npx tsx src/bw-organize.ts --help
npx tsx src/bw-organize.ts doctor
```

Or run the compiled output:

```bash
node dist/bw-organize.js --help
```

### Test

```bash
npm test                  # Fast unit test suite
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
```

Tests never hit the real network and never touch your home directory. Integration tests use a fake `bw` binary that returns canned responses.

### Type Check

```bash
npm run lint    # tsc --noEmit
```

## Project Structure

```
src/
├── bw-organize.ts       # Entry point
├── exit-codes.ts        # Exit code enum
├── commands/            # Command handlers (composition root)
├── core/               # Journal, transactions, signals
├── lib/
│   ├── bw.ts           # Sole subprocess boundary
│   ├── domain/         # Types: BwItem, Finding, PendingOp
│   ├── analyze/        # Pure analysis orchestration
│   ├── dedup/          # Duplicate detection
│   ├── strength/       # Password strength scoring
│   ├── folders/        # Folder classification
│   └── pending.ts      # Pending queue persistence
├── config/             # Config schema, loading, migrations
├── cli/                # Argument parsing, help text, TTY detection
├── report/             # Output formatting (text, JSON)
└── ui/                 # Interactive prompts
```

## Key Architectural Rules

- **Pure core, impure shell.** Analysis code (`src/lib/analyze/`, `dedup/`, `strength/`, `folders/`) performs no I/O.
- **Array-form subprocesses only.** Only `spawn('bw', [...])` is allowed — no shell string interpolation.
- **Typed errors at boundaries.** Every module exports discriminated error unions, never bare `throw new Error()`.
- **No plaintext in output.** Passwords, TOTP seeds, and note bodies never reach logs, error messages, or disk.

## Running Against a Real Vault

```bash
export BW_SESSION=$(bw unlock --raw)
npx tsx src/bw-organize.ts audit --dry-run
```

The `--dry-run` flag shows findings without applying changes — safe for testing.

## Git Conventions

- Branch naming: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`
- Commit style: Conventional Commits (`feat(audit): add --limit flag`)
- Squash-merge to `main`
