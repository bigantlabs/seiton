import type { Finding, FindingCategory } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp, makeAssignFolderOp, makeCreateFolderOp } from '../lib/domain/pending.js';
import type { Logger } from '../adapters/logging.js';

export interface ReviewOptions {
  skipCategories: readonly string[];
  limitPerCategory: number | null;
  logger?: Logger;
}

export interface ReviewResult {
  ops: PendingOp[];
  reviewed: number;
  skipped: number;
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

  return { ops, reviewed, skipped };
}
