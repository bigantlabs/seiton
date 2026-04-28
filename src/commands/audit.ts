import type { Config } from '../config/schema.js';
import type { Logger } from '../adapters/logging.js';
import type { Clock } from '../adapters/clock.js';
import type { FsAdapter } from '../adapters/fs.js';
import type { ProcessAdapter } from '../adapters/process.js';
import type { BwAdapter } from '../lib/bw.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { ExitCode } from '../exit-codes.js';
import { VERSION } from '../version.js';
import { runPreflight, mapPreflightExit } from './preflight.js';
import { applyOps } from './apply.js';
import { formatProgressMessage, formatApplySummary } from './apply-progress.js';
import type { RuleSaveRequest } from '../ui/review-loop.js';
import { savePendingOps, resolvePendingPath } from './pending-io.js';
import { registerCleanup } from '../core/signals.js';
import { createPromptAdapter } from '../ui/prompts.js';
import { analyzeItems } from '../lib/analyze/index.js';
import { addCustomRule } from '../config/rules.js';
import { resolveConfigHome } from '../config/paths.js';
import { join } from 'node:path';
import { tryStartServe, stopServe } from './serve-bridge.js';
import { runReview } from './audit-review.js';

export interface AuditOptions {
  config: Config;
  configFilePath: string | null;
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
  const { config, fs, clock, proc, logger, dryRun, cliSkipCategories, cliLimit } = opts;
  let bw = opts.bw;
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

  const serve = await tryStartServe(config, session, opts.bw, logger);
  bw = serve.bw;
  if (config.bw_serve.enabled && serve.serveHandle) {
    prompt.logSuccess(`bw serve ready on port ${config.bw_serve.port}`);
  } else if (config.bw_serve.enabled) {
    prompt.logWarning('bw serve unavailable — using CLI (slower)');
  }

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
  const itemCacheMap = new Map(items.map(item => [item.id, item]));
  const existingFoldersByName = new Map(foldersResult.data.map(f => [f.name.toLowerCase(), f.id]));
  const folderNamesById = new Map(foldersResult.data.map(f => [f.id, f.name]));
  fetchSpin.stop(`Fetched ${items.length} items, ${foldersResult.data.length} folders`);

  logger.info('audit: analyzing');
  const analyzeSpin = prompt.startSpinner('Analyzing vault…');
  const findings = analyzeItems(items, {
    strength: config.strength,
    dedup: config.dedup,
    folders: config.folders,
  }, foldersResult.data);
  analyzeSpin.stop(`Found ${findings.length} findings`);

  const skipCategories = [
    ...config.audit.skip_categories,
    ...cliSkipCategories,
  ];
  const limitPerCategory = cliLimit ?? config.audit.limit_per_category;

  const configForWrite = opts.configFilePath
    ?? join(resolveConfigHome(), 'seiton', 'config.json');

  const onRuleSave = async (request: RuleSaveRequest): Promise<void> => {
    const result = await addCustomRule(
      configForWrite,
      { folder: request.folder, keywords: [request.keyword] },
      logger,
    );
    if (result.ok) {
      prompt.logSuccess(`Rule saved: "${request.keyword}" → ${request.folder}`);
    } else {
      prompt.logWarning(`Could not save rule: ${result.error}`);
    }
  };

  const reviewResult = await runReview(findings, {
    skipCategories,
    limitPerCategory,
    logger,
    prompt,
    promptStyle: config.ui.prompt_style,
    maskChar: config.ui.mask_character,
    dryRun,
    enabledCategories: config.folders.enabled_categories,
    existingFoldersByName,
    folderNamesById,
    stdin: process.stdin,
    stdout: process.stdout,
    isTTY: () => proc.isTTY('stdin') && proc.isTTY('stdout'),
    onProgress: (ops) => setPendingOps([...ops]),
    onRuleSave,
  });

  logger.info('audit: review complete', {
    opsCount: reviewResult.ops.length,
    reviewed: reviewResult.reviewed,
    skipped: reviewResult.skipped,
    cancelled: reviewResult.cancelled,
  });

  if (dryRun) {
    await stopServe(serve.serveHandle, logger);
    prompt.logInfo(`Dry-run complete. ${reviewResult.ops.length} operations would be applied.`);
    prompt.outro('Dry-run finished — no changes made.');
    return proc.exit(ExitCode.SUCCESS);
  }

  if (reviewResult.cancelled) {
    await stopServe(serve.serveHandle, logger);
    setPendingOps(reviewResult.ops);
    if (reviewResult.ops.length > 0) {
      const saved = await savePendingOps(reviewResult.ops, pendingPath, fs, clock, logger);
      if (!saved) {
        prompt.logWarning(`Could not save pending queue to ${pendingPath} — recovery data printed above.`);
      }
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
    await stopServe(serve.serveHandle, logger);
    prompt.logSuccess('No findings require action. Vault is clean.');
    prompt.outro('Audit complete — nothing to do.');
    return proc.exit(ExitCode.SUCCESS);
  }

  const pendingSet = new Set(reviewResult.ops);
  setPendingOps([...pendingSet]);

  logger.info('audit: applying operations', { count: reviewResult.ops.length });
  const applySpin = prompt.startSpinner(`Applying ${reviewResult.ops.length} operations…`);
  const applyResult = await applyOps(reviewResult.ops, session, bw, logger, (applied) => {
    pendingSet.delete(applied);
    setPendingOps([...pendingSet]);
  }, (progress) => {
    applySpin.message(formatProgressMessage(progress));
  }, itemCacheMap);

  const summary = formatApplySummary(applyResult.timings, applyResult.failed.length);

  if (applyResult.failed.length > 0 || applyResult.remaining.length > 0) {
    applySpin.error(`${applyResult.applied} applied, ${applyResult.failed.length} failed, ${applyResult.remaining.length} remaining`);
    prompt.logStep(summary);
    const persist = [...applyResult.failed, ...applyResult.remaining];
    const saved = await savePendingOps(persist, pendingPath, fs, clock, logger);
    setPendingOps([]);
    await stopServe(serve.serveHandle, logger);
    prompt.outro(
      saved
        ? 'Audit finished with errors. Remaining ops saved to pending queue.'
        : 'Audit finished with errors. Failed to persist remaining ops — recovery data printed above.',
    );
    return proc.exit(ExitCode.GENERAL_ERROR);
  }

  applySpin.stop(`${applyResult.applied} operations applied`);
  prompt.logStep(summary);
  setPendingOps([]);
  try {
    await fs.remove(pendingPath);
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'ENOENT' && code !== 'NOT_FOUND') {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('audit: failed to remove pending file after successful apply', { path: pendingPath, error: message });
      prompt.logWarning(
        `Could not remove pending queue at ${pendingPath}. Delete it manually before running "seiton resume" to avoid re-applying completed operations.`,
      );
    }
  }
  logger.info('audit: syncing vault');
  const syncResult = await bw.sync(session);
  if (!syncResult.ok) {
    logger.warn('audit: sync failed (non-fatal)', { error: syncResult.error.message });
    prompt.logWarning('Vault sync failed (non-fatal). Changes are local until next sync.');
  }

  await stopServe(serve.serveHandle, logger);

  prompt.outro(`Audit complete. ${applyResult.applied} operations applied.`);
  return proc.exit(ExitCode.SUCCESS);
}

