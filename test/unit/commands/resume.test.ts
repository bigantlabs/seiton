import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPendingOps, resumeApply } from '../../../src/commands/resume.js';
import { PENDING_SCHEMA_VERSION } from '../../../src/lib/domain/pending.js';
import type { PendingOp } from '../../../src/lib/domain/pending.js';
import type { BwItem } from '../../../src/lib/domain/types.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';
import { makeItem } from '../../helpers/make-item.js';
import type { FsAdapter } from '../../../src/adapters/fs.js';
import type { Clock } from '../../../src/adapters/clock.js';

let tempDir: string;

describe('loadPendingOps', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seiton-resume-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns NO_PENDING when file does not exist', async () => {
    const result = await loadPendingOps(join(tempDir, 'nonexistent.json'));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'NO_PENDING');
      assert.ok(result.message.includes('No pending queue found'));
    }
  });

  it('returns INVALID_PENDING when file contains invalid JSON', async () => {
    const pendingPath = join(tempDir, 'pending.json');
    await writeFile(pendingPath, 'not valid json{{{');
    const result = await loadPendingOps(pendingPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'INVALID_PENDING');
      assert.ok(result.message.includes('invalid JSON'));
    }
  });

  it('returns INVALID_PENDING when schema validation fails', async () => {
    const pendingPath = join(tempDir, 'pending.json');
    await writeFile(pendingPath, JSON.stringify({ version: 1, items: [{ kind: 'bogus' }], savedAt: '2024-01-01T00:00:00.000Z' }));
    const result = await loadPendingOps(pendingPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'INVALID_PENDING');
      assert.ok(result.message.includes('Invalid pending queue'));
    }
  });

  it('returns NO_PENDING when queue has zero items', async () => {
    const pendingPath = join(tempDir, 'pending.json');
    const queue = {
      version: PENDING_SCHEMA_VERSION,
      items: [],
      savedAt: '2024-01-01T00:00:00.000Z',
    };
    await writeFile(pendingPath, JSON.stringify(queue));
    const result = await loadPendingOps(pendingPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'NO_PENDING');
      assert.ok(result.message.includes('empty'));
    }
  });

  it('loads a valid pending queue with delete_item ops', async () => {
    const pendingPath = join(tempDir, 'pending.json');
    const queue = {
      version: PENDING_SCHEMA_VERSION,
      items: [
        { kind: 'delete_item', itemId: 'item-1' },
        { kind: 'delete_item', itemId: 'item-2' },
      ],
      savedAt: '2024-06-15T12:00:00.000Z',
    };
    await writeFile(pendingPath, JSON.stringify(queue));
    const result = await loadPendingOps(pendingPath);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.ops.length, 2);
      assert.equal(result.ops[0]!.kind, 'delete_item');
      assert.equal(result.path, pendingPath);
    }
  });

  it('loads a valid pending queue with mixed op types', async () => {
    const pendingPath = join(tempDir, 'pending.json');
    const queue = {
      version: PENDING_SCHEMA_VERSION,
      items: [
        { kind: 'create_folder', folderName: 'Banking' },
        { kind: 'assign_folder', itemId: 'item-1', folderId: null, folderName: 'Banking' },
        { kind: 'delete_item', itemId: 'item-2' },
      ],
      savedAt: '2024-06-15T12:00:00.000Z',
    };
    await writeFile(pendingPath, JSON.stringify(queue));
    const result = await loadPendingOps(pendingPath);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.ops.length, 3);
      assert.equal(result.ops[0]!.kind, 'create_folder');
      assert.equal(result.ops[1]!.kind, 'assign_folder');
      assert.equal(result.ops[2]!.kind, 'delete_item');
    }
  });

  it('uses XDG_STATE_HOME default when path is null', async () => {
    const stateDir = join(tempDir, '.local', 'state', 'seiton');
    await mkdir(stateDir, { recursive: true });
    const pendingPath = join(stateDir, 'pending.json');
    const queue = {
      version: PENDING_SCHEMA_VERSION,
      items: [{ kind: 'delete_item', itemId: 'item-1' }],
      savedAt: '2024-06-15T12:00:00.000Z',
    };
    await writeFile(pendingPath, JSON.stringify(queue));

    const savedHome = process.env['HOME'];
    const savedXdg = process.env['XDG_STATE_HOME'];
    process.env['HOME'] = tempDir;
    process.env['XDG_STATE_HOME'] = join(tempDir, '.local', 'state');
    try {
      const result = await loadPendingOps(null);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.ops.length, 1);
        assert.ok(result.path.includes('seiton'));
      }
    } finally {
      if (savedHome !== undefined) process.env['HOME'] = savedHome;
      else delete process.env['HOME'];
      if (savedXdg !== undefined) process.env['XDG_STATE_HOME'] = savedXdg;
      else delete process.env['XDG_STATE_HOME'];
    }
  });
});

