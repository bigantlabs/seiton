import type { Config } from '../config/schema.js';
import type { BwAdapter } from '../lib/bw.js';
import type { Logger } from '../adapters/logging.js';
import { startBwServe, type ServeHandle } from '../lib/bw-serve-lifecycle.js';
import { createBwServeAdapter } from '../lib/bw-serve.js';

export interface ServeBridgeResult {
  bw: BwAdapter;
  serveHandle: ServeHandle | undefined;
}

export async function tryStartServe(
  config: Config,
  session: string,
  cliBw: BwAdapter,
  logger?: Logger,
): Promise<ServeBridgeResult> {
  if (!config.bw_serve.enabled) {
    return { bw: cliBw, serveHandle: undefined };
  }

  logger?.info('serve-bridge: starting bw serve');
  const result = await startBwServe({
    bin: config.paths.bw_binary ?? 'bw',
    port: config.bw_serve.port,
    session,
    startupTimeoutMs: config.bw_serve.startup_timeout_ms,
    logger,
  });

  if (!result.ok) {
    logger?.warn('serve-bridge: bw serve failed to start, using CLI adapter', {
      error: result.error,
    });
    return { bw: cliBw, serveHandle: undefined };
  }

  const serveBw = createBwServeAdapter(result.handle.baseUrl, cliBw, logger);
  return { bw: serveBw, serveHandle: result.handle };
}

export async function stopServe(handle: ServeHandle | undefined, logger?: Logger): Promise<void> {
  if (!handle) return;
  logger?.info('serve-bridge: stopping bw serve');
  await handle.stop();
}
