import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../../../src/commands/preflight.js';
import type { BwAdapter, BwResult } from '../../../src/lib/bw.js';
import { makeBwError, BwErrorCode } from '../../../src/lib/domain/types.js';

function makeFakeAdapter(overrides: Partial<BwAdapter> = {}): BwAdapter {
  return {
    getVersion: async () => ({ ok: true, data: '2024.6.0' }) as BwResult<string>,
    getStatus: async () => ({ ok: true, data: { status: 'unlocked' } }) as BwResult<{ status: string }>,
    getItem: async (_session, itemId) => ({ ok: true, data: {
      id: itemId, organizationId: null, folderId: null, type: 1 as const,
      name: 'Test Item', notes: null, favorite: false,
      login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'pass', totp: null },
      revisionDate: '2024-01-01T00:00:00.000Z',
    } }),
    listItems: async () => ({ ok: true, data: [] }) as BwResult<never[]>,
    listFolders: async () => ({ ok: true, data: [] }) as BwResult<never[]>,
    editItem: async () => ({ ok: true, data: undefined }) as BwResult<void>,
    deleteItem: async () => ({ ok: true, data: undefined }) as BwResult<void>,
    createFolder: async () => ({ ok: true, data: 'id' }) as BwResult<string>,
    sync: async () => ({ ok: true, data: undefined }) as BwResult<void>,
    ...overrides,
  };
}

describe('runPreflight', () => {
  it('succeeds when bw is available and vault is unlocked', async () => {
    const bw = makeFakeAdapter();
    const result = await runPreflight(bw);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.bwVersion, '2024.6.0');
      assert.equal(result.data.vaultStatus, 'unlocked');
    }
  });

  it('returns BW_NOT_FOUND when bw is not on PATH', async () => {
    const bw = makeFakeAdapter({
      getVersion: async () => ({ ok: false, error: makeBwError(BwErrorCode.NOT_FOUND, 'bw not found') }),
    });
    const result = await runPreflight(bw);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'BW_NOT_FOUND');
    }
  });

  it('returns VAULT_LOCKED when vault status is locked', async () => {
    const bw = makeFakeAdapter({
      getStatus: async () => ({ ok: true, data: { status: 'locked' } }),
    });
    const result = await runPreflight(bw);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VAULT_LOCKED');
    }
  });

  it('returns VAULT_LOCKED when bw reports vault locked error', async () => {
    const bw = makeFakeAdapter({
      getStatus: async () => ({ ok: false, error: makeBwError(BwErrorCode.VAULT_LOCKED, 'locked') }),
    });
    const result = await runPreflight(bw);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VAULT_LOCKED');
    }
  });

  it('returns SESSION_MISSING when session error', async () => {
    const bw = makeFakeAdapter({
      getStatus: async () => ({ ok: false, error: makeBwError(BwErrorCode.SESSION_MISSING, 'no session') }),
    });
    const result = await runPreflight(bw);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'SESSION_MISSING');
    }
  });
});
