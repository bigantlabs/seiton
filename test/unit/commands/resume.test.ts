import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPendingOps } from '../../../src/commands/resume.js';
import { PENDING_SCHEMA_VERSION } from '../../../src/lib/domain/pending.js';

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
