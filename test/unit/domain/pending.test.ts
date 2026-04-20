import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_SCHEMA_VERSION,
  PENDING_OP_KINDS,
  PendingQueueSchema,
  makeDeleteItemOp,
  makeAssignFolderOp,
  makeCreateFolderOp,
  makePendingQueue,
  parsePendingQueue,
} from '../../../src/lib/domain/pending.js';

describe('PENDING_SCHEMA_VERSION', () => {
  it('is 1', () => {
    assert.equal(PENDING_SCHEMA_VERSION, 1);
  });
});

describe('PENDING_OP_KINDS', () => {
  it('contains the three op kinds', () => {
    assert.deepEqual([...PENDING_OP_KINDS], ['delete_item', 'assign_folder', 'create_folder']);
  });
});

describe('PendingOp construction', () => {
  it('creates delete_item op', () => {
    const op = makeDeleteItemOp('item-123');
    assert.equal(op.kind, 'delete_item');
    assert.equal(op.itemId, 'item-123');
  });

  it('creates assign_folder op', () => {
    const op = makeAssignFolderOp('item-456', 'fold-789', 'Email');
    assert.equal(op.kind, 'assign_folder');
    assert.equal(op.itemId, 'item-456');
    assert.equal(op.folderId, 'fold-789');
    assert.equal(op.folderName, 'Email');
  });

  it('creates assign_folder op with null folderId', () => {
    const op = makeAssignFolderOp('item-456', null, 'New Folder');
    assert.equal(op.folderId, null);
    assert.equal(op.folderName, 'New Folder');
  });

  it('creates create_folder op', () => {
    const op = makeCreateFolderOp('Development');
    assert.equal(op.kind, 'create_folder');
    assert.equal(op.folderName, 'Development');
  });
});

describe('PendingQueue', () => {
  it('constructs with makePendingQueue', () => {
    const ops = [
      makeDeleteItemOp('item-1'),
      makeCreateFolderOp('Folder'),
    ];
    const queue = makePendingQueue(ops, '2024-06-01T00:00:00.000Z');

    assert.equal(queue.version, PENDING_SCHEMA_VERSION);
    assert.equal(queue.items.length, 2);
    assert.equal(queue.savedAt, '2024-06-01T00:00:00.000Z');
  });

  it('version field is always 1', () => {
    const queue = makePendingQueue([], '2024-01-01T00:00:00.000Z');
    assert.equal(queue.version, 1);
  });

  it('items array is a shallow copy', () => {
    const ops = [makeDeleteItemOp('item-1')];
    const queue = makePendingQueue(ops, '2024-01-01T00:00:00.000Z');
    assert.notEqual(queue.items, ops);
    assert.deepEqual(queue.items, ops);
  });
});

describe('PendingQueueSchema', () => {
  it('parses a valid queue', () => {
    const raw = {
      version: 1,
      items: [
        { kind: 'delete_item', itemId: 'item-1' },
        { kind: 'assign_folder', itemId: 'item-2', folderId: 'fold-1', folderName: 'Email' },
        { kind: 'create_folder', folderName: 'Shopping' },
      ],
      savedAt: '2024-06-01T12:00:00.000Z',
    };

    const result = PendingQueueSchema.safeParse(raw);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.items.length, 3);
    }
  });

  it('rejects version other than 1', () => {
    const raw = {
      version: 2,
      items: [],
      savedAt: '2024-01-01T00:00:00.000Z',
    };
    const result = PendingQueueSchema.safeParse(raw);
    assert.equal(result.success, false);
  });

  it('rejects missing version', () => {
    const raw = {
      items: [],
      savedAt: '2024-01-01T00:00:00.000Z',
    };
    const result = PendingQueueSchema.safeParse(raw);
    assert.equal(result.success, false);
  });

  it('rejects invalid op kind', () => {
    const raw = {
      version: 1,
      items: [{ kind: 'invalid_op', itemId: 'item-1' }],
      savedAt: '2024-01-01T00:00:00.000Z',
    };
    const result = PendingQueueSchema.safeParse(raw);
    assert.equal(result.success, false);
  });

  it('rejects assign_folder missing folderName', () => {
    const raw = {
      version: 1,
      items: [{ kind: 'assign_folder', itemId: 'item-1', folderId: 'fold-1' }],
      savedAt: '2024-01-01T00:00:00.000Z',
    };
    const result = PendingQueueSchema.safeParse(raw);
    assert.equal(result.success, false);
  });
});

describe('parsePendingQueue', () => {
  it('returns success for valid input', () => {
    const result = parsePendingQueue({
      version: 1,
      items: [],
      savedAt: '2024-01-01T00:00:00.000Z',
    });
    assert.equal(result.success, true);
  });

  it('returns failure for invalid input', () => {
    const result = parsePendingQueue({ version: 99, items: [] });
    assert.equal(result.success, false);
  });
});
