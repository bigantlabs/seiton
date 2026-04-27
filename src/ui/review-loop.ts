import type { Finding, FindingCategory, DuplicateFinding, FolderFinding } from '../lib/domain/finding.js';
import { isInformationalCategory } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp, makeAssignFolderOp, makeCreateFolderOp } from '../lib/domain/pending.js';
import type { Logger } from '../adapters/logging.js';
import type { PromptAdapter, PromptStyle } from './prompts.js';
import { renderBatchReport } from './batch-report.js';
import { presentAllDuplicates } from './duplicate-review.js';
import { runFolderPage } from './folder-page-loop.js';
import { setOverride, type FolderPageState } from './folder-page-model.js';
import { presentFoldersFallback } from './folder-page-fallback.js';
import { extractRuleKeyword, offerRuleCapture } from './rule-capture.js';
import { itemLabel } from './item-label.js';

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
        // Non-interactive: deterministic keep-first. Interactive path (presentAllDuplicates) lets the user pick.
        const [, ...dupes] = finding.items;
        for (const dupe of dupes) {
          ops.push(makeDeleteItemOp(dupe.id, itemLabel(dupe)));
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
        if (!finding.existingFolderId && !foldersNeeded.has(finding.suggestedFolder.toLowerCase())) {
          foldersNeeded.add(finding.suggestedFolder.toLowerCase());
          ops.push(makeCreateFolderOp(finding.suggestedFolder));
        }
        ops.push(makeAssignFolderOp(finding.item.id, finding.existingFolderId, finding.suggestedFolder));
        break;
      }
      case 'near_duplicates':
        break;
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
  promptStyle?: PromptStyle;
  maskChar: string;
  enabledCategories: readonly string[];
  existingFoldersByName: ReadonlyMap<string, string>;
  folderNamesById?: ReadonlyMap<string, string>;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  isTTY?: () => boolean;
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
    if (dupResult.cancelled) {
      return { ops, reviewed, skipped: skipped + duplicates.length, cancelled: true };
    }
    if (dupResult.skipped) {
      skipped += duplicates.length;
    } else {
      for (const op of dupResult.ops) ops.push(op);
      reviewed += duplicates.length;
      if (dupResult.ops.length > 0) onProgress?.(ops);
    }
  }

  if (folders.length > 0) {
    const ttyCheck = opts.isTTY ?? (() => false);
    const usePageDisplay = opts.promptStyle !== 'plain' && ttyCheck();

    if (usePageDisplay) {
      const pageOps = await runFolderPageWithEdits(folders, opts);
      if (pageOps === null) {
        return { ops, reviewed, skipped: skipped + folders.length, cancelled: true };
      }
      for (const op of pageOps) ops.push(op);
      reviewed += folders.length;
      if (pageOps.length > 0) onProgress?.(ops);
    } else {
      const folderOps = await presentFoldersFallback(folders, opts);
      if (folderOps.cancelled) {
        return { ops, reviewed, skipped: skipped + folderOps.remaining, cancelled: true };
      }
      for (const op of folderOps.ops) ops.push(op);
      reviewed += folderOps.reviewed;
      if (folderOps.ops.length > 0) onProgress?.(ops);
    }
  }

  return { ops, reviewed, skipped, cancelled: false };
}

async function runFolderPageWithEdits(
  folders: FolderFinding[],
  opts: InteractiveReviewOptions,
): Promise<PendingOp[] | null> {
  const { prompt, onRuleSave } = opts;
  const mutableCategories = [...opts.enabledCategories];
  let ruleCaptureSuppressed = false;
  let state: FolderPageState | undefined;

  while (true) {
    const result = await runFolderPage(
      folders, opts.existingFoldersByName, prompt,
      opts.stdin!, opts.stdout!, undefined, state,
    );

    if (result.action === 'cancel') return null;

    if (result.action === 'submit') return result.ops;

    const entry = result.state.entries[result.entryIndex]!;
    const editResult = await editFolderEntry(
      entry, mutableCategories, prompt,
      onRuleSave, ruleCaptureSuppressed,
    );
    if (editResult === null) {
      state = result.state;
    } else {
      if (editResult.suppressed) ruleCaptureSuppressed = true;
      state = setOverride(result.state, result.entryIndex, editResult.folder);
    }
  }
}

interface EditResult {
  folder: string;
  suppressed: boolean;
}

async function editFolderEntry(
  entry: { readonly finding: FolderFinding },
  mutableCategories: string[],
  prompt: PromptAdapter,
  onRuleSave?: (request: RuleSaveRequest) => Promise<void>,
  ruleCaptureSuppressed = false,
): Promise<EditResult | null> {
  const CREATE_NEW = '__create_new__';
  const suggested = entry.finding.suggestedFolder;
  const categories = mutableCategories.includes(suggested)
    ? mutableCategories
    : [suggested, ...mutableCategories];

  const options = [
    ...categories.map(name => ({
      value: name,
      label: name,
      hint: name === suggested ? 'suggested' : undefined,
    })),
    { value: CREATE_NEW, label: 'Create new folder…' },
  ];

  const chosen = await prompt.select<string>(
    `Select folder for "${entry.finding.item.name}":`,
    options,
  );
  if (chosen === null) return null;

  if (chosen === CREATE_NEW) {
    const name = await prompt.text('Enter folder name:');
    if (!name) return null;
    const keyword = extractRuleKeyword(entry.finding.item);
    if (onRuleSave && keyword) {
      await onRuleSave({ folder: name, keyword });
    }
    if (!mutableCategories.includes(name)) {
      mutableCategories.push(name);
    }
    return { folder: name, suppressed: false };
  }

  let suppressed = false;
  if (onRuleSave && !ruleCaptureSuppressed && chosen !== suggested) {
    const captureResult = await offerRuleCapture(
      entry.finding.item, chosen, prompt, onRuleSave,
    );
    if (captureResult === 'suppressed') suppressed = true;
  }

  return { folder: chosen, suppressed };
}
