import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createBwServeAdapter } from '../../../src/lib/bw-serve.js';
import { makeFakeAdapter } from '../../helpers/fake-adapter.js';

function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

describe('BwServeAdapter', () => {
  let server: Server | undefined;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  it('delegates getVersion to CLI fallback', async () => {
    const cli = makeFakeAdapter({
      getVersion: async () => ({ ok: true, data: '2024.6.0' }),
    });
    const adapter = createBwServeAdapter('http://127.0.0.1:1', cli);
    const result = await adapter.getVersion();
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data, '2024.6.0');
  });

  it('routes getStatus to GET /status', async () => {
    const mock = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'unlocked' }));
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.getStatus();
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.status, 'unlocked');
  });

  it('routes getItem to GET /object/item/<id>', async () => {
    let capturedUrl = '';
    const item = {
      id: 'item-1', organizationId: null, folderId: null, type: 1,
      name: 'Test', notes: null, favorite: false,
      login: null, revisionDate: '2024-01-01T00:00:00.000Z',
    };
    const mock = await startMockServer((req, res) => {
      capturedUrl = req.url ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(item));
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.getItem('session', 'item-1');
    assert.equal(result.ok, true);
    assert.equal(capturedUrl, '/object/item/item-1');
    if (result.ok) assert.equal(result.data.id, 'item-1');
  });

  it('routes listItems to GET /list/object/items', async () => {
    let capturedUrl = '';
    const mock = await startMockServer((req, res) => {
      capturedUrl = req.url ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.listItems('session');
    assert.equal(result.ok, true);
    assert.equal(capturedUrl, '/list/object/items');
    if (result.ok) assert.deepEqual(result.data, []);
  });

  it('routes listFolders to GET /list/object/folders', async () => {
    let capturedUrl = '';
    const mock = await startMockServer((req, res) => {
      capturedUrl = req.url ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.listFolders('session');
    assert.equal(result.ok, true);
    assert.equal(capturedUrl, '/list/object/folders');
    if (result.ok) assert.deepEqual(result.data, []);
  });

  it('routes editItem to PUT /object/item/<id> with decoded JSON body', async () => {
    let capturedMethod = '';
    let capturedUrl = '';
    let capturedBody = '';
    const mock = await startMockServer(async (req, res) => {
      capturedMethod = req.method ?? '';
      capturedUrl = req.url ?? '';
      capturedBody = await collectBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    server = mock.server;

    const itemJson = JSON.stringify({ id: 'item-1', folderId: 'folder-1' });
    const encoded = Buffer.from(itemJson).toString('base64');

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.editItem('session', 'item-1', encoded);
    assert.equal(result.ok, true);
    assert.equal(capturedMethod, 'PUT');
    assert.equal(capturedUrl, '/object/item/item-1');
    assert.equal(capturedBody, itemJson);
  });

  it('routes deleteItem to DELETE /object/item/<id>', async () => {
    let capturedMethod = '';
    let capturedUrl = '';
    const mock = await startMockServer((req, res) => {
      capturedMethod = req.method ?? '';
      capturedUrl = req.url ?? '';
      res.writeHead(200);
      res.end('{}');
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.deleteItem('session', 'item-1');
    assert.equal(result.ok, true);
    assert.equal(capturedMethod, 'DELETE');
    assert.equal(capturedUrl, '/object/item/item-1');
  });

  it('routes createFolder to POST /object/folder with decoded JSON body', async () => {
    let capturedMethod = '';
    let capturedBody = '';
    const mock = await startMockServer(async (req, res) => {
      capturedMethod = req.method ?? '';
      capturedBody = await collectBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'new-folder-id' }));
    });
    server = mock.server;

    const folderJson = JSON.stringify({ name: 'MyFolder' });
    const encoded = Buffer.from(folderJson).toString('base64');

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.createFolder('session', encoded);
    assert.equal(result.ok, true);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedBody, folderJson);
    if (result.ok) assert.equal(result.data, 'new-folder-id');
  });

  it('routes sync to POST /sync', async () => {
    let capturedMethod = '';
    let capturedUrl = '';
    const mock = await startMockServer((req, res) => {
      capturedMethod = req.method ?? '';
      capturedUrl = req.url ?? '';
      res.writeHead(200);
      res.end('{}');
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.sync('session');
    assert.equal(result.ok, true);
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedUrl, '/sync');
  });

  it('maps 404 to NOT_FOUND error', async () => {
    const mock = await startMockServer((_req, res) => {
      res.writeHead(404);
      res.end('Not found');
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.getItem('session', 'missing-item');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'NOT_FOUND');
  });

  it('maps 401 to SESSION_MISSING error', async () => {
    const mock = await startMockServer((_req, res) => {
      res.writeHead(401);
      res.end('Unauthorized');
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.getStatus();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'SESSION_MISSING');
  });

  it('maps 500 to UNKNOWN error', async () => {
    const mock = await startMockServer((_req, res) => {
      res.writeHead(500);
      res.end('Internal error');
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.listItems('session');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'UNKNOWN');
  });

  it('returns INVALID_JSON on non-JSON response body', async () => {
    const mock = await startMockServer((_req, res) => {
      res.writeHead(200);
      res.end('not-json');
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.listItems('session');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'INVALID_JSON');
  });

  it('returns SCHEMA_MISMATCH when item fails validation', async () => {
    const mock = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bad: 'data' }));
    });
    server = mock.server;

    const adapter = createBwServeAdapter(mock.baseUrl, makeFakeAdapter());
    const result = await adapter.getItem('session', 'item-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'SCHEMA_MISMATCH');
  });

  it('returns error when connection refused', async () => {
    const adapter = createBwServeAdapter('http://127.0.0.1:1', makeFakeAdapter());
    const result = await adapter.listItems('session');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'UNKNOWN');
  });
});
