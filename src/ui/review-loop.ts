import type { Finding, FindingCategory, DuplicateFinding, FolderFinding } from '../lib/domain/finding.js';
import { isInformationalCategory } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp, makeAssignFolderOp, makeCreateFolderOp } from '../lib/domain/pending.js';
import type { Logger } from '../adapters/logging.js';
import type { PromptAdapter } from './prompts.js';
import type { BwItem } from '../lib/domain/types.js';
import { renderBatchReport } from './batch-report.js';
import { formatMatchReason, offerRuleCapture } from './rule-capture.js';
import { presentAllDuplicates } from './duplicate-review.js';

export interface ReviewOptions {
  skipCategories: readonly string[];
  limitPerCategory: number | null;
  logger?: Logger;
}

export interface ReviewResult {
  ops: PendingOp[];
  reviewed: number;
  skipped: number;
  cancelled: boolean;
}

export function collectOpsFromFindings(
  findings: readonly Finding[],
  opts: ReviewOptions,
): ReviewResult {
  const ops: PendingOp[] = [];
  let reviewed = 0;
  let skipped = 0;

  const categoryCounts = new Map<FindingCategory, number>();
  const foldersNeeded = new Set<string>();

  for (const finding of findings) {
    if (opts.skipCategories.includes(finding.category)) {
      skipped++;
      continue;
    }

    const count = categoryCounts.get(finding.category) ?? 0;
    if (opts.limitPerCategory !== null && count >= opts.limitPerCategory) {
      skipped++;
      continue;
    }

    categoryCounts.set(finding.category, count + 1);
    reviewed++;

    switch (finding.category) {
      case 'duplicates': {
        const [, ...dupes] = finding.items;
        for (const dupe of dupes) {
          ops.push(makeDeleteItemOp(dupe.id));
        }
        break;
      }
      case 'reuse':
        break;
      case 'weak':
        break;
      case 'missing':
        break;
      case 'folders': {
        if (!finding.existingFolderId && !foldersNeeded.has(finding.suggestedFolder)) {
          foldersNeeded.add(finding.suggestedFolder);
          ops.push(makeCreateFolderOp(finding.suggestedFolder));
        }
        ops.push(makeAssignFolderOp(finding.item.id, finding.existingFolderId, finding.suggestedFolder));
        break;
      }
    }
  }

  return { ops, reviewed, skipped, cancelled: false };
}

export interface RuleSaveRequest {
  folder: string;
  keyword: string;
}

export interface InteractiveReviewOptions extends ReviewOptions {
  prompt: PromptAdapter;
  maskChar: string;
  enabledCategories: readonly string[];
  existingFoldersByName: ReadonlyMap<string, string>;
  folderNamesById?: ReadonlyMap<string, string>;
  onProgress?: (ops: readonly PendingOp[]) => void;
  onRuleSave?: (request: RuleSaveRequest) => Promise<void>;
}

export async function interactiveReview(
  findings: readonly Finding[],
  opts: InteractiveReviewOptions,
): Promise<ReviewResult> {
  const { prompt, skipCategories, limitPerCategory, maskChar, onProgress } = opts;
  const ops: PendingOp[] = [];
  let reviewed = 0;
  let skipped = 0;

  const categoryCounts = new Map<FindingCategory, number>();
  const informational: Finding[] = [];
  const duplicates: DuplicateFinding[] = [];
  const folders: FolderFinding[] = [];

  for (const finding of findings) {
    if (skipCategories.includes(finding.category)) {
      skipped++;
      continue;
    }
    const count = categoryCounts.get(finding.category) ?? 0;
    if (limitPerCategory !== null && count >= limitPerCategory) {
      skipped++;
      continue;
    }
    categoryCounts.set(finding.category, count + 1);

    if (isInformationalCategory(finding.category)) {
      informational.push(finding);
    } else if (finding.category === 'duplicates') {
      duplicates.push(finding);
    } else if (finding.category === 'folders') {
      folders.push(finding);
    }
  }

  if (informational.length > 0) {
    await renderBatchReport(informational, prompt, maskChar);
  }
  reviewed += informational.length;

  if (duplicates.length > 0) {
    const dupResult = await presentAllDuplicates(duplicates, prompt, opts.folderNamesById);
    if (dupResult.skipped) {
      skipped += duplicates.length;
    } else {
      for (const op of dupResult.ops) ops.push(op);
      reviewed += duplicates.length;
      onProgress?.(ops);
    }
  }

  const foldersNeeded = new Set<string>();
  const ctx: ReviewContext = {
    prompt, maskChar, foldersNeeded,
    enabledCategories: opts.enabledCategories,
    existingFoldersByName: opts.existingFoldersByName,
    onRuleSave: opts.onRuleSave,
    ruleCaptureSuppressed: false,
  };

  for (let i = 0; i < folders.length; i++) {
    const finding = folders[i]!;
    const action = await presentFolder(finding, ctx);
    if (action === 'cancel') {
      const remaining = folders.length - i;
      return { ops, reviewed, skipped: skipped + remaining, cancelled: true };
    }
    reviewed++;
    if (action === 'skip') continue;
    for (const op of action) ops.push(op);
    onProgress?.(ops);
  }

  return { ops, reviewed, skipped, cancelled: false };
}

