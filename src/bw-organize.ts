#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { VERSION } from './version.js';
import { ExitCode } from './exit-codes.js';
import { configShow } from './cli/commands/config.js';

const HELP_TEXT = `seiton v${VERSION} — interactive Bitwarden vault auditor

Usage: seiton [command] [flags]

Commands:
  audit     Fetch, analyze, review findings, apply approved changes (default)
  resume    Resume a previously interrupted audit session
  discard   Delete the saved pending-ops queue
  report    Read-only analysis (supports --json)
  doctor    Preflight checks for bw, session, and config
  config    Get, set, edit, reset configuration

Global Flags:
  --config <path>   Override the config file location
  --no-color        Disable ANSI color output
  --verbose, -v     Increase log detail (-vv for trace)
  --quiet, -q       Suppress non-essential output
  --help, -h        Print help and exit
  --version, -V     Print version and exit

Run 'seiton <command> --help' for command-specific usage.`;

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`seiton: ${detail}\nRun 'seiton --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  if (args.values.version) {
    process.stdout.write(`${VERSION}\n`);
    process.exit(ExitCode.SUCCESS);
  }

  if (args.values.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    process.exit(ExitCode.SUCCESS);
  }

  const [command, subcommand] = args.positionals;
  if (command === 'config' && subcommand === 'show') {
    await configShow(args.values.config as string | undefined);
    return;
  }

  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(ExitCode.SUCCESS);
}

await main();
