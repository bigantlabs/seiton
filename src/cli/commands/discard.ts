import { parseArgs } from 'node:util';
import { homedir } from 'node:os';
import { ExitCode } from '../../exit-codes.js';
import { applyNoColor } from '../no-color.js';
import { loadConfigOrExit } from '../../config/loader.js';
import { createLogger, createNoopLogger } from '../../adapters/logging.js';
import { createSystemClock } from '../../adapters/clock.js';
import { createFsAdapter } from '../../adapters/fs.js';
import { createPromptAdapter } from '../../ui/prompts.js';
import { VERSION } from '../../version.js';
import { discardPending } from '../../commands/discard.js';

const DISCARD_HELP = `seiton discard — delete the saved pending-ops queue

Usage: seiton discard [flags]

Deletes the pending operations queue saved from a prior audit that was
interrupted. This is a non-reversible action.

Flags:
  --config <path>   Override the config file location
  --no-color        Disable ANSI color output
  --verbose, -v     Increase log detail (-vv for trace)
  --quiet, -q       Suppress non-essential output
  --help, -h        Print this help and exit

Exit Codes:
  0   Pending queue deleted (or already absent)
  64  Invalid arguments`;

export async function runDiscardCli(argv: string[]): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      args: argv,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
      },
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`seiton: discard: invalid arguments: ${detail}\nRun 'seiton discard --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  if (args.values.help) {
    process.stdout.write(`${DISCARD_HELP}\n`);
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

  const config = await loadConfigOrExit({
    cliConfigPath: args.values.config as string | undefined,
    envConfigPath: process.env['SEITON_CONFIG'],
    logger: log,
  }, 'discard');

  const prompt = createPromptAdapter(config.ui.prompt_style);
  prompt.intro(`seiton discard v${VERSION}`);

  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  const fsAdapter = createFsAdapter(homeDir, log);
  const result = await discardPending(config.paths.pending_queue, fsAdapter, log);

  if (!result.ok) {
    if (result.code === 'REMOVE_FAILED') {
      prompt.logError(result.message);
      prompt.outro('Discard failed.');
      process.exit(ExitCode.CANT_CREATE);
    }
    prompt.logInfo(result.message);
    prompt.outro('Nothing to discard.');
    process.exit(ExitCode.SUCCESS);
  }

  prompt.logSuccess(`Pending queue deleted: ${result.path}`);
  prompt.outro('Discard complete.');
  process.exit(ExitCode.SUCCESS);
}