interface ReviewContext {
  prompt: PromptAdapter;
  maskChar: string;
  foldersNeeded: Set<string>;
  enabledCategories: readonly string[];
  existingFoldersByName: ReadonlyMap<string, string>;
  onRuleSave?: (request: RuleSaveRequest) => Promise<void>;
  ruleCaptureSuppressed: boolean;
}

export function itemLabel(item: BwItem): string {
  const uri = item.login?.uris?.[0]?.uri;
  const user = item.login?.username;
  let label = item.name;
  if (uri) label += ` (${uri})`;
  if (user) label += ` [${user}]`;
  return label;
}

type FindingAction = PendingOp[] | 'skip' | 'cancel';

async function presentFolder(
  finding: Extract<Finding, { category: 'folders' }>,
  ctx: ReviewContext,
): Promise<FindingAction> {
  const reason = formatMatchReason(finding.matchReason);
  const action = await ctx.prompt.select<'accept' | 'choose' | 'skip'>(
    `Assign "${itemLabel(finding.item)}" to folder "${finding.suggestedFolder}"? (${reason})`,
    [
      { value: 'accept', label: 'Accept', hint: `move to ${finding.suggestedFolder}` },
      { value: 'choose', label: 'Choose a different folder…' },
      { value: 'skip', label: 'Skip' },
    ],
  );

  if (action === null) return 'cancel';
  if (action === 'skip') return 'skip';

  if (action === 'choose') {
    return handleFolderChoice(finding, ctx);
  }

  return buildFolderOps(
    finding.item.id, finding.suggestedFolder,
    finding.existingFolderId, ctx.foldersNeeded,
  );
}

async function handleFolderChoice(
  finding: Extract<Finding, { category: 'folders' }>,
  ctx: ReviewContext,
): Promise<FindingAction> {
  const options = ctx.enabledCategories.map(name => ({
    value: name,
    label: name,
    hint: name === finding.suggestedFolder ? 'suggested' : undefined,
  }));

  const chosen = await ctx.prompt.select<string>(
    `Select a folder for "${itemLabel(finding.item)}":`,
    options,
  );
  if (chosen === null) return 'cancel';

  if (ctx.onRuleSave && !ctx.ruleCaptureSuppressed && chosen !== finding.suggestedFolder) {
    const result = await offerRuleCapture(finding.item, chosen, ctx.prompt, ctx.onRuleSave);
    if (result === 'suppressed') ctx.ruleCaptureSuppressed = true;
  }

  const existingId = ctx.existingFoldersByName.get(chosen.toLowerCase()) ?? null;
  return buildFolderOps(finding.item.id, chosen, existingId, ctx.foldersNeeded);
}

function buildFolderOps(
  itemId: string,
  folderName: string,
  existingFolderId: string | null,
  foldersNeeded: Set<string>,
): PendingOp[] {
  const ops: PendingOp[] = [];
  if (!existingFolderId && !foldersNeeded.has(folderName)) {
    foldersNeeded.add(folderName);
    ops.push(makeCreateFolderOp(folderName));
  }
  ops.push(makeAssignFolderOp(itemId, existingFolderId, folderName));
  return ops;
}
