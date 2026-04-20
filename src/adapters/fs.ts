import { readFile, writeFile, rename, unlink, stat, lstat, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { randomBytes } from 'node:crypto';

export const FsErrorCode = {
  NOT_FOUND: 'FS_NOT_FOUND',
  PERMISSION_DENIED: 'FS_PERMISSION_DENIED',
  ALREADY_EXISTS: 'FS_ALREADY_EXISTS',
  SYMLINK_REJECTED: 'FS_SYMLINK_REJECTED',
  PATH_ESCAPE: 'FS_PATH_ESCAPE',
  WRITE_FAILED: 'FS_WRITE_FAILED',
  READ_FAILED: 'FS_READ_FAILED',
  NOT_A_FILE: 'FS_NOT_A_FILE',
} as const;

export type FsErrorCode = (typeof FsErrorCode)[keyof typeof FsErrorCode];

export class FsError extends Error {
  readonly code: FsErrorCode;
  readonly path: string;
  constructor(code: FsErrorCode, path: string, message: string) {
    super(message);
    this.name = 'FsError';
    this.code = code;
    this.path = path;
  }
}

export interface FsAdapter {
  readText(path: string): Promise<string>;
  writeAtomic(path: string, content: string, mode?: number): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
}

export function createFsAdapter(root?: string): FsAdapter {
  const resolvedRoot = root ? resolve(root) : undefined;

  function assertWithinRoot(targetPath: string): void {
    if (!resolvedRoot) return;
    const resolved = resolve(targetPath);
    const rel = relative(resolvedRoot, resolved);
    if (rel.startsWith('..') || resolve(resolvedRoot, rel) !== resolved) {
      throw new FsError(FsErrorCode.PATH_ESCAPE, targetPath, `Path ${targetPath} escapes root ${resolvedRoot}`);
    }
  }

  async function assertNotSymlink(targetPath: string): Promise<void> {
    try {
      const stats = await lstat(targetPath);
      if (stats.isSymbolicLink()) {
        throw new FsError(FsErrorCode.SYMLINK_REJECTED, targetPath, `Refusing to follow symlink at ${targetPath}`);
      }
    } catch (err: unknown) {
      if (err instanceof FsError) throw err;
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT') return;
      throw mapNodeError(err, targetPath);
    }
  }

  return {
    async readText(path: string): Promise<string> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      await assertNotSymlink(resolved);
      try {
        return await readFile(resolved, 'utf-8');
      } catch (err: unknown) {
        throw mapNodeError(err, resolved);
      }
    },

    async writeAtomic(path: string, content: string, mode: number = 0o600): Promise<void> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      await assertNotSymlink(resolved);

      const dir = dirname(resolved);
      const tempName = join(dir, `.seiton-tmp-${randomBytes(8).toString('hex')}`);

      try {
        await writeFile(tempName, content, { mode });
      } catch (err: unknown) {
        throw mapNodeError(err, resolved);
      }

      try {
        await rename(tempName, resolved);
      } catch (err: unknown) {
        try { await unlink(tempName); } catch (e: unknown) { const c = (e as {code?:string}|null)?.code; if (c !== 'ENOENT' && c !== 'EPERM') throw e; }
        throw mapNodeError(err, resolved);
      }
    },

    async remove(path: string): Promise<void> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      try {
        await unlink(resolved);
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'ENOENT') return;
        throw mapNodeError(err, resolved);
      }
    },

    async exists(path: string): Promise<boolean> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      try {
        await stat(resolved);
        return true;
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'ENOENT') return false;
        throw mapNodeError(err, resolved);
      }
    },

    async ensureDir(path: string): Promise<void> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      try {
        await mkdir(resolved, { recursive: true });
      } catch (err: unknown) {
        throw mapNodeError(err, resolved);
      }
    },
  };
}

function mapNodeError(err: unknown, path: string): FsError {
  const code = (err as { code?: string } | null)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  switch (code) {
    case 'ENOENT':
      return new FsError(FsErrorCode.NOT_FOUND, path, `File not found: ${path}: ${msg}`);
    case 'EACCES':
    case 'EPERM':
      return new FsError(FsErrorCode.PERMISSION_DENIED, path, `Permission denied: ${path}: ${msg}`);
    case 'EEXIST':
      return new FsError(FsErrorCode.ALREADY_EXISTS, path, `Already exists: ${path}: ${msg}`);
    case 'EISDIR':
      return new FsError(FsErrorCode.NOT_A_FILE, path, `Not a file: ${path}: ${msg}`);
    default:
      return new FsError(FsErrorCode.WRITE_FAILED, path, `I/O error at ${path}: ${msg}`);
  }
}
