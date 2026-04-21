#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { VERSION } from './version.js';
import { ExitCode } from './exit-codes.js';
import { configShow } from './cli/commands/config.js';
import { runDoctor } from './cli/commands/doctor.js';
import { createLogger, createNoopLogger } from './adapters/logging.js';
import { createSystemClock } from './adapters/clock.js';
import { createProcessAdapter } from './adapters/process.js';
import { createFsAdapter } from './adapters/fs.js';
import { createBwAdapter } from './lib/bw.js';
import { loadConfig } from './config/loader.js';
import { installSignalHandlers } from './core/signals.js';
import { runAudit } from './commands/audit.js';

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

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const firstPos = findFirstPositional(rawArgs);

  if (firstPos?.value === 'doctor') {
    const doctorArgs = [...rawArgs.slice(0, firstPos.index), ...rawArgs.slice(firstPos.index + 1)];
    const verboseCount = doctorArgs.filter((a) => a === '--verbose' || a === '-v').length;
    const quiet = doctorArgs.includes('--quiet') || doctorArgs.includes('-q');
    const earlyLog = quiet || verboseCount === 0
      ? createNoopLogger()
      : createLogger({
          format: 'text',
          level: verboseCount >= 2 ? 'debug' : 'info',
          clock: createSystemClock(),
        });
    installSignalHandlers(earlyLog);
    await runDoctor(doctorArgs);
    return;
  }

  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
        config: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
        skip: { type: 'string', multiple: true },
        limit: { type: 'string' },
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`seiton: invalid arguments: ${detail}\nRun 'seiton --help' for usage.\n`);
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

  const verboseCount = Array.isArray(args.values.verbose)
    ? args.values.verbose.length
    : args.values.verbose ? 1 : 0;
  const quiet = Boolean(args.values.quiet);

  const clock = createSystemClock();
  const log = quiet || verboseCount === 0
    ? createNoopLogger()
    : createLogger({ format: 'text', level: verboseCount >= 2 ? 'debug' : 'info', clock });

  installSignalHandlers(log);

  const dryRun = Boolean(args.values['dry-run']);
  const [positionalCommand, subcommand] = args.positionals;

  log.info('seiton started', { command: positionalCommand, version: VERSION, dryRun });

  if (positionalCommand === 'config' && subcommand === 'show') {
    log.debug('dispatching config show');
    await configShow(args.values.config as string | undefined, log, dryRun);
    return;
  }

  const command = positionalCommand ?? 'audit';
  if (command === 'audit') {
    const config = await loadConfig({
      cliConfigPath: args.values.config as string | undefined,
      envConfigPath: process.env['SEITON_CONFIG'],
      logger: log,
    });

    const proc = createProcessAdapter(process.env, (code) => process.exit(code), log);
    const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '/';
    const fsAdapter = createFsAdapter(homeDir, log);
    const bwAdapter = createBwAdapter(config.paths.bw_binary, log);
    const cliSkip = (Array.isArray(args.values.skip) ? args.values.skip : []).filter((v): v is string => typeof v === 'string');
    const cliLimitRaw = args.values.limit as string | undefined;
    let cliLimit: number | null = null;
    if (cliLimitRaw) {
      const n = Number(cliLimitRaw);
      if (!Number.isFinite(n) || n < 1 || n > 100_000 || !Number.isInteger(n)) {
        process.stderr.write(`seiton: audit: --limit must be an integer between 1 and 100000\n`);
        process.exit(ExitCode.USAGE);
      }
      cliLimit = n;
    }

    await runAudit({
      config,
      bw: bwAdapter,
      fs: fsAdapter,
      clock,
      proc,
      logger: log,
      dryRun,
      cliSkipCategories: cliSkip,
      cliLimit,
    });
    return;
  }

  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(ExitCode.SUCCESS);
}

await main();
