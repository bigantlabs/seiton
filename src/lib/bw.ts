import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { BwItemSchema, BwFolderSchema, makeBwError, BwErrorCode } from './domain/types.js';
import type { BwItem, BwFolder, BwError } from './domain/types.js';
import type { Logger } from '../adapters/logging.js';

const execFileAsync = promisify(execFile);
const BW_TIMEOUT_MS = 30_000;
const BW_MAX_BUFFER = 10 * 1024 * 1024;

type SpawnError = Error & { stderr?: string; code?: number | string };

function runWithStdin(
  bin: string,
  args: string[],
  input: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let settled = false;
    const fail = (err: SpawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const err: SpawnError = new Error('bw command timed out');
      err.stderr = Buffer.concat(stderrChunks).toString('utf8');
      fail(err);
    }, BW_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen > BW_MAX_BUFFER) {
        child.kill('SIGTERM');
        fail(new Error('stdout maxBuffer exceeded'));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrLen += chunk.length;
      if (stderrLen > BW_MAX_BUFFER) {
        child.kill('SIGTERM');
        fail(new Error('stderr maxBuffer exceeded'));
        return;
      }
      stderrChunks.push(chunk);
    });
    child.on('error', (err) => fail(err as SpawnError));
    child.stdin.on('error', (err) => fail(err as SpawnError));
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const err: SpawnError = new Error(stderr || `bw exited with code ${code ?? 'null'}`);
      if (typeof code === 'number') err.code = code;
      err.stderr = stderr;
      reject(err);
    });
    child.stdin.end(input);
  });
}

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

  async function run(
    args: string[],
    opts: { env?: Record<string, string>; input?: string } = {},
  ): Promise<BwResult<string>> {
    logger?.debug('bw: exec', { bin, args });
    const mergedEnv = { ...process.env, ...opts.env };
    try {
      if (opts.input !== undefined) {
        const stdout = await runWithStdin(bin, args, opts.input, mergedEnv);
        return { ok: true, data: stdout };
      }
      const { stdout } = await execFileAsync(bin, args, {
        timeout: BW_TIMEOUT_MS,
        maxBuffer: BW_MAX_BUFFER,
        env: mergedEnv,
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
      if (/\bVault is locked\b/i.test(stderr)) {
        return { ok: false, error: makeBwError(BwErrorCode.VAULT_LOCKED, 'Vault is locked', exitCode, stderr) };
      }
      if (/\bnot logged in\b/i.test(stderr) || /\bsession key.*not found\b/i.test(stderr)) {
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
      const result = await run(['get', 'item', itemId], { env: { BW_SESSION: session } });
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
      const result = await run(['list', 'items'], { env: { BW_SESSION: session } });
      if (!result.ok) return result;
      let raw: unknown;
      try {
        raw = JSON.parse(result.data);
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw list items output') };
      }
      const parsed = z.array(BwItemSchema).safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path.length ? issue.path.join('.') : '(root)';
        return { ok: false, error: makeBwError(
          BwErrorCode.SCHEMA_MISMATCH,
          `Vault items failed schema validation at ${path}: ${issue?.message ?? 'unknown error'}`,
        ) };
      }
      return { ok: true, data: parsed.data };
    },

    async listFolders(session: string): Promise<BwResult<BwFolder[]>> {
      const result = await run(['list', 'folders'], { env: { BW_SESSION: session } });
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
      const result = await run(['edit', 'item', itemId], {
        env: { BW_SESSION: session },
        input: encodedJson,
      });
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    },

    async deleteItem(session: string, itemId: string): Promise<BwResult<void>> {
      const result = await run(['delete', 'item', itemId], { env: { BW_SESSION: session } });
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    },

    async createFolder(session: string, encodedJson: string): Promise<BwResult<string>> {
      const result = await run(['create', 'folder'], {
        env: { BW_SESSION: session },
        input: encodedJson,
      });
      if (!result.ok) return result;
      try {
        const parsed = JSON.parse(result.data) as { id?: string };
        if (!parsed.id) {
          return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'bw create folder response missing id field') };
        }
        return { ok: true, data: parsed.id };
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw create folder output') };
      }
    },

    async sync(session: string): Promise<BwResult<void>> {
      const result = await run(['sync'], { env: { BW_SESSION: session } });
      if (!result.ok) return result;
      return { ok: true, data: undefined };
    },
  };
}

