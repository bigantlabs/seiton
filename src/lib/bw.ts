import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { BwItemSchema, BwFolderSchema, makeBwError, BwErrorCode } from './domain/types.js';
import type { BwItem, BwFolder, BwError } from './domain/types.js';
import type { Logger } from '../adapters/logging.js';

const execFileAsync = promisify(execFile);

export type BwResult<T> = { ok: true; data: T } | { ok: false; error: BwError };

export interface BwAdapter {
  getVersion(): Promise<BwResult<string>>;
  getStatus(): Promise<BwResult<{ status: string }>>;
  getItem(session: string, itemId: string): Promise<BwResult<BwItem>>;
  listItems(session: string): Promise<BwResult<BwItem[]>>;
  listFolders(session: string): Promise<BwResult<BwFolder[]>>;
  editItem(session: string, itemId: string, encodedJson: string): Promise<BwResult<void>>;
  deleteItem(session: string, itemId: string): Promise<BwResult<void>>;
  createFolder(session: string, encodedJson: string): Promise<BwResult<string>>;
  sync(session: string): Promise<BwResult<void>>;
}

export function createBwAdapter(bwBinary?: string | null, logger?: Logger): BwAdapter {
  const bin = bwBinary ?? 'bw';

  async function run(args: string[], env?: Record<string, string>): Promise<BwResult<string>> {
    logger?.debug('bw: exec', { bin, args });
    try {
      const { stdout } = await execFileAsync(bin, args, {
        timeout: 30_000,
        env: { ...process.env, ...env },
      });
      return { ok: true, data: stdout };
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT') {
        return { ok: false, error: makeBwError(BwErrorCode.NOT_FOUND, `${bin} not found on PATH`) };
      }
      const e = err as { stderr?: string; code?: number; message?: string };
      const stderr = e.stderr ?? '';
      const exitCode = typeof e.code === 'number' ? e.code : null;
      if (stderr.includes('locked') || stderr.includes('Vault is locked')) {
        return { ok: false, error: makeBwError(BwErrorCode.VAULT_LOCKED, 'Vault is locked', exitCode, stderr) };
      }
      if (stderr.includes('not logged in') || stderr.includes('session key')) {
        return { ok: false, error: makeBwError(BwErrorCode.SESSION_MISSING, 'Session invalid', exitCode, stderr) };
      }
      return { ok: false, error: makeBwError(BwErrorCode.UNKNOWN, e.message ?? 'bw command failed', exitCode, stderr) };
    }
  }

  return {
    async getVersion(): Promise<BwResult<string>> {
      const result = await run(['--version']);
      if (!result.ok) return result;
      return { ok: true, data: result.data.trim() };
    },

    async getStatus(): Promise<BwResult<{ status: string }>> {
      const result = await run(['status']);
      if (!result.ok) return result;
      try {
        const parsed = JSON.parse(result.data) as { status?: string };
        return { ok: true, data: { status: parsed.status ?? 'unknown' } };
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw status output') };
      }
    },

    async getItem(session: string, itemId: string): Promise<BwResult<BwItem>> {
      const result = await run(['get', 'item', itemId, '--session', session]);
      if (!result.ok) return result;
      let raw: unknown;
      try {
        raw = JSON.parse(result.data);
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw get item output') };
      }
      const parsed = BwItemSchema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'Item failed schema validation') };
      }
      return { ok: true, data: parsed.data };
    },

    async listItems(session: string): Promise<BwResult<BwItem[]>> {
      const result = await run(['list', 'items', '--session', session]);
      if (!result.ok) return result;
      let raw: unknown;
      try {
        raw = JSON.parse(result.data);
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw list items output') };
      }
      const parsed = z.array(BwItemSchema).safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'Vault items failed schema validation') };
      }
      return { ok: true, data: parsed.data };
    },

    async listFolders(session: string): Promise<BwResult<BwFolder[]>> {
      const result = await run(['list', 'folders', '--session', session]);
      if (!result.ok) return result;
      let raw: unknown;
      try {
        raw = JSON.parse(result.data);
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw list folders output') };
      }
      const parsed = z.array(BwFolderSchema).safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'Vault folders failed schema validation') };
      }
      return { ok: true, data: parsed.data };
    },

    async editItem(session: string, itemId: string, encodedJson: string): Promise<BwResult<void>> {
      const result = await run(['edit', 'item', itemId, encodedJson, '--session', session]);
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    },

    async deleteItem(session: string, itemId: string): Promise<BwResult<void>> {
      const result = await run(['delete', 'item', itemId, '--session', session]);
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    },

    async createFolder(session: string, encodedJson: string): Promise<BwResult<string>> {
      const result = await run(['create', 'folder', encodedJson, '--session', session]);
      if (!result.ok) return result;
      try {
        const parsed = JSON.parse(result.data) as { id?: string };
        return { ok: true, data: parsed.id ?? '' };
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw create folder output') };
      }
    },

    async sync(session: string): Promise<BwResult<void>> {
      const result = await run(['sync', '--session', session]);
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    },
  };
}

export async function getBwVersion(logger?: Logger): Promise<string> {
  logger?.debug('bw: fetching version');
  const { stdout } = await execFileAsync('bw', ['--version'], { timeout: 10_000 });
  const version = stdout.trim();
  logger?.debug('bw: version retrieved', { version });
  return version;
}
