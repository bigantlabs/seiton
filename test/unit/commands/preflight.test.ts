import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../../../src/commands/preflight.js';
import { makeBwError, BwErrorCode } from '../../../src/lib/domain/types.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';

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
