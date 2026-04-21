import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runReport } from '../../../src/commands/report.js';
import type { Config } from '../../../src/config/schema.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';
import type { BwItem } from '../../../src/lib/domain/types.js';

const defaultConfig: Config = {
  version: 1,
  core: { output_format: 'text', color: 'auto', verbose: 0, quiet: false },
  paths: { pending_queue: null, bw_binary: null },
  audit: { skip_categories: [], limit_per_category: null, save_pending_on_sigint: true },
  strength: {
    min_length: 12, require_digit: true, require_symbol: true,
    min_character_classes: 2, zxcvbn_min_score: 2, extra_common_passwords: [],
  },
  dedup: {
    name_similarity_threshold: 3, treat_www_as_same_domain: true,
    case_insensitive_usernames: true, compare_only_primary_uri: true,
  },
  folders: { preserve_existing: true, enabled_categories: ['Banking & Finance'], custom_rules: [] },
  ui: { mask_character: '•', show_revision_date: true, color_scheme: 'auto', prompt_style: 'clack' },
  logging: { format: 'text', level: 'info' },
};

function makeItem(overrides: Partial<BwItem> & { id: string; name: string }): BwItem {
  return {
    organizationId: null,
    folderId: null,
    type: 1,
    notes: null,
    favorite: false,
    login: {
      uris: [{ match: null, uri: 'https://example.com' }],
      username: 'user@example.com',
      password: 'Str0ng!P@ssw0rd#2024xyz',
      totp: null,
    },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('runReport with findings', () => {
  it('returns weak finding for item with short password', async () => {
    const weakItem = makeItem({
      id: 'weak-1',
      name: 'Weak Login',
      login: {
        uris: [{ match: null, uri: 'https://weaksite.com' }],
        username: 'user',
        password: 'abc',
        totp: null,
      },
    });

    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: [weakItem] }),
      listFolders: async () => ({ ok: true, data: [] }),
    });

    const result = await runReport({ config: defaultConfig, session: 'test-session', bw });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.findings.length > 0, 'Expected at least one finding');
      const weakFindings = result.findings.filter((f) => f.category === 'weak');
      assert.ok(weakFindings.length > 0, 'Expected at least one weak finding');
      assert.equal(result.itemCount, 1);
    }
  });

  it('returns missing finding for item without password', async () => {
    const missingItem = makeItem({
      id: 'missing-1',
      name: 'No Password Login',
      login: {
        uris: [{ match: null, uri: 'https://nopass.com' }],
        username: 'user',
        password: null,
        totp: null,
      },
    });

    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: [missingItem] }),
      listFolders: async () => ({ ok: true, data: [] }),
    });

    const result = await runReport({ config: defaultConfig, session: 'test-session', bw });
    assert.equal(result.ok, true);
    if (result.ok) {
      const missingFindings = result.findings.filter((f) => f.category === 'missing');
      assert.ok(missingFindings.length > 0, 'Expected at least one missing finding');
      if (missingFindings[0]?.category === 'missing') {
        assert.ok(missingFindings[0].missingFields.includes('password'));
      }
    }
  });

  it('returns reuse finding when multiple items share a password', async () => {
    const sharedPassword = 'SharedP@ss123!';
    const item1 = makeItem({
      id: 'reuse-1',
      name: 'Login A',
      login: {
        uris: [{ match: null, uri: 'https://siteA.com' }],
        username: 'userA',
        password: sharedPassword,
        totp: null,
      },
    });
    const item2 = makeItem({
      id: 'reuse-2',
      name: 'Login B',
      login: {
        uris: [{ match: null, uri: 'https://siteB.com' }],
        username: 'userB',
        password: sharedPassword,
        totp: null,
      },
    });

    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: [item1, item2] }),
      listFolders: async () => ({ ok: true, data: [] }),
    });

    const result = await runReport({ config: defaultConfig, session: 'test-session', bw });
    assert.equal(result.ok, true);
    if (result.ok) {
      const reuseFindings = result.findings.filter((f) => f.category === 'reuse');
      assert.ok(reuseFindings.length > 0, 'Expected at least one reuse finding');
    }
  });

  it('returns duplicate finding when items share domain+username', async () => {
    const item1 = makeItem({
      id: 'dup-1',
      name: 'Example Login 1',
      login: {
        uris: [{ match: null, uri: 'https://example.com' }],
        username: 'same-user',
        password: 'UniquePass1!xyz',
        totp: null,
      },
    });
    const item2 = makeItem({
      id: 'dup-2',
      name: 'Example Login 2',
      login: {
        uris: [{ match: null, uri: 'https://example.com' }],
        username: 'same-user',
        password: 'UniquePass2!abc',
        totp: null,
      },
    });

    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: [item1, item2] }),
      listFolders: async () => ({ ok: true, data: [] }),
    });

    const result = await runReport({ config: defaultConfig, session: 'test-session', bw });
    assert.equal(result.ok, true);
    if (result.ok) {
      const dupFindings = result.findings.filter((f) => f.category === 'duplicates');
      assert.ok(dupFindings.length > 0, 'Expected at least one duplicate finding');
    }
  });

  it('returns FETCH_FAILED when bw listItems fails', async () => {
    const bw = makeFakeAdapter({
      listItems: async () => ({
        ok: false,
        error: { code: 'UNKNOWN' as const, message: 'vault locked', exitCode: 1, stderr: '' },
      }),
    });

    const result = await runReport({ config: defaultConfig, session: 'test-session', bw });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'FETCH_FAILED');
      assert.ok(result.message.includes('vault locked'));
    }
  });

  it('respects skipCategories filter', async () => {
    const weakItem = makeItem({
      id: 'skip-1',
      name: 'Weak Skip',
      login: {
        uris: [{ match: null, uri: 'https://skip.com' }],
        username: 'user',
        password: 'abc',
        totp: null,
      },
    });

    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: [weakItem] }),
      listFolders: async () => ({ ok: true, data: [] }),
    });

    const result = await runReport({
      config: defaultConfig,
      session: 'test-session',
      bw,
      skipCategories: ['weak', 'missing'],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const weakFindings = result.findings.filter((f) => f.category === 'weak');
      const missingFindings = result.findings.filter((f) => f.category === 'missing');
      assert.equal(weakFindings.length, 0, 'Weak findings should be skipped');
      assert.equal(missingFindings.length, 0, 'Missing findings should be skipped');
    }
  });

  it('respects limitPerCategory', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem({
      id: `limit-${i}`,
      name: `Weak Login ${i}`,
      login: {
        uris: [{ match: null, uri: `https://site${i}.com` }],
        username: `user${i}`,
        password: `ab${i}`,
        totp: null,
      },
    }));

    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: items }),
      listFolders: async () => ({ ok: true, data: [] }),
    });

    const result = await runReport({
      config: defaultConfig,
      session: 'test-session',
      bw,
      limitPerCategory: 2,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const weakFindings = result.findings.filter((f) => f.category === 'weak');
      assert.ok(weakFindings.length <= 2, `Expected at most 2 weak findings, got ${weakFindings.length}`);
    }
  });

  it('reports folderCount from bw adapter', async () => {
    const bw = makeFakeAdapter({
      listItems: async () => ({ ok: true, data: [] }),
      listFolders: async () => ({
        ok: true,
        data: [
          { id: 'f1', name: 'Folder A' },
          { id: 'f2', name: 'Folder B' },
        ],
      }),
    });

    const result = await runReport({ config: defaultConfig, session: 'test-session', bw });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.folderCount, 2);
      assert.equal(result.itemCount, 0);
    }
  });
});
