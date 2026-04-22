import { parseArgs } from 'node:util';
import { ExitCode } from '../../exit-codes.js';
import { applyNoColor } from '../no-color.js';
import { loadConfigOrExit } from '../../config/loader.js';
import { createLogger, createNoopLogger } from '../../adapters/logging.js';
import { createSystemClock } from '../../adapters/clock.js';
import { createProcessAdapter } from '../../adapters/process.js';
import { createFsAdapter } from '../../adapters/fs.js';
import { createBwAdapter } from '../../lib/bw.js';
import { createPromptAdapter } from '../../ui/prompts.js';
import { VERSION } from '../../version.js';
import { homedir } from 'node:os';
import { installSignalHandlers } from '../../core/signals.js';
import { loadPendingOps, resumeApply } from '../../commands/resume.js';
import type { PendingOp } from '../../lib/domain/pending.js';

const RESUME_HELP = `seiton resume — resume a previously interrupted audit session

Usage: seiton resume [flags]

Resumes applying pending operations saved from a prior audit that was
interrupted (e.g. by SIGINT). Shows the queued operations and asks for
confirmation before applying.

Flags:
  --config <path>   Override the config file location
  --no-color        Disable ANSI color output
  --verbose, -v     Increase log detail (-vv for trace)
  --quiet, -q       Suppress non-essential output
  --help, -h        Print this help and exit

Exit Codes:
  0   All pending operations applied successfully
  1   Some operations failed
  64  Non-interactive terminal or invalid arguments
  77  BW_SESSION not set`;

export async function runResumeCli(argv: string[]): Promise<void> {
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
    process.stderr.write(`seiton: resume: invalid arguments: ${detail}\nRun 'seiton resume --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  if (args.values.help) {
    process.stdout.write(`${RESUME_HELP}\n`);
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

  if (!proc.isTTY('stdin') || !proc.isTTY('stdout')) {
    process.stderr.write('seiton: resume: requires an interactive terminal.\n');
    process.exit(ExitCode.USAGE);
  }

  const session = proc.getEnv('BW_SESSION');
  if (!session) {
    process.stderr.write('seiton: resume: BW_SESSION is not set.\n  Run: export BW_SESSION=$(bw unlock --raw)\n');
    process.exit(ExitCode.NO_PERMISSION);
  }

  const config = await loadConfigOrExit({
    cliConfigPath: args.values.config as string | undefined,
    envConfigPath: process.env['SEITON_CONFIG'],
    logger: log,
  }, 'resume');

  const prompt = createPromptAdapter(config.ui.prompt_style);
  prompt.intro(`seiton resume v${VERSION}`);

  const loaded = await loadPendingOps(config.paths.pending_queue, log);
  if (!loaded.ok) {
    if (loaded.code === 'NO_PENDING') {
      prompt.logWarning(loaded.message);
      prompt.outro('Nothing to resume.');
      process.exit(ExitCode.SUCCESS);
    }
    prompt.logError(loaded.message);
    prompt.outro('Cannot resume — pending queue is corrupt or incompatible.');
    process.exit(ExitCode.GENERAL_ERROR);
  }

  prompt.logInfo(`${loaded.ops.length} pending operation(s) found.`);
  for (const op of loaded.ops) {
    prompt.logStep(formatOp(op));
  }

  const confirmed = await prompt.confirm('Apply these operations?', false);
  if (!confirmed) {
    prompt.cancelled('Resume cancelled. Pending queue preserved.');
    process.exit(ExitCode.SUCCESS);
  }

  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  const fsAdapter = createFsAdapter(homeDir, log);
  const bwAdapter = createBwAdapter(config.paths.bw_binary, log);

  const applySpin = prompt.startSpinner(`Applying ${loaded.ops.length} operations…`);
  const result = await resumeApply(loaded.ops, loaded.path, {
    session,
    bw: bwAdapter,
    fs: fsAdapter,
    clock,
    logger: log,
  });

  if (result.failed.length > 0 || result.remaining.length > 0) {
    applySpin.error(`${result.applied} applied, ${result.failed.length} failed, ${result.remaining.length} remaining`);
    prompt.outro(
      result.savedRemaining
        ? 'Resume finished with errors. Remaining ops saved.'
        : 'Resume finished with errors. Failed to persist remaining ops — recovery data printed above.',
    );
    process.exit(ExitCode.GENERAL_ERROR);
  }

  applySpin.stop(`${result.applied} operations applied`);
  if (result.pendingCleanupFailed) {
    prompt.logWarning(
      `Could not remove pending queue at ${loaded.path}. Delete it manually before running "seiton resume" again to avoid re-applying completed operations.`,
    );
  }
  prompt.outro('Resume complete. All pending operations applied.');
  process.exit(ExitCode.SUCCESS);
}

function formatOp(op: PendingOp): string {
  switch (op.kind) {
    case 'delete_item': return `Delete item ${op.itemId}`;
    case 'assign_folder': return `Assign "${op.folderName}" to ${op.itemId}`;
    case 'create_folder': return `Create folder "${op.folderName}"`;
  }
}
