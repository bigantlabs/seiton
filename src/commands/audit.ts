import type { Config } from '../config/schema.js';
import type { Logger } from '../adapters/logging.js';
import type { Clock } from '../adapters/clock.js';
import type { FsAdapter } from '../adapters/fs.js';
import type { ProcessAdapter } from '../adapters/process.js';
import type { BwAdapter } from '../lib/bw.js';
import type { Finding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { ExitCode } from '../exit-codes.js';
import { runPreflight } from './preflight.js';
import { applyOps } from './apply.js';
import { collectOpsFromFindings } from '../ui/review-loop.js';
import { savePendingOps, resolvePendingPath } from './pending-io.js';
import { registerCleanup } from '../core/signals.js';

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

  logger.info('audit: preflight');
  const preflight = await runPreflight(bw, logger);
  if (!preflight.ok) {
    const exitCode = mapPreflightExit(preflight.error.code);
    process.stderr.write(`seiton: audit: ${preflight.error.message}\n`);
    return proc.exit(exitCode);
  }

  logger.info('audit: fetching vault', { bwVersion: preflight.data.bwVersion });
  const [itemsResult, foldersResult] = await Promise.all([
    bw.listItems(session),
    bw.listFolders(session),
  ]);

  if (!itemsResult.ok) {
    process.stderr.write(`seiton: audit: failed to fetch items: ${itemsResult.error.message}\n`);
    return proc.exit(ExitCode.MALFORMED_BW_OUTPUT);
  }
  if (!foldersResult.ok) {
    process.stderr.write(`seiton: audit: failed to fetch folders: ${foldersResult.error.message}\n`);
    return proc.exit(ExitCode.MALFORMED_BW_OUTPUT);
  }

  const items = itemsResult.data;
  const _folders = foldersResult.data;
  logger.info('audit: vault fetched', { itemCount: items.length, folderCount: _folders.length });

  logger.info('audit: analyzing');
  const findings = analyzeItems(items, config);

  const skipCategories = [
    ...config.audit.skip_categories,
    ...cliSkipCategories,
  ];
  const limitPerCategory = cliLimit ?? config.audit.limit_per_category;

  const reviewResult = collectOpsFromFindings(findings, {
    skipCategories,
    limitPerCategory,
    logger,
  });

  setPendingOps(reviewResult.ops);

  logger.info('audit: review complete', {
    opsCount: reviewResult.ops.length,
    reviewed: reviewResult.reviewed,
    skipped: reviewResult.skipped,
  });

  if (dryRun) {
    process.stderr.write(`seiton: audit: dry-run complete. ${reviewResult.ops.length} operations would be applied.\n`);
    return proc.exit(ExitCode.SUCCESS);
  }

  if (reviewResult.ops.length === 0) {
    process.stderr.write('seiton: audit: no findings require action. Vault is clean.\n');
    return proc.exit(ExitCode.SUCCESS);
  }

  logger.info('audit: applying operations', { count: reviewResult.ops.length });
  const applyResult = await applyOps(reviewResult.ops, session, bw, logger);

  if (applyResult.failed.length > 0 || applyResult.remaining.length > 0) {
    const persist = [...applyResult.failed, ...applyResult.remaining];
    await savePendingOps(persist, pendingPath, fs, clock, logger);
    setPendingOps([]);
    process.stderr.write(
      `seiton: audit: ${applyResult.applied} applied, ${applyResult.failed.length} failed. Remaining saved to pending queue.\n`,
    );
    return proc.exit(ExitCode.GENERAL_ERROR);
  }

  setPendingOps([]);

  logger.info('audit: syncing vault');
  const syncResult = await bw.sync(session);
  if (!syncResult.ok) {
    logger.warn('audit: sync failed (non-fatal)', { error: syncResult.error.message });
  }

  process.stderr.write(`seiton: audit: complete. ${applyResult.applied} operations applied.\n`);
  return proc.exit(ExitCode.SUCCESS);
}

function analyzeItems(items: readonly import('../lib/domain/types.js').BwItem[], _config: Config): Finding[] {
  const findings: Finding[] = [];
  for (const item of items) {
    if (item.login?.password === '' || (item.login && !item.login.password)) {
      findings.push({
        category: 'missing',
        item,
        missingFields: ['password'],
      });
    }
  }
  return findings;
}

function mapPreflightExit(code: string): ExitCode {
  switch (code) {
    case 'BW_NOT_FOUND': return ExitCode.UNAVAILABLE;
    case 'VAULT_LOCKED': return ExitCode.NO_PERMISSION;
    case 'SESSION_MISSING': return ExitCode.NO_PERMISSION;
    default: return ExitCode.GENERAL_ERROR;
  }
}
