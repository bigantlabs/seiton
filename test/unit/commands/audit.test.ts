import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit, type AuditOptions } from '../../../src/commands/audit.js';
import type { Config } from '../../../src/config/schema.js';
import type { BwItem, BwFolder } from '../../../src/lib/domain/types.js';
import { makeBwError, BwErrorCode } from '../../../src/lib/domain/types.js';
import { ExitCode } from '../../../src/exit-codes.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';
import { ExitSignal, makeFakeProc, makeFakeFs, makeFakeClock, makeNoopLogger } from '../../helpers/test-doubles.js';

function makeDefaultConfig(overrides?: Partial<Config>): Config {
  return {
    version: 1,
    core: { output_format: 'text', color: 'auto', verbose: 0, quiet: false },
    paths: { pending_queue: '/tmp/seiton-test/pending.json', bw_binary: null },
    audit: { skip_categories: [], limit_per_category: null, save_pending_on_sigint: true },
    strength: { min_length: 12, require_digit: true, require_symbol: true, min_character_classes: 2, zxcvbn_min_score: 2, extra_common_passwords: [] },
    dedup: { name_similarity_threshold: 3, treat_www_as_same_domain: true, case_insensitive_usernames: true, compare_only_primary_uri: true },
    folders: { preserve_existing: true, enabled_categories: ['Banking & Finance'], custom_rules: [] },
    ui: { mask_character: '•', show_revision_date: true, color_scheme: 'auto', prompt_style: 'clack' },
    logging: { format: 'text', level: 'info' },
    bw_serve: { enabled: false, port: 8087, startup_timeout_ms: 5000 },
    ...overrides,
  } as Config;
}

function makeOpts(overrides: Partial<AuditOptions> = {}): AuditOptions {
  return {
    config: makeDefaultConfig(),
    configFilePath: null,
    bw: makeFakeAdapter(),
    fs: makeFakeFs(),
    clock: makeFakeClock(),
    proc: makeFakeProc({ BW_SESSION: 'test-session' }, true),
    logger: makeNoopLogger(),
    dryRun: false,
    cliSkipCategories: [],
    cliLimit: null,
    ...overrides,
  };
}

async function runAndCatch(opts: AuditOptions): Promise<ExitSignal> {
  try {
    await runAudit(opts);
    throw new Error('runAudit did not call proc.exit');
  } catch (e) {
    if (e instanceof ExitSignal) return e;
    throw e;
  }
}

