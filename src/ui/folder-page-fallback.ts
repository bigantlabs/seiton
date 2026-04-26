import type { FolderFinding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import type { PromptAdapter } from './prompts.js';
import type { RuleSaveRequest, InteractiveReviewOptions } from './review-loop.js';
import { buildFolderOps } from './folder-page-ops.js';
import { formatMatchReason, offerRuleCapture } from './rule-capture.js';
import { itemLabel } from './item-label.js';

export interface FallbackResult {
  ops: PendingOp[];
  reviewed: number;
  remaining: number;
  cancelled: boolean;
}

export async function presentFoldersFallback(
  folders: FolderFinding[],
  opts: InteractiveReviewOptions,
): Promise<FallbackResult> {
  const { prompt, onRuleSave } = opts;
  const ops: PendingOp[] = [];
  const ctx: FallbackContext = {
    prompt,
    foldersNeeded: new Set<string>(),
    enabledCategories: opts.enabledCategories,
    existingFoldersByName: opts.existingFoldersByName,
    onRuleSave,
    ruleCaptureSuppressed: false,
  };
  let reviewed = 0;

  for (let i = 0; i < folders.length; i++) {
    const finding = folders[i]!;
    const action = await presentFolderItem(finding, ctx);

    if (action === 'cancel') {
      return { ops, reviewed, remaining: folders.length - i, cancelled: true };
    }
    reviewed++;
    if (action === 'skip') continue;
    if (Array.isArray(action)) {
      for (const op of action) ops.push(op);
      opts.onProgress?.(ops);
    }
  }

  return { ops, reviewed, remaining: 0, cancelled: false };
}

interface FallbackContext {
  prompt: PromptAdapter;
  foldersNeeded: Set<string>;
  enabledCategories: readonly string[];
  existingFoldersByName: ReadonlyMap<string, string>;
  onRuleSave?: (request: RuleSaveRequest) => Promise<void>;
  ruleCaptureSuppressed: boolean;
}

type FolderAction = PendingOp[] | 'skip' | 'cancel';

async function presentFolderItem(
  finding: FolderFinding,
  ctx: FallbackContext,
): Promise<FolderAction> {
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
  finding: FolderFinding,
  ctx: FallbackContext,
): Promise<FolderAction> {
  if (ctx.enabledCategories.length === 0) {
    ctx.prompt.logInfo('No folder categories are enabled — skipping folder choice.');
    return 'skip';
  }

  const categories = ctx.enabledCategories.includes(finding.suggestedFolder)
    ? ctx.enabledCategories
    : [finding.suggestedFolder, ...ctx.enabledCategories];

  const options = categories.map(name => ({
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
