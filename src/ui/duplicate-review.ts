import type { DuplicateFinding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp } from '../lib/domain/pending.js';
import type { PromptAdapter } from './prompts.js';
import type { BwItem } from '../lib/domain/types.js';
import { itemLabel } from './item-label.js';

export interface DuplicateReviewResult {
  ops: PendingOp[];
  skipped: boolean;
  cancelled: boolean;
}

export function formatRevisionHint(item: BwItem): string {
  const raw = item.login?.passwordRevisionDate ?? item.revisionDate;
  if (!raw) return 'revised: unknown';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'revised: unknown';
  return `revised: ${d.toISOString().slice(0, 10)}`;
}

export function formatItemHint(
  item: BwItem,
  groupKey: string,
  folderNamesById: ReadonlyMap<string, string> = new Map(),
): string {
  const folder = item.folderId
    ? (folderNamesById.get(item.folderId) ?? 'Unknown folder')
    : 'No folder';
  return `${folder} · ${groupKey} · ${formatRevisionHint(item)}`;
}

function buildOptions(
  findings: readonly DuplicateFinding[],
  folderNamesById: ReadonlyMap<string, string>,
): { value: string; label: string; hint: string }[] {
  const options: { value: string; label: string; hint: string }[] = [];
  for (const finding of findings) {
    for (const item of finding.items) {
      options.push({
        value: item.id,
        label: itemLabel(item),
        hint: formatItemHint(item, finding.key, folderNamesById),
      });
    }
  }
  return options;
}

export async function presentAllDuplicates(
  findings: readonly DuplicateFinding[],
  prompt: PromptAdapter,
  folderNamesById?: ReadonlyMap<string, string>,
): Promise<DuplicateReviewResult> {
  if (findings.length === 0) return { ops: [], skipped: false, cancelled: false };

  const folders = folderNamesById ?? new Map<string, string>();
  const options = buildOptions(findings, folders);

  prompt.logStep(
    `${findings.length} duplicate group(s) found — check items to delete (unchecked = keep)`,
  );

  const itemsById = new Map(findings.flatMap(f => f.items.map(i => [i.id, i] as const)));
  let previousSelections: string[] | undefined;

  while (true) {
    const toDelete = await prompt.multiselect<string>(
      'Select items to delete (unchecked items will be kept):',
      options,
      false,
      previousSelections,
    );
    if (toDelete === null) return { ops: [], skipped: true, cancelled: true };
    if (toDelete.length === 0) return { ops: [], skipped: false, cancelled: false };

    previousSelections = toDelete;
    const deleteSet = new Set(toDelete);
    const groupsLosingAll = findings.filter(f =>
      f.items.every(item => deleteSet.has(item.id)),
    );

    if (groupsLosingAll.length > 0) {
      const names = groupsLosingAll.map(f => f.key).join(', ');
      const confirmed = await prompt.confirm(
        `Warning: all items in ${groupsLosingAll.length} group(s) would be deleted (${names}). Continue?`,
        false,
      );
      if (confirmed === null) return { ops: [], skipped: true, cancelled: true };
      if (!confirmed) continue;
    }

    const ops: PendingOp[] = [];
    for (const id of deleteSet) {
      const item = itemsById.get(id);
      ops.push(makeDeleteItemOp(id, item ? itemLabel(item) : undefined));
    }
    return { ops, skipped: false, cancelled: false };
  }
}
