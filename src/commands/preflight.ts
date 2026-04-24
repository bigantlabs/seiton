import type { BwAdapter } from '../lib/bw.js';
import type { Logger } from '../adapters/logging.js';
import { ExitCode } from '../exit-codes.js';

export interface PreflightResult {
  bwVersion: string;
  vaultStatus: string;
}

export type PreflightError =
  | { code: 'BW_NOT_FOUND'; message: string }
  | { code: 'BW_VERSION_FAILED'; message: string }
  | { code: 'VAULT_LOCKED'; message: string }
  | { code: 'SESSION_MISSING'; message: string }
  | { code: 'STATUS_FAILED'; message: string };

export async function runPreflight(
  bw: BwAdapter,
  logger?: Logger,
): Promise<{ ok: true; data: PreflightResult } | { ok: false; error: PreflightError }> {
  logger?.info('preflight: checking bw version');
  const versionResult = await bw.getVersion();
  if (!versionResult.ok) {
    if (versionResult.error.code === 'NOT_FOUND') {
      return { ok: false, error: { code: 'BW_NOT_FOUND', message: 'bw CLI not found on PATH' } };
    }
    return { ok: false, error: { code: 'BW_VERSION_FAILED', message: versionResult.error.message } };
  }

  logger?.info('preflight: checking vault status');
  const statusResult = await bw.getStatus();
  if (!statusResult.ok) {
    if (statusResult.error.code === 'VAULT_LOCKED') {
      return { ok: false, error: { code: 'VAULT_LOCKED', message: 'Vault is locked. Run: bw unlock' } };
    }
    if (statusResult.error.code === 'SESSION_MISSING') {
      return { ok: false, error: { code: 'SESSION_MISSING', message: 'BW_SESSION is invalid or expired' } };
    }
    return { ok: false, error: { code: 'STATUS_FAILED', message: statusResult.error.message } };
  }

  if (statusResult.data.status === 'locked') {
    return { ok: false, error: { code: 'VAULT_LOCKED', message: 'Vault is locked. Run: bw unlock' } };
  }

  logger?.info('preflight: passed', { bwVersion: versionResult.data, status: statusResult.data.status });
  return {
    ok: true,
    data: { bwVersion: versionResult.data, vaultStatus: statusResult.data.status },
  };
}

export function mapPreflightExit(code: string): ExitCode {
  switch (code) {
    case 'BW_NOT_FOUND': return ExitCode.UNAVAILABLE;
    case 'BW_VERSION_FAILED': return ExitCode.UNAVAILABLE;
    case 'VAULT_LOCKED': return ExitCode.NO_PERMISSION;
    case 'SESSION_MISSING': return ExitCode.NO_PERMISSION;
    case 'STATUS_FAILED': return ExitCode.GENERAL_ERROR;
    default: return ExitCode.GENERAL_ERROR;
  }
}