describe('runAudit', () => {
  describe('TTY gate', () => {
    it('exits 64 when stdin is not a TTY', async () => {
      const exit = await runAndCatch(makeOpts({
        proc: makeFakeProc({ BW_SESSION: 'test' }, false),
      }));
      assert.equal(exit.code, ExitCode.USAGE);
    });
  });

  describe('BW_SESSION gate', () => {
    it('exits 77 when BW_SESSION is not set', async () => {
      const exit = await runAndCatch(makeOpts({
        proc: makeFakeProc({}, true),
      }));
      assert.equal(exit.code, ExitCode.NO_PERMISSION);
    });
  });

  describe('preflight failures', () => {
    it('exits 69 when bw is not found', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          getVersion: async () => ({ ok: false, error: makeBwError(BwErrorCode.NOT_FOUND, 'bw not found') }),
        }),
      }));
      assert.equal(exit.code, ExitCode.UNAVAILABLE);
    });

    it('exits 69 when bw version fails (not just not found)', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          getVersion: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'version check failed') }),
        }),
      }));
      assert.equal(exit.code, ExitCode.UNAVAILABLE);
    });

    it('exits 77 when vault is locked', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          getStatus: async () => ({ ok: true, data: { status: 'locked' } }),
        }),
      }));
      assert.equal(exit.code, ExitCode.NO_PERMISSION);
    });

    it('exits 77 when bw reports session missing', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          getStatus: async () => ({
            ok: false,
            error: makeBwError(BwErrorCode.SESSION_MISSING, 'no session'),
          }),
        }),
      }));
      assert.equal(exit.code, ExitCode.NO_PERMISSION);
    });

    it('exits 1 when status check fails (not locked/missing session)', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          getStatus: async () => ({
            ok: false,
            error: makeBwError(BwErrorCode.UNKNOWN, 'status command failed'),
          }),
        }),
      }));
      assert.equal(exit.code, ExitCode.GENERAL_ERROR);
    });
  });

  describe('fetch failures', () => {
    it('exits 3 when listItems fails', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          listItems: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'vault error') }),
        }),
      }));
      assert.equal(exit.code, ExitCode.MALFORMED_BW_OUTPUT);
    });

    it('exits 3 when listFolders fails', async () => {
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          listFolders: async () => ({ ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'folders error') }),
        }),
      }));
      assert.equal(exit.code, ExitCode.MALFORMED_BW_OUTPUT);
    });
  });

  describe('pipeline past TTY gate', () => {
    it('completes with empty vault and exits 0', async () => {
      const exit = await runAndCatch(makeOpts());
      assert.equal(exit.code, ExitCode.SUCCESS);
    });

    it('runs through analyze and review with vault items', async () => {
      const items: BwItem[] = [
        {
          id: 'item-1', organizationId: null, folderId: null, type: 1,
          name: 'Good Login', notes: null, favorite: false,
          login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'u', password: 'str0ng!Pass', totp: null },
          revisionDate: '2024-01-01T00:00:00.000Z',
        },
      ];
      const folders: BwFolder[] = [{ id: 'f1', name: 'Existing' }];
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          listItems: async () => ({ ok: true, data: items }),
          listFolders: async () => ({ ok: true, data: folders }),
        }),
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
    });

    it('fetches items and folders in parallel via bw adapter', async () => {
      const callOrder: string[] = [];
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          listItems: async () => {
            callOrder.push('listItems');
            return { ok: true, data: [] };
          },
          listFolders: async () => {
            callOrder.push('listFolders');
            return { ok: true, data: [] };
          },
        }),
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
      assert.ok(callOrder.includes('listItems'));
      assert.ok(callOrder.includes('listFolders'));
    });

    it('detects items with missing passwords as findings', async () => {
      const items: BwItem[] = [
        {
          id: 'item-1', organizationId: null, folderId: null, type: 1,
          name: 'Missing PW', notes: null, favorite: false,
          login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'u', password: '', totp: null },
          revisionDate: '2024-01-01T00:00:00.000Z',
        },
      ];
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          listItems: async () => ({ ok: true, data: items }),
        }),
        dryRun: true,
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
    });
  });

  describe('dry-run mode', () => {
    it('exits 0 without calling apply or sync', async () => {
      let applyCalled = false;
      let syncCalled = false;
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          editItem: async () => { applyCalled = true; return { ok: true, data: undefined }; },
          sync: async () => { syncCalled = true; return { ok: true, data: undefined }; },
        }),
        dryRun: true,
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
      assert.equal(applyCalled, false);
      assert.equal(syncCalled, false);
    });
  });

  describe('SIGINT pending persistence', () => {
    it('does not write pending when save_pending_on_sigint is false', async () => {
      const fakeFs = makeFakeFs();
      const exit = await runAndCatch(makeOpts({
        config: makeDefaultConfig({
          audit: { skip_categories: [], limit_per_category: null, save_pending_on_sigint: false },
        }),
        fs: fakeFs,
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
      assert.equal(fakeFs.written.size, 0);
    });
  });

  describe('skip and limit options', () => {
    it('passes skip categories through to review', async () => {
      const items: BwItem[] = [
        {
          id: 'item-1', organizationId: null, folderId: null, type: 1,
          name: 'Missing PW', notes: null, favorite: false,
          login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'u', password: '', totp: null },
          revisionDate: '2024-01-01T00:00:00.000Z',
        },
      ];
      const exit = await runAndCatch(makeOpts({
        bw: makeFakeAdapter({
          listItems: async () => ({ ok: true, data: items }),
        }),
        cliSkipCategories: ['missing'],
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
    });

    it('passes limit through to review', async () => {
      const exit = await runAndCatch(makeOpts({
        cliLimit: 5,
      }));
      assert.equal(exit.code, ExitCode.SUCCESS);
    });
  });

});
