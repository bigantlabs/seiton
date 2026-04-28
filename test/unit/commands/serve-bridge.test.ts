import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { tryStartServe, stopServe, type ServeBridgeResult } from '../../../src/commands/serve-bridge.js';
import { createBwServeAdapter } from '../../../src/lib/bw-serve.js';
import type { Config } from '../../../src/config/schema.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';
import { makeNoopLogger } from '../../helpers/test-doubles.js';

function makeConfig(overrides: Partial<Config['bw_serve']> = {}): Config {
  return {
    version: 1,
    core: { output_format: 'text', color: 'auto', verbose: 0, quiet: false },
    paths: { pending_queue: null, bw_binary: null },
    audit: { skip_categories: [], limit_per_category: null, save_pending_on_sigint: true },
    strength: { min_length: 12, require_digit: true, require_symbol: true, min_character_classes: 2, zxcvbn_min_score: 2, extra_common_passwords: [] },
    dedup: { name_similarity_threshold: 3, treat_www_as_same_domain: true, case_insensitive_usernames: true, compare_only_primary_uri: true },
    folders: { preserve_existing: true, enabled_categories: ['Banking & Finance'], custom_rules: [] },
    ui: { mask_character: '•', show_revision_date: true, color_scheme: 'auto', prompt_style: 'clack' },
    logging: { format: 'text', level: 'info' },
    bw_serve: { enabled: false, port: 8087, startup_timeout_ms: 5000, ...overrides },
  } as Config;
}

function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; port: number; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve({ server, port: addr.port, baseUrl: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}

describe('serve-bridge', () => {
  describe('tryStartServe', () => {
    it('returns CLI adapter when bw_serve is disabled', async () => {
      const cliBw = makeFakeAdapter();
      const result = await tryStartServe(
        makeConfig({ enabled: false }),
        'test-session',
        cliBw,
        makeNoopLogger(),
      );
      assert.equal(result.bw, cliBw);
      assert.equal(result.serveHandle, undefined);
    });

    it('falls back to CLI adapter when bw serve fails to start', async () => {
      const cliBw = makeFakeAdapter();
      const result = await tryStartServe(
        makeConfig({ enabled: true, startup_timeout_ms: 1000 }),
        'test-session',
        cliBw,
        makeNoopLogger(),
      );
      assert.equal(result.bw, cliBw);
      assert.equal(result.serveHandle, undefined);
    });

    it('falls back to CLI adapter when bw binary does not exist', async () => {
      const cliBw = makeFakeAdapter();
      const config = makeConfig({ enabled: true, startup_timeout_ms: 1000 });
      (config as { paths: { bw_binary: string | null; pending_queue: string | null } }).paths.bw_binary = '/nonexistent/bw-fake-12345';
      const result = await tryStartServe(config, 'test-session', cliBw, makeNoopLogger());
      assert.equal(result.bw, cliBw);
      assert.equal(result.serveHandle, undefined);
    });
  });

  describe('stopServe', () => {
    it('is a no-op when handle is undefined', async () => {
      await stopServe(undefined, makeNoopLogger());
    });

    it('calls handle.stop() when handle is provided', async () => {
      let stopped = false;
      const handle = {
        baseUrl: 'http://127.0.0.1:9999',
        port: 9999,
        stop: async () => { stopped = true; },
      };
      await stopServe(handle, makeNoopLogger());
      assert.equal(stopped, true);
    });
  });

  describe('serve adapter end-to-end flow', () => {
    let server: Server | undefined;

    afterEach(() => {
      if (server) {
        server.close();
        server = undefined;
      }
    });

    it('listItems through serve adapter returns parsed items', async () => {
      const items = [
        {
          id: 'item-1', organizationId: null, folderId: null, type: 1,
          name: 'Test', notes: null, favorite: false,
          login: null, revisionDate: '2024-01-01T00:00:00.000Z',
        },
      ];
      const mock = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(items));
      });
      server = mock.server;

      const cliBw = makeFakeAdapter();
      const serveBw = createBwServeAdapter(mock.baseUrl, cliBw, makeNoopLogger());
      const result: ServeBridgeResult = { bw: serveBw, serveHandle: { baseUrl: mock.baseUrl, port: mock.port, stop: async () => { server?.close(); } } };

      const listResult = await result.bw.listItems('session');
      assert.equal(listResult.ok, true);
      if (listResult.ok) {
        assert.equal(listResult.data.length, 1);
        assert.equal(listResult.data[0].id, 'item-1');
      }

      await stopServe(result.serveHandle, makeNoopLogger());
    });

    it('full flow: create adapter → list folders → edit item → stop', async () => {
      const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {};
      routes['GET /list/object/folders'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 'f1', name: 'Banking' }]));
      };
      routes['PUT /object/item/item-1'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      };

      const mock = await startMockServer((req, res) => {
        const key = `${req.method} ${req.url}`;
        const handler = routes[key];
        if (handler) {
          handler(req, res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      server = mock.server;

      const cliBw = makeFakeAdapter();
      const serveBw = createBwServeAdapter(mock.baseUrl, cliBw, makeNoopLogger());
      let stopped = false;
      const handle = { baseUrl: mock.baseUrl, port: mock.port, stop: async () => { stopped = true; } };

      const foldersResult = await serveBw.listFolders('session');
      assert.equal(foldersResult.ok, true);
      if (foldersResult.ok) {
        assert.equal(foldersResult.data.length, 1);
        assert.equal(foldersResult.data[0].name, 'Banking');
      }

      const itemJson = JSON.stringify({ id: 'item-1', folderId: 'f1' });
      const encoded = Buffer.from(itemJson).toString('base64');
      const editResult = await serveBw.editItem('session', 'item-1', encoded);
      assert.equal(editResult.ok, true);

      await stopServe(handle, makeNoopLogger());
      assert.equal(stopped, true);
    });
  });
});
