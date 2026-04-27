import { parseArgs } from 'node:util';
import { homedir } from 'node:os';
import { ExitCode } from '../../exit-codes.js';
import { applyNoColor } from '../no-color.js';
import { loadConfigWithPath, ConfigError } from '../../config/loader.js';
import { createLogger, createNoopLogger } from '../../adapters/logging.js';
import { createSystemClock } from '../../adapters/clock.js';
import { createProcessAdapter } from '../../adapters/process.js';
import { createFsAdapter } from '../../adapters/fs.js';
import { createBwAdapter } from '../../lib/bw.js';
import { installSignalHandlers } from '../../core/signals.js';
import { runAudit } from '../../commands/audit.js';

const AUDIT_HELP = `seiton audit — fetch, analyze, review findings, apply approved changes

Usage: seiton audit [flags]

Flags:
  --config <path>   Override the config file location
  --dry-run         Print planned actions without performing them
  --no-color        Disable ANSI color output
  --verbose, -v     Increase log detail (-vv for trace)
  --quiet, -q       Suppress non-essential output
  --skip <category> Skip a finding category (repeatable)
  --limit <n>       Stop after n findings per category
  --help, -h        Print this help and exit

Exit Codes:
  0   Audit completed successfully
  1   Apply phase had failures
  64  Non-interactive terminal or invalid arguments
  69  bw CLI not available
  77  Vault locked or session missing`;

export async function runAuditCli(argv: string[]): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      args: argv,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        config: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
        skip: { type: 'string', multiple: true },
        limit: { type: 'string' },
      },
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`seiton: audit: invalid arguments: ${detail}\nRun 'seiton audit --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  if (args.values.help) {
    process.stdout.write(`${AUDIT_HELP}\n`);
    process.exit(ExitCode.SUCCESS);
  }

  applyNoColor(args.values['no-color']);

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

  let config;
  let configPath: string | null;
  try {
    const loaded = await loadConfigWithPath({
      cliConfigPath: args.values.config as string | undefined,
      envConfigPath: process.env['SEITON_CONFIG'],
      logger: log,
    });
    config = loaded.config;
    configPath = loaded.path;
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      process.stderr.write(`seiton: audit: ${err.message}\n`);
      process.exit(ExitCode.USAGE);
    }
    throw err;
  }

  const proc = createProcessAdapter(process.env, (code) => process.exit(code), log);
  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  const fsAdapter = createFsAdapter(homeDir, log);
  const bwAdapter = createBwAdapter(config.paths.bw_binary, log);

  const cliSkip = (Array.isArray(args.values.skip) ? args.values.skip : [])
    .filter((v): v is string => typeof v === 'string');

  let cliLimit: number | null = null;
  const cliLimitRaw = args.values.limit as string | undefined;
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
    configFilePath: configPath,
    bw: bwAdapter,
    fs: fsAdapter,
    clock,
    proc,
    logger: log,
    dryRun,
    cliSkipCategories: cliSkip,
    cliLimit,
  });
}
