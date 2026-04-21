import { readFile, writeFile, rename, unlink, lstat, mkdir, realpath } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Logger } from './logging.js';

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

type FsOperation = 'read' | 'write';

export function createFsAdapter(root?: string, logger?: Logger): FsAdapter {
  const resolvedRoot = root ? resolve(root) : undefined;
  let realRootPromise: Promise<string> | undefined;

  function getRealRoot(): Promise<string> | undefined {
    if (!resolvedRoot) return undefined;
    if (!realRootPromise) {
      realRootPromise = realpath(resolvedRoot).catch((err: unknown) => {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'ENOENT') return resolvedRoot;
        throw err;
      });
    }
    return realRootPromise;
  }

  function assertWithinRoot(targetPath: string): void {
    if (!resolvedRoot) return;
    const resolved = resolve(targetPath);
    const rel = relative(resolvedRoot, resolved);
    const escapes = rel === '..' || rel.startsWith(`..${sep}`);
    if (escapes || resolve(resolvedRoot, rel) !== resolved) {
      throw new FsError(FsErrorCode.PATH_ESCAPE, targetPath, `Path ${targetPath} escapes root ${resolvedRoot}`);
    }
  }

  async function nearestExistingRealpath(p: string): Promise<string> {
    let current = p;
    while (true) {
      try {
        return await realpath(current);
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code !== 'ENOENT') throw err;
        const parent = dirname(current);
        if (parent === current) return current;
        current = parent;
      }
    }
  }

  async function assertRealParentWithinRoot(targetPath: string, operation: FsOperation): Promise<void> {
    const rootPromise = getRealRoot();
    if (!rootPromise) return;
    const realRoot = await rootPromise;

    const parent = dirname(targetPath);
    if (parent === targetPath) return;

    let realParent: string;
    try {
      realParent = await nearestExistingRealpath(parent);
    } catch (err: unknown) {
      throw mapNodeError(err, targetPath, operation);
    }

    if (realParent === realRoot) return;
    const rel = relative(realRoot, realParent);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new FsError(
        FsErrorCode.PATH_ESCAPE,
        targetPath,
        `Path ${targetPath} escapes root ${resolvedRoot} via symlink (real parent: ${realParent})`,
      );
    }
  }

  async function assertNotSymlink(targetPath: string, operation: FsOperation): Promise<void> {
    try {
      const stats = await lstat(targetPath);
      if (stats.isSymbolicLink()) {
        throw new FsError(FsErrorCode.SYMLINK_REJECTED, targetPath, `Refusing to follow symlink at ${targetPath}`);
      }
    } catch (err: unknown) {
      if (err instanceof FsError) throw err;
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT') return;
      throw mapNodeError(err, targetPath, operation);
    }
  }

  return {
    async readText(path: string): Promise<string> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      await assertRealParentWithinRoot(resolved, 'read');
      await assertNotSymlink(resolved, 'read');
      logger?.debug('fs: readText', { path: resolved });
      try {
        return await readFile(resolved, 'utf-8');
      } catch (err: unknown) {
        throw mapNodeError(err, resolved, 'read');
      }
    },

    async writeAtomic(path: string, content: string, mode: number = 0o600): Promise<void> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      await assertRealParentWithinRoot(resolved, 'write');
      await assertNotSymlink(resolved, 'write');
      logger?.debug('fs: writeAtomic', { path: resolved, mode });

      const dir = dirname(resolved);
      const tempName = join(dir, `.seiton-tmp-${randomBytes(8).toString('hex')}`);

      try {
        await writeFile(tempName, content, { mode });
      } catch (err: unknown) {
        throw mapNodeError(err, resolved, 'write');
      }

      try {
        await rename(tempName, resolved);
      } catch (err: unknown) {
        try {
          await unlink(tempName);
        } catch (e: unknown) {
          const cleanupCode = (e as { code?: string } | null)?.code;
          if (cleanupCode !== 'ENOENT' && cleanupCode !== 'EPERM') {
            logger?.warn('fs: temp file cleanup failed', {
              tempName,
              code: cleanupCode,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        throw mapNodeError(err, resolved, 'write');
      }
    },

    async remove(path: string): Promise<void> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      await assertRealParentWithinRoot(resolved, 'write');
      logger?.debug('fs: remove', { path: resolved });
      try {
        await unlink(resolved);
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'ENOENT') return;
        throw mapNodeError(err, resolved, 'write');
      }
    },

    async exists(path: string): Promise<boolean> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      try {
        await assertRealParentWithinRoot(resolved, 'read');
      } catch (err: unknown) {
        if (err instanceof FsError && err.code === FsErrorCode.PATH_ESCAPE) throw err;
        return false;
      }
      try {
        const stats = await lstat(resolved);
        return !stats.isSymbolicLink();
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'ENOENT') return false;
        throw mapNodeError(err, resolved, 'read');
      }
    },

    async ensureDir(path: string): Promise<void> {
      const resolved = resolve(path);
      assertWithinRoot(resolved);
      await assertRealParentWithinRoot(resolved, 'write');
      try {
        await mkdir(resolved, { recursive: true });
      } catch (err: unknown) {
        throw mapNodeError(err, resolved, 'write');
      }
    },
  };
}

function mapNodeError(err: unknown, path: string, operation: FsOperation = 'write'): FsError {
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
      return operation === 'read'
        ? new FsError(FsErrorCode.READ_FAILED, path, `I/O error at ${path}: ${msg}`)
        : new FsError(FsErrorCode.WRITE_FAILED, path, `I/O error at ${path}: ${msg}`);
  }
}
