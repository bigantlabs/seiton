import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePendingQueue } from '../../src/lib/domain/pending.js';

const CHILD_SCRIPT = join(import.meta.dirname, '..', 'helpers', 'audit-sigint-child.ts');

function spawnChild(pendingPath: string): ReturnType<typeof spawn> {
  return spawn(process.execPath, ['--import', 'tsx', CHILD_SCRIPT, pendingPath], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
}

function waitForReady(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.stdout!.off('data', onData);
      reject(new Error('Child did not become ready within 5s'));
    }, 5_000);
    const onData = (data: Buffer) => {
      if (data.toString().includes('READY')) {
        clearTimeout(timeout);
        child.stdout!.off('data', onData);
        resolve();
      }
    };
    child.stdout!.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timeout);
      child.stdout!.off('data', onData);
      reject(err);
    });
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: string | null }> {
  return new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
}

describe('Audit SIGINT pending-ops persistence', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-audit-sigint-'));
  });

  it('saves pending ops to pending.json when SIGINT is received', async () => {
    const pendingPath = join(tmp, '.local', 'state', 'seiton', 'pending.json');
    const child = spawnChild(pendingPath);

    await waitForReady(child);
    child.kill('SIGINT');

    const { code } = await waitForExit(child);
    assert.equal(code, 130);

    const content = await readFile(pendingPath, 'utf-8');
    const parsed = JSON.parse(content);
    const result = parsePendingQueue(parsed);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.version, 1);
      assert.equal(result.data.items.length, 3);
      assert.equal(result.data.items[0]!.kind, 'create_folder');
      assert.equal(result.data.items[1]!.kind, 'assign_folder');
      assert.equal(result.data.items[2]!.kind, 'delete_item');
      assert.equal(result.data.savedAt, '2024-06-01T00:00:00.000Z');
    }
  });

  it('writes pending.json with mode 0600', async () => {
    const pendingPath = join(tmp, '.local', 'state', 'seiton', 'pending.json');
    const child = spawnChild(pendingPath);

    await waitForReady(child);
    child.kill('SIGINT');

    await waitForExit(child);

    const fileStat = await stat(pendingPath);
    const mode = fileStat.mode & 0o777;
    assert.equal(mode, 0o600);
  });
});
