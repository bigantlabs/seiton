import type { Finding, FindingCategory } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp, makeAssignFolderOp, makeCreateFolderOp } from '../lib/domain/pending.js';
import type { Logger } from '../adapters/logging.js';
import type { PromptAdapter } from './prompts.js';
import type { BwItem } from '../lib/domain/types.js';
import { maskPassword } from './mask.js';

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
        if (!foldersNeeded.has(finding.suggestedFolder)) {
          foldersNeeded.add(finding.suggestedFolder);
          ops.push(makeCreateFolderOp(finding.suggestedFolder));
        }
        ops.push(makeAssignFolderOp(finding.item.id, null, finding.suggestedFolder));
        break;
      }
    }
  }

  return { ops, reviewed, skipped, cancelled: false };
}

export interface InteractiveReviewOptions extends ReviewOptions {
  prompt: PromptAdapter;
  maskChar: string;
}

export async function interactiveReview(
  findings: readonly Finding[],
  opts: InteractiveReviewOptions,
): Promise<ReviewResult> {
  const { prompt, skipCategories, limitPerCategory, maskChar } = opts;
  const ops: PendingOp[] = [];
  let reviewed = 0;
  let skipped = 0;

  const categoryCounts = new Map<FindingCategory, number>();
  const foldersNeeded = new Set<string>();

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
    const action = await presentFinding(finding, prompt, maskChar, foldersNeeded);
    if (action === 'cancel') {
      return { ops, reviewed, skipped: skipped + (findings.length - reviewed - skipped), cancelled: true };
    }
    reviewed++;

    if (action === 'skip') continue;
    for (const op of action) ops.push(op);
  }

  return { ops, reviewed, skipped, cancelled: false };
}

type FindingAction = PendingOp[] | 'skip' | 'cancel';

async function presentFinding(
  finding: Finding,
  prompt: PromptAdapter,
  maskChar: string,
  foldersNeeded: Set<string>,
): Promise<FindingAction> {
  switch (finding.category) {
    case 'duplicates':
      return presentDuplicate(finding, prompt);
    case 'weak':
      return presentWeak(finding, prompt, maskChar);
    case 'missing':
      return presentMissing(finding, prompt);
    case 'folders':
      return presentFolder(finding, prompt, foldersNeeded);
    case 'reuse':
      return presentReuse(finding, prompt, maskChar);
  }
}

function itemLabel(item: BwItem): string {
  const uri = item.login?.uris?.[0]?.uri;
  const user = item.login?.username;
  let label = item.name;
  if (uri) label += ` (${uri})`;
  if (user) label += ` [${user}]`;
  return label;
}

async function presentDuplicate(
  finding: Extract<Finding, { category: 'duplicates' }>,
  prompt: PromptAdapter,
): Promise<FindingAction> {
  const items = finding.items;
  prompt.logStep(`Duplicate group: ${finding.key}`);

  const options = items.map((item, i) => ({
    value: i,
    label: itemLabel(item),
    hint: i === 0 ? 'oldest' : undefined,
  }));

  const keepIdx = await prompt.select<number>(
    'Which item should be kept? (others will be deleted)',
    options,
  );

  if (keepIdx === null) return 'cancel';

  const ops: PendingOp[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i !== keepIdx) ops.push(makeDeleteItemOp(items[i]!.id));
  }
  return ops;
}

async function presentWeak(
  finding: Extract<Finding, { category: 'weak' }>,
  prompt: PromptAdapter,
  maskChar: string,
): Promise<FindingAction> {
  const masked = finding.item.login?.password
    ? maskPassword(finding.item.login.password, maskChar)
    : '(empty)';
  prompt.logWarning(
    `Weak password: ${itemLabel(finding.item)}\n  Score: ${finding.score}/4 | Password: ${masked}\n  Reasons: ${finding.reasons.join(', ')}`,
  );

  const action = await prompt.confirm('Acknowledge this finding?', true);
  if (action === null) return 'cancel';
  return 'skip';
}

async function presentMissing(
  finding: Extract<Finding, { category: 'missing' }>,
  prompt: PromptAdapter,
): Promise<FindingAction> {
  prompt.logWarning(
    `Missing fields: ${itemLabel(finding.item)}\n  Fields: ${finding.missingFields.join(', ')}`,
  );

  const action = await prompt.confirm('Acknowledge this finding?', true);
  if (action === null) return 'cancel';
  return 'skip';
}

async function presentFolder(
  finding: Extract<Finding, { category: 'folders' }>,
  prompt: PromptAdapter,
  foldersNeeded: Set<string>,
): Promise<FindingAction> {
  const action = await prompt.select<'accept' | 'skip'>(
    `Assign "${itemLabel(finding.item)}" to folder "${finding.suggestedFolder}"?`,
    [
      { value: 'accept', label: 'Accept', hint: `move to ${finding.suggestedFolder}` },
      { value: 'skip', label: 'Skip' },
    ],
  );

  if (action === null) return 'cancel';
  if (action === 'skip') return 'skip';

  const ops: PendingOp[] = [];
  if (!foldersNeeded.has(finding.suggestedFolder)) {
    foldersNeeded.add(finding.suggestedFolder);
    ops.push(makeCreateFolderOp(finding.suggestedFolder));
  }
  ops.push(makeAssignFolderOp(finding.item.id, null, finding.suggestedFolder));
  return ops;
}

async function presentReuse(
  finding: Extract<Finding, { category: 'reuse' }>,
  prompt: PromptAdapter,
  maskChar: string,
): Promise<FindingAction> {
  const masked = maskPassword('password', maskChar);
  const names = finding.items.map(i => itemLabel(i)).join('\n    ');
  prompt.logWarning(
    `Reused password (${masked}) across ${finding.items.length} items:\n    ${names}`,
  );

  const action = await prompt.confirm('Acknowledge this finding?', true);
  if (action === null) return 'cancel';
  return 'skip';
}