function makeFakeFsAdapter(): FsAdapter {
  const files = new Map<string, string>();
  return {
    async readText(path: string) { return files.get(path) ?? ''; },
    async writeAtomic(path: string, content: string) { files.set(path, content); },
    async remove(path: string) { files.delete(path); },
    async exists(path: string) { return files.has(path); },
    async ensureDir() {},
  };
}

function makeFakeClock(): Clock {
  return {
    now: () => new Date('2024-06-15T12:00:00.000Z'),
    isoNow: () => '2024-06-15T12:00:00.000Z',
  };
}

describe('resumeApply', () => {
  let resumeTempDir: string;

  beforeEach(async () => {
    resumeTempDir = await mkdtemp(join(tmpdir(), 'seiton-resume-apply-'));
  });

  afterEach(async () => {
    await rm(resumeTempDir, { recursive: true, force: true });
  });

  it('uses itemCache to skip getItem calls for cached items', async () => {
    let getItemCalls = 0;
    const cachedItem = makeItem({ id: 'item-1', folderId: null });
    const itemCache = new Map<string, BwItem>([['item-1', cachedItem]]);

    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'folder-1', folderName: 'Test' },
    ];

    const bw = makeFakeAdapter({
      getItem: async (_session, itemId) => {
        getItemCalls++;
        return { ok: true, data: makeItem({ id: itemId }) };
      },
    });

    const pendingPath = join(resumeTempDir, 'pending.json');
    await writeFile(pendingPath, JSON.stringify({
      version: PENDING_SCHEMA_VERSION,
      items: ops,
      savedAt: '2024-06-15T12:00:00.000Z',
    }));

    const result = await resumeApply(ops, pendingPath, {
      session: 'test-session',
      bw,
      fs: makeFakeFsAdapter(),
      clock: makeFakeClock(),
    }, itemCache);

    assert.equal(getItemCalls, 0);
    assert.equal(result.applied, 1);
    assert.equal(result.failed.length, 0);
    assert.equal(result.timings.cacheHits, 1);
    assert.equal(result.timings.cacheMisses, 0);
  });

  it('falls back to getItem when itemCache is undefined', async () => {
    let getItemCalls = 0;
    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'folder-1', folderName: 'Test' },
    ];

    const bw = makeFakeAdapter({
      getItem: async (_session, itemId) => {
        getItemCalls++;
        return { ok: true, data: makeItem({ id: itemId }) };
      },
    });

    const pendingPath = join(resumeTempDir, 'pending.json');
    await writeFile(pendingPath, JSON.stringify({
      version: PENDING_SCHEMA_VERSION,
      items: ops,
      savedAt: '2024-06-15T12:00:00.000Z',
    }));

    const result = await resumeApply(ops, pendingPath, {
      session: 'test-session',
      bw,
      fs: makeFakeFsAdapter(),
      clock: makeFakeClock(),
    });

    assert.equal(getItemCalls, 1);
    assert.equal(result.applied, 1);
    assert.equal(result.timings.cacheHits, 0);
    assert.equal(result.timings.cacheMisses, 1);
  });

  it('falls back to getItem on cache miss for uncached items', async () => {
    let getItemCalls = 0;
    const cachedItem = makeItem({ id: 'item-1', folderId: null });
    const itemCache = new Map<string, BwItem>([['item-1', cachedItem]]);

    const ops: PendingOp[] = [
      { kind: 'assign_folder', itemId: 'item-1', folderId: 'folder-1', folderName: 'A' },
      { kind: 'assign_folder', itemId: 'item-2', folderId: 'folder-2', folderName: 'B' },
    ];

    const bw = makeFakeAdapter({
      getItem: async (_session, itemId) => {
        getItemCalls++;
        return { ok: true, data: makeItem({ id: itemId }) };
      },
    });

    const pendingPath = join(resumeTempDir, 'pending.json');
    await writeFile(pendingPath, JSON.stringify({
      version: PENDING_SCHEMA_VERSION,
      items: ops,
      savedAt: '2024-06-15T12:00:00.000Z',
    }));

    const result = await resumeApply(ops, pendingPath, {
      session: 'test-session',
      bw,
      fs: makeFakeFsAdapter(),
      clock: makeFakeClock(),
    }, itemCache);

    assert.equal(getItemCalls, 1);
    assert.equal(result.applied, 2);
    assert.equal(result.timings.cacheHits, 1);
    assert.equal(result.timings.cacheMisses, 1);
  });
});
