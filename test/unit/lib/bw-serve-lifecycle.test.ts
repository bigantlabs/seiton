import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { waitReady } from '../../../src/lib/bw-serve-lifecycle.js';

describe('waitReady', () => {
  let server: Server | undefined;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  it('returns ok when server responds 200 immediately', async () => {
    server = createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const result = await waitReady(`http://127.0.0.1:${port}`, 5000);
    assert.equal(result.ok, true);
  });

  it('retries and succeeds when server becomes ready after delay', async () => {
    let requestCount = 0;
    server = createServer((_req, res) => {
      requestCount++;
      if (requestCount < 3) {
        res.writeHead(500);
        res.end('not ready');
      } else {
        res.writeHead(200);
        res.end('ok');
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const result = await waitReady(`http://127.0.0.1:${port}`, 10000);
    assert.equal(result.ok, true);
    assert.ok(requestCount >= 3);
  });

  it('returns error when server never becomes ready within timeout', async () => {
    const result = await waitReady('http://127.0.0.1:1', 1000);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /did not become ready/);
    }
  });
});

describe('startBwServe', () => {
  it('returns error when binary does not exist', async () => {
    const { startBwServe } = await import('../../../src/lib/bw-serve-lifecycle.js');
    const result = await startBwServe({
      bin: '/nonexistent/bw-fake-binary-12345',
      port: 19999,
      session: 'test-session',
      startupTimeoutMs: 2000,
    });
    assert.equal(result.ok, false);
  });
});
