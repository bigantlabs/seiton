import { loadConfigWithPath, ConfigError } from '../config/loader.js';
import { createBwAdapter, type BwAdapter } from '../lib/bw.js';
import { VERSION } from '../version.js';
import type { Logger } from '../adapters/logging.js';
import { createNoopLogger } from '../adapters/logging.js';

export interface DoctorOptions {
  cliConfigPath?: string;
  envConfigPath?: string;
  debug?: boolean;
  logger?: Logger;
  bwSession?: string;
  nodeVersion?: string;
  bwAdapter?: BwAdapter;
}

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export async function runDoctorChecks(opts: DoctorOptions = {}): Promise<CheckResult[]> {
  const log = opts.logger ?? createNoopLogger();
  log.info('doctor command started', { version: VERSION });

  const results: CheckResult[] = [];
  results.push(checkNodeVersion(opts.nodeVersion ?? process.versions.node));
  const bwAdapter = opts.bwAdapter ?? createBwAdapter(undefined, log);
  results.push(await checkBwBinary(bwAdapter));
  results.push(checkBwSession(opts.bwSession));
  results.push(await checkConfig(opts, log));
  results.push(checkVersion());
  return results;
}

function checkNodeVersion(nodeVersion: string): CheckResult {
  const major = parseInt(nodeVersion.split('.')[0]!, 10);
  if (major >= 22) {
    return { name: 'node', status: 'ok', detail: `v${nodeVersion}` };
  }
  return { name: 'node', status: 'fail', detail: `v${nodeVersion} (requires >=22)` };
}

async function checkBwBinary(adapter: BwAdapter): Promise<CheckResult> {
  const result = await adapter.getVersion();
  if (result.ok) {
    return { name: 'bw', status: 'ok', detail: `v${result.data}` };
  }
  if (result.error.code === 'NOT_FOUND') {
    return { name: 'bw', status: 'fail', detail: 'not found on PATH' };
  }
  return { name: 'bw', status: 'fail', detail: `error: ${result.error.message}` };
}

function checkBwSession(session?: string): CheckResult {
  const value = session;
  if (value && value.length > 0) {
    return { name: 'session', status: 'ok', detail: 'BW_SESSION is set' };
  }
  return {
    name: 'session',
    status: 'fail',
    detail: 'BW_SESSION is not set. Run: export BW_SESSION=$(bw unlock --raw)',
  };
}

async function checkConfig(opts: DoctorOptions, logger?: Logger): Promise<CheckResult> {
  try {
    const { path } = await loadConfigWithPath({
      cliConfigPath: opts.cliConfigPath,
      envConfigPath: opts.envConfigPath,
      logger,
    });
    return { name: 'config', status: 'ok', detail: `valid (${path ?? 'defaults'})` };
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      return { name: 'config', status: 'fail', detail: err.message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'config', status: 'fail', detail: msg };
  }
}

function checkVersion(): CheckResult {
  return { name: 'version', status: 'ok', detail: `seiton v${VERSION}` };
}
