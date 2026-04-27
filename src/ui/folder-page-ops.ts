import type { PendingOp } from '../lib/domain/pending.js';
import { makeDeleteItemOp, makeAssignFolderOp, makeCreateFolderOp } from '../lib/domain/pending.js';
import type { FolderPageState } from './folder-page-model.js';
import { itemLabel } from './item-label.js';

export function buildFolderOps(
  itemId: string,
  folderName: string,
  existingFolderId: string | null,
  foldersNeeded: Set<string>,
): PendingOp[] {
  const ops: PendingOp[] = [];
  if (!existingFolderId && !foldersNeeded.has(folderName.toLowerCase())) {
    foldersNeeded.add(folderName.toLowerCase());
    ops.push(makeCreateFolderOp(folderName));
  }
  ops.push(makeAssignFolderOp(itemId, existingFolderId, folderName));
  return ops;
}

export function pageStateToOps(
  state: FolderPageState,
  existingFoldersByName: ReadonlyMap<string, string>,
): PendingOp[] {
  const ops: PendingOp[] = [];
  const foldersNeeded = new Set<string>();

  for (const entry of state.entries) {
    switch (entry.decision) {
      case 'accept': {
        const { item, suggestedFolder, existingFolderId } = entry.finding;
        const effectiveFolder = entry.overrideFolder ?? suggestedFolder;
        const folderId = entry.overrideFolder
          ? existingFoldersByName.get(effectiveFolder.toLowerCase()) ?? null
          : existingFolderId ?? existingFoldersByName.get(effectiveFolder.toLowerCase()) ?? null;
        if (!folderId && !foldersNeeded.has(effectiveFolder.toLowerCase())) {
          foldersNeeded.add(effectiveFolder.toLowerCase());
          ops.push(makeCreateFolderOp(effectiveFolder));
        }
        ops.push(makeAssignFolderOp(item.id, folderId, effectiveFolder));
        break;
      }
      case 'delete': {
        const { item } = entry.finding;
        ops.push(makeDeleteItemOp(item.id, itemLabel(item)));
        break;
      }
      case 'skip':
      case 'pending':
        break;
    }
  }

  return ops;
}
