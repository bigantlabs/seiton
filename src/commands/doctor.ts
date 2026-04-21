import { loadConfigWithPath, ConfigError } from '../config/loader.js';
import { getBwVersion } from '../lib/bw.js';
import { VERSION } from '../version.js';
import type { Logger } from '../adapters/logging.js';
import { createNoopLogger } from '../adapters/logging.js';

export interface DoctorOptions {
  cliConfigPath?: string;
  envConfigPath?: string;
  debug?: boolean;
  logger?: Logger;
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
  results.push(checkNodeVersion());
  results.push(await checkBwBinary(log));
  results.push(checkBwSession());
  results.push(await checkConfig(opts));
  results.push(checkVersion());
  return results;
}

function checkNodeVersion(): CheckResult {
  const major = parseInt(process.versions.node.split('.')[0]!, 10);
  if (major >= 22) {
    return { name: 'node', status: 'ok', detail: `v${process.versions.node}` };
  }
  return { name: 'node', status: 'fail', detail: `v${process.versions.node} (requires >=22)` };
}

async function checkBwBinary(logger?: Logger): Promise<CheckResult> {
  try {
    const version = await getBwVersion(logger);
    return { name: 'bw', status: 'ok', detail: `v${version}` };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') {
      return { name: 'bw', status: 'fail', detail: 'not found on PATH' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'bw', status: 'fail', detail: `error: ${msg}` };
  }
}

function checkBwSession(): CheckResult {
  const session = process.env['BW_SESSION'];
  if (session && session.length > 0) {
    return { name: 'session', status: 'ok', detail: 'BW_SESSION is set' };
  }
  return {
    name: 'session',
    status: 'fail',
    detail: 'BW_SESSION is not set. Run: export BW_SESSION=$(bw unlock --raw)',
  };
}

async function checkConfig(opts: DoctorOptions): Promise<CheckResult> {
  try {
    const { path } = await loadConfigWithPath({
      cliConfigPath: opts.cliConfigPath,
      envConfigPath: opts.envConfigPath,
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
