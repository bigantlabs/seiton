#!/usr/bin/env node

import { VERSION } from './version.js';
import { ExitCode } from './exit-codes.js';
import { runDoctor } from './cli/commands/doctor.js';
import { runAuditCli } from './cli/commands/audit.js';
import { runResumeCli } from './cli/commands/resume.js';
import { runDiscardCli } from './cli/commands/discard.js';
import { runReportCli } from './cli/commands/report.js';
import { runConfigCli } from './cli/commands/config.js';

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
  --dry-run         Print planned actions without performing them
  --no-color        Disable ANSI color output
  --verbose, -v     Increase log detail (-vv for trace)
  --quiet, -q       Suppress non-essential output
  --skip <category> Skip a finding category (repeatable)
  --limit <n>       Stop after n findings per category
  --help, -h        Print help and exit
  --version, -V     Print version and exit

Run 'seiton <command> --help' for command-specific usage.`;

const COMMANDS = new Set(['audit', 'resume', 'discard', 'report', 'doctor', 'config']);
const VALUE_TAKING_FLAGS = new Set(['--config', '--skip', '--limit']);

function findFirstPositional(rawArgs: string[]): { index: number; value: string } | undefined {
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]!;
    if (!a.startsWith('-')) {
      return { index: i, value: a };
    }
    if (VALUE_TAKING_FLAGS.has(a)) {
      i++;
    }
  }
  return undefined;
}

function extractCommandArgs(rawArgs: string[], commandIndex: number): string[] {
  return [...rawArgs.slice(0, commandIndex), ...rawArgs.slice(commandIndex + 1)];
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--version') || rawArgs.includes('-V')) {
    process.stdout.write(`${VERSION}\n`);
    process.exit(ExitCode.SUCCESS);
  }

  const firstPos = findFirstPositional(rawArgs);

  if (!firstPos || !COMMANDS.has(firstPos.value)) {
    if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
      process.stdout.write(`${HELP_TEXT}\n`);
      process.exit(ExitCode.SUCCESS);
    }
  }

  const command = firstPos?.value ?? 'audit';
  const commandArgs = firstPos ? extractCommandArgs(rawArgs, firstPos.index) : rawArgs;

  if (!COMMANDS.has(command)) {
    process.stderr.write(`seiton: unknown command "${command}"\nRun 'seiton --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  switch (command) {
    case 'audit': return runAuditCli(commandArgs);
    case 'resume': return runResumeCli(commandArgs);
    case 'discard': return runDiscardCli(commandArgs);
    case 'report': return runReportCli(commandArgs);
    case 'doctor': return runDoctor(commandArgs);
    case 'config': return runConfigCli(commandArgs);
  }
}

await main();
