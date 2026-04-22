import type { Config } from '../config/schema.js';
import type { Logger } from '../adapters/logging.js';
import type { Clock } from '../adapters/clock.js';
import type { FsAdapter } from '../adapters/fs.js';
import type { ProcessAdapter } from '../adapters/process.js';
import type { BwAdapter } from '../lib/bw.js';
import type { Finding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { ExitCode } from '../exit-codes.js';
import { VERSION } from '../version.js';
import { runPreflight } from './preflight.js';
import { applyOps } from './apply.js';
import { collectOpsFromFindings, interactiveReview } from '../ui/review-loop.js';
import { savePendingOps, resolvePendingPath } from './pending-io.js';
import { registerCleanup } from '../core/signals.js';
import { createPromptAdapter, type PromptAdapter } from '../ui/prompts.js';
import { analyzeItems } from '../lib/analyze/index.js';

export interface AuditOptions {
  config: Config;
  bw: BwAdapter;
  fs: FsAdapter;
  clock: Clock;
  proc: ProcessAdapter;
  logger: Logger;
  dryRun: boolean;
  cliSkipCategories: string[];
  cliLimit: number | null;
}

export async function runAudit(opts: AuditOptions): Promise<never> {
  const { config, proc, fs, clock, logger } = opts;

  if (!proc.isTTY('stdin') || !proc.isTTY('stdout')) {
    process.stderr.write('seiton: audit: requires an interactive terminal.\n  Use "seiton report" for non-interactive analysis.\n');
    return proc.exit(ExitCode.USAGE);
  }

  const session = proc.getEnv('BW_SESSION');
  if (!session) {
    process.stderr.write('seiton: audit: BW_SESSION is not set.\n  Run: export BW_SESSION=$(bw unlock --raw)\n');
    return proc.exit(ExitCode.NO_PERMISSION);
  }

  const pendingPath = resolvePendingPath(config.paths.pending_queue);
  let pendingOps: PendingOp[] = [];

  const unregister = registerCleanup(async () => {
    if (config.audit.save_pending_on_sigint && pendingOps.length > 0) {
      await savePendingOps(pendingOps, pendingPath, fs, clock, logger);
    }
  });

  try {
    return await executeAuditPipeline(opts, session, pendingPath, (ops) => { pendingOps = ops; });
  } finally {
    unregister();
  }
}

async function executeAuditPipeline(
  opts: AuditOptions,
  session: string,
  pendingPath: string,
  setPendingOps: (ops: PendingOp[]) => void,
): Promise<never> {
  const { config, bw, fs, clock, proc, logger, dryRun, cliSkipCategories, cliLimit } = opts;
  const prompt = createPromptAdapter(config.ui.prompt_style);

  prompt.intro(`seiton v${VERSION} — vault audit`);

  logger.info('audit: preflight');
  const preflightSpin = prompt.startSpinner('Running preflight checks…');
  const preflight = await runPreflight(bw, logger);
  if (!preflight.ok) {
    preflightSpin.error('Preflight failed');
    prompt.cancelled();
    const exitCode = mapPreflightExit(preflight.error.code);
    process.stderr.write(`seiton: audit: ${preflight.error.message}\n`);
    return proc.exit(exitCode);
  }
  preflightSpin.stop(`Preflight passed (bw ${preflight.data.bwVersion})`);

  logger.info('audit: fetching vault', { bwVersion: preflight.data.bwVersion });
  const fetchSpin = prompt.startSpinner('Fetching vault…');
  const [itemsResult, foldersResult] = await Promise.all([
    bw.listItems(session),
    bw.listFolders(session),
  ]);

  if (!itemsResult.ok) {
    fetchSpin.error('Failed to fetch items');
    prompt.cancelled();
    process.stderr.write(`seiton: audit: failed to fetch items: ${itemsResult.error.message}\n`);
    return proc.exit(ExitCode.MALFORMED_BW_OUTPUT);
  }
  if (!foldersResult.ok) {
    fetchSpin.error('Failed to fetch folders');
    prompt.cancelled();
    process.stderr.write(`seiton: audit: failed to fetch folders: ${foldersResult.error.message}\n`);
    return proc.exit(ExitCode.MALFORMED_BW_OUTPUT);
  }

  const items = itemsResult.data;
  fetchSpin.stop(`Fetched ${items.length} items, ${foldersResult.data.length} folders`);

  logger.info('audit: analyzing');
  const analyzeSpin = prompt.startSpinner('Analyzing vault…');
  const findings = analyzeItems(items, {
    strength: config.strength,
    dedup: config.dedup,
    folders: config.folders,
  });
  analyzeSpin.stop(`Found ${findings.length} findings`);

  const skipCategories = [
    ...config.audit.skip_categories,
    ...cliSkipCategories,
  ];
  const limitPerCategory = cliLimit ?? config.audit.limit_per_category;

  const reviewResult = await runReview(findings, {
    skipCategories,
    limitPerCategory,
    logger,
    prompt,
    maskChar: config.ui.mask_character,
    dryRun,
  });

  logger.info('audit: review complete', {
    opsCount: reviewResult.ops.length,
    reviewed: reviewResult.reviewed,
    skipped: reviewResult.skipped,
    cancelled: reviewResult.cancelled,
  });

  if (dryRun) {
    prompt.logInfo(`Dry-run complete. ${reviewResult.ops.length} operations would be applied.`);
    prompt.outro('Dry-run finished — no changes made.');
    return proc.exit(ExitCode.SUCCESS);
  }

  if (reviewResult.cancelled) {
    setPendingOps(reviewResult.ops);
    if (reviewResult.ops.length > 0) {
      await savePendingOps(reviewResult.ops, pendingPath, fs, clock, logger);
    }
    prompt.cancelled('Review cancelled.');
    prompt.outro(
      reviewResult.ops.length > 0
        ? 'Audit cancelled — partial ops saved for resumption.'
        : 'Audit cancelled — no ops to save.',
    );
    return proc.exit(ExitCode.GENERAL_ERROR);
  }

  if (reviewResult.ops.length === 0) {
    prompt.logSuccess('No findings require action. Vault is clean.');
    prompt.outro('Audit complete — nothing to do.');
    return proc.exit(ExitCode.SUCCESS);
  }

  setPendingOps(reviewResult.ops);

  logger.info('audit: applying operations', { count: reviewResult.ops.length });
  const applySpin = prompt.startSpinner(`Applying ${reviewResult.ops.length} operations…`);
  const applyResult = await applyOps(reviewResult.ops, session, bw, logger);

  if (applyResult.failed.length > 0 || applyResult.remaining.length > 0) {
    applySpin.error(`${applyResult.applied} applied, ${applyResult.failed.length} failed`);
    const persist = [...applyResult.failed, ...applyResult.remaining];
    await savePendingOps(persist, pendingPath, fs, clock, logger);
    setPendingOps([]);
    prompt.outro('Audit finished with errors. Remaining ops saved to pending queue.');
    return proc.exit(ExitCode.GENERAL_ERROR);
  }

  applySpin.stop(`${applyResult.applied} operations applied`);
  setPendingOps([]);

  try {
    await fs.remove(pendingPath);
  } catch { /* stale file may not exist */ }

  logger.info('audit: syncing vault');
  const syncResult = await bw.sync(session);
  if (!syncResult.ok) {
    logger.warn('audit: sync failed (non-fatal)', { error: syncResult.error.message });
    prompt.logWarning('Vault sync failed (non-fatal). Changes are local until next sync.');
  }

  prompt.outro(`Audit complete. ${applyResult.applied} operations applied.`);
  return proc.exit(ExitCode.SUCCESS);
}

interface RunReviewOpts {
  skipCategories: readonly string[];
  limitPerCategory: number | null;
  logger?: Logger;
  prompt: PromptAdapter;
  maskChar: string;
  dryRun: boolean;
}

async function runReview(
  findings: readonly Finding[],
  opts: RunReviewOpts,
): Promise<{ ops: PendingOp[]; reviewed: number; skipped: number; cancelled: boolean }> {
  if (opts.dryRun) {
    return collectOpsFromFindings(findings, {
      skipCategories: opts.skipCategories,
      limitPerCategory: opts.limitPerCategory,
      logger: opts.logger,
    });
  }

  return interactiveReview(findings, {
    skipCategories: opts.skipCategories,
    limitPerCategory: opts.limitPerCategory,
    logger: opts.logger,
    prompt: opts.prompt,
    maskChar: opts.maskChar,
  });
}

function mapPreflightExit(code: string): ExitCode {
  switch (code) {
    case 'BW_NOT_FOUND': return ExitCode.UNAVAILABLE;
    case 'VAULT_LOCKED': return ExitCode.NO_PERMISSION;
    case 'SESSION_MISSING': return ExitCode.NO_PERMISSION;
    default: return ExitCode.GENERAL_ERROR;
  }
}
