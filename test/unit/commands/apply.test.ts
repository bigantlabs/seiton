import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, type ApplyProgress } from '../../../src/commands/apply.js';
import type { PendingOp } from '../../../src/lib/domain/pending.js';
import { makeBwError, BwErrorCode } from '../../../src/lib/domain/types.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';

describe('applyOps', () => {
  it('returns zero applied for empty ops', async () => {
    const bw = makeFakeAdapter();
    const result = await applyOps([], 'session', bw);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(result.remaining.length, 0);
  });

  it('applies delete operations', async () => {
    const ops: PendingOp[] = [{ kind: 'delete_item', itemId: 'item-1' }];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 1);
    assert.equal(result.failed.length, 0);
  });

  it('applies create_folder operations', async () => {
    const ops: PendingOp[] = [{ kind: 'create_folder', folderName: 'Test' }];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 1);
  });

  it('applies assign_folder operations', async () => {
    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'folder-1', folderName: 'Test' },
    ];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 1);
  });

  it('tracks failed operations', async () => {
    const ops: PendingOp[] = [{ kind: 'delete_item', itemId: 'item-1' }];
    const bw = makeFakeAdapter({
      deleteItem: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
    });
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 1);
  });

  it('uses folder ID from create_folder for subsequent assigns', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'NewFolder' },
      { kind: 'assign_folder', itemId: 'item-1', folderId: null, folderName: 'NewFolder' },
    ];
    let editedPayload = '';
    const bw = makeFakeAdapter({
      editItem: async (_session, _itemId, encoded) => {
        editedPayload = Buffer.from(encoded, 'base64').toString();
        return { ok: true, data: undefined };
      },
    });
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 2);
    const parsed = JSON.parse(editedPayload);
    assert.equal(parsed.folderId, 'new-id');
    assert.equal(parsed.id, 'item-1');
    assert.equal(parsed.name, 'Test Item');
  });

  it('fails assign_folder when getItem fails', async () => {
    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'missing-item', folderId: 'folder-1', folderName: 'Test' },
    ];
    const bw = makeFakeAdapter({
      getItem: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'not found') }),
    });
    const result = await applyOps(ops, 'session', bw);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 1);
  });

  it('invokes onApplied callback for successful operations', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'Folder1' },
      { kind: 'delete_item', itemId: 'item-1' },
      { kind: 'assign_folder', itemId: 'item-2', folderId: 'folder-1', folderName: 'Folder2' },
    ];
    const appliedOps: PendingOp[] = [];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw, undefined, (op) => {
      appliedOps.push(op);
    });
    assert.equal(appliedOps.length, 3);
    assert.equal(result.applied, 3);
    // Operations are processed by type: create_folder, then assign_folder, then delete_item
    assert.deepEqual(appliedOps[0], ops[0]); // create_folder
    assert.deepEqual(appliedOps[1], ops[2]); // assign_folder
    assert.deepEqual(appliedOps[2], ops[1]); // delete_item
  });

  it('does not invoke onApplied for failed operations', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'Folder1' },
      { kind: 'delete_item', itemId: 'item-1' },
    ];
    const appliedOps: PendingOp[] = [];
    const bw = makeFakeAdapter({
      createFolder: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
      deleteItem: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
    });
    const result = await applyOps(ops, 'session', bw, undefined, (op) => {
      appliedOps.push(op);
    });
    assert.equal(appliedOps.length, 0);
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 2);
  });

  it('returns timings in result', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'Dev' },
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'f1', folderName: 'Dev' },
      { kind: 'delete_item', itemId: 'item-2' },
    ];
    const bw = makeFakeAdapter();
    const result = await applyOps(ops, 'session', bw);
    assert.ok(result.timings);
    assert.equal(result.timings.create_folder.count, 1);
    assert.equal(result.timings.create_folder.succeeded, 1);
    assert.equal(result.timings.assign_folder.count, 1);
    assert.equal(result.timings.assign_folder.succeeded, 1);
    assert.equal(result.timings.delete_item.count, 1);
    assert.equal(result.timings.delete_item.succeeded, 1);
    assert.ok(result.timings.totalDurationMs >= 0);
    assert.ok(result.timings.create_folder.durationMs >= 0);
    assert.ok(result.timings.assign_folder.durationMs >= 0);
    assert.ok(result.timings.delete_item.durationMs >= 0);
  });

  it('returns zero-count timings for empty ops', async () => {
    const bw = makeFakeAdapter();
    const result = await applyOps([], 'session', bw);
    assert.equal(result.timings.create_folder.count, 0);
    assert.equal(result.timings.create_folder.succeeded, 0);
    assert.equal(result.timings.assign_folder.count, 0);
    assert.equal(result.timings.assign_folder.succeeded, 0);
    assert.equal(result.timings.delete_item.count, 0);
    assert.equal(result.timings.delete_item.succeeded, 0);
    assert.ok(result.timings.totalDurationMs >= 0);
  });

  it('invokes onProgress before each operation', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'Dev' },
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'f1', folderName: 'Social' },
      { kind: 'delete_item', itemId: 'item-2' },
    ];
    const events: ApplyProgress[] = [];
    const bw = makeFakeAdapter();
    await applyOps(ops, 'session', bw, undefined, undefined, (p) => {
      events.push({ ...p });
    });
    assert.equal(events.length, 3);

    assert.equal(events[0].phase, 'create_folder');
    assert.equal(events[0].current, 1);
    assert.equal(events[0].phaseTotal, 1);
    assert.equal(events[0].overallCurrent, 1);
    assert.equal(events[0].overallTotal, 3);
    assert.equal(events[0].description, 'Dev');

    assert.equal(events[1].phase, 'assign_folder');
    assert.equal(events[1].current, 1);
    assert.equal(events[1].overallCurrent, 2);
    assert.equal(events[1].description, 'Social');

    assert.equal(events[2].phase, 'delete_item');
    assert.equal(events[2].current, 1);
    assert.equal(events[2].overallCurrent, 3);
    assert.equal(events[2].description, 'item-2');
  });

  it('reports accumulated failure count in onProgress', async () => {
    const ops: PendingOp[] = [
      { kind: 'create_folder', folderName: 'A' },
      { kind: 'create_folder', folderName: 'B' },
      { kind: 'delete_item', itemId: 'item-1' },
    ];
    const events: ApplyProgress[] = [];
    const bw = makeFakeAdapter({
      createFolder: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'fail') }),
    });
    await applyOps(ops, 'session', bw, undefined, undefined, (p) => {
      events.push({ ...p });
    });
    assert.equal(events[0].failedSoFar, 0);
    assert.equal(events[1].failedSoFar, 1);
    assert.equal(events[2].failedSoFar, 2);
  });
});
