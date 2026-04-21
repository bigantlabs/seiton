import { parseArgs } from 'node:util';
import { ExitCode } from '../../exit-codes.js';
import { applyNoColor } from '../no-color.js';
import { loadConfig } from '../../config/loader.js';
import { createLogger, createNoopLogger } from '../../adapters/logging.js';
import { createSystemClock } from '../../adapters/clock.js';
import { createProcessAdapter } from '../../adapters/process.js';
import { createBwAdapter } from '../../lib/bw.js';
import { installSignalHandlers } from '../../core/signals.js';
import { runReport, formatFindingsText, formatFindingsJson } from '../../commands/report.js';

const REPORT_HELP = `seiton report — read-only analysis (supports --json)

Usage: seiton report [flags]

Fetches and analyzes the vault without making any changes. Outputs findings
in text or JSON format. Does not require an interactive terminal.

Flags:
  --json            Output findings in JSON format
  --config <path>   Override the config file location
  --no-color        Disable ANSI color output
  --verbose, -v     Increase log detail (-vv for trace)
  --quiet, -q       Suppress non-essential output
  --skip <category> Skip a finding category (repeatable)
  --limit <n>       Stop after n findings per category
  --help, -h        Print this help and exit

Exit Codes:
  0   Report completed successfully
  3   Failed to parse bw output
  64  Invalid arguments
  77  BW_SESSION not set`;

export async function runReportCli(argv: string[]): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      args: argv,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        json: { type: 'boolean' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
        skip: { type: 'string', multiple: true },
        limit: { type: 'string' },
      },
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`seiton: report: invalid arguments: ${detail}\nRun 'seiton report --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  if (args.values.help) {
    process.stdout.write(`${REPORT_HELP}\n`);
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

  const proc = createProcessAdapter(process.env, (code) => process.exit(code), log);
  const session = proc.getEnv('BW_SESSION');
  if (!session) {
    process.stderr.write('seiton: report: BW_SESSION is not set.\n  Run: export BW_SESSION=$(bw unlock --raw)\n');
    process.exit(ExitCode.NO_PERMISSION);
  }

  const config = await loadConfig({
    cliConfigPath: args.values.config as string | undefined,
    envConfigPath: process.env['SEITON_CONFIG'],
    logger: log,
  });

  const bwAdapter = createBwAdapter(config.paths.bw_binary, log);
  const useJson = Boolean(args.values.json);

  const cliSkip = (Array.isArray(args.values.skip) ? args.values.skip : [])
    .filter((v): v is string => typeof v === 'string');

  let cliLimit: number | null = null;
  const cliLimitRaw = args.values.limit as string | undefined;
  if (cliLimitRaw) {
    const n = Number(cliLimitRaw);
    if (!Number.isFinite(n) || n < 1 || n > 100_000 || !Number.isInteger(n)) {
      process.stderr.write(`seiton: report: --limit must be an integer between 1 and 100000\n`);
      process.exit(ExitCode.USAGE);
    }
    cliLimit = n;
  }

  const result = await runReport({
    config,
    session,
    bw: bwAdapter,
    logger: log,
    skipCategories: cliSkip,
    limitPerCategory: cliLimit,
  });

  if (!result.ok) {
    process.stderr.write(`seiton: report: ${result.message}\n`);
    process.exit(ExitCode.MALFORMED_BW_OUTPUT);
  }

  if (useJson) {
    process.stdout.write(formatFindingsJson(
      result.findings,
      config.ui.mask_character,
      result.itemCount,
      result.folderCount,
    ));
  } else {
    process.stdout.write(formatFindingsText(result.findings));
  }

  process.exit(ExitCode.SUCCESS);
}
