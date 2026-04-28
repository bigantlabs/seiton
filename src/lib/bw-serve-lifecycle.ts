import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import type { Logger } from '../adapters/logging.js';
import { registerCleanup } from '../core/signals.js';

export interface ServeHandle {
  baseUrl: string;
  port: number;
  stop: () => Promise<void>;
}

export interface StartServeOptions {
  bin: string;
  port: number;
  session: string;
  startupTimeoutMs: number;
  logger?: Logger;
}

const STOP_TIMEOUT_MS = 3_000;

export async function startBwServe(opts: StartServeOptions): Promise<{ ok: true; handle: ServeHandle } | { ok: false; error: string }> {
  const { bin, port, session, startupTimeoutMs, logger } = opts;
  const baseUrl = `http://127.0.0.1:${port}`;

  logger?.info('bw-serve: spawning', { bin, port });

  let child: ChildProcess;
  try {
    child = spawn(bin, ['serve', '--port', String(port)], {
      env: { ...process.env, BW_SESSION: session },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to spawn bw serve: ${msg}` };
  }

  let spawnError: string | undefined;
  child.on('error', (err) => {
    spawnError = err.message;
    logger?.error('bw-serve: spawn error', { error: err.message });
  });

  const stderrChunks: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });

  let exited = false;
  child.on('exit', (code) => {
    exited = true;
    logger?.info('bw-serve: process exited', { code });
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 200));

  if (exited || spawnError) {
    const stderr = stderrChunks.join('');
    return { ok: false, error: spawnError ?? `bw serve exited immediately. stderr: ${stderr}` };
  }

  const ready = await waitReady(baseUrl, startupTimeoutMs, logger);
  if (!ready.ok) {
    killProcess(child, logger);
    return { ok: false, error: ready.error };
  }

  const stopFn = async () => killProcess(child, logger);
  const unregister = registerCleanup(stopFn);

  const handle: ServeHandle = {
    baseUrl,
    port,
    stop: async () => {
      unregister();
      await killProcess(child, logger);
    },
  };

  logger?.info('bw-serve: ready', { baseUrl });
  return { ok: true, handle };
}

export async function waitReady(
  baseUrl: string,
  timeoutMs: number,
  logger?: Logger,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const deadline = Date.now() + timeoutMs;
  const intervalMs = 500;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    logger?.debug('bw-serve: health check attempt', { attempt });
    const result = await healthCheck(baseUrl);
    if (result.ok) {
      logger?.info('bw-serve: health check passed', { attempt });
      return { ok: true };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }

  return { ok: false, error: `bw serve did not become ready within ${timeoutMs}ms` };
}

function healthCheck(baseUrl: string): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    const req = httpRequest(`${baseUrl}/`, { method: 'GET', timeout: 2_000 }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode === 200 });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
    req.end();
  });
}

function killProcess(child: ChildProcess, logger?: Logger): Promise<void> {
  return new Promise((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      logger?.warn('bw-serve: SIGTERM timeout, sending SIGKILL');
      try { child.kill('SIGKILL'); } catch { logger?.debug('bw-serve: SIGKILL failed, process already exited'); }
      resolve();
    }, STOP_TIMEOUT_MS);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    logger?.info('bw-serve: sending SIGTERM');
    try { child.kill('SIGTERM'); } catch { logger?.debug('bw-serve: SIGTERM failed, process already exited'); resolve(); }
  });
}
