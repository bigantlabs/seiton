import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFsAdapter, FsError, FsErrorCode } from '../../../src/adapters/fs.js';

describe('FsAdapter', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-fs-test-'));
  });

  describe('readText', () => {
    it('reads a file successfully', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'hello.txt');
      await writeFile(target, 'world');
      const content = await fs.readText(target);
      assert.equal(content, 'world');
    });

    it('throws FS_NOT_FOUND for missing file', async () => {
      const fs = createFsAdapter(tmp);
      await assert.rejects(
        () => fs.readText(join(tmp, 'missing.txt')),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.NOT_FOUND);
          return true;
        },
      );
    });

    it('refuses to follow a symlink', async () => {
      const fs = createFsAdapter(tmp);
      const realFile = join(tmp, 'real.txt');
      const link = join(tmp, 'link.txt');
      await writeFile(realFile, 'secret');
      await symlink(realFile, link);
      await assert.rejects(
        () => fs.readText(link),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.SYMLINK_REJECTED);
          return true;
        },
      );
    });

    it('refuses path that escapes root', async () => {
      const fs = createFsAdapter(tmp);
      await assert.rejects(
        () => fs.readText(join(tmp, '..', 'etc', 'passwd')),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.PATH_ESCAPE);
          return true;
        },
      );
    });
  });

  describe('writeAtomic', () => {
    it('writes a file with correct content', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'output.json');
      await fs.writeAtomic(target, '{"hello":"world"}');
      const content = await readFile(target, 'utf-8');
      assert.equal(content, '{"hello":"world"}');
    });

    it('writes with mode 0600 by default', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'secure.json');
      await fs.writeAtomic(target, 'data');
      const stats = await stat(target);
      assert.equal(stats.mode & 0o777, 0o600);
    });

    it('writes atomically — no partial content on failure', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'existing.json');
      await writeFile(target, 'original');
      const subdir = join(tmp, 'subdir');
      await mkdir(subdir);
      const badTarget = join(subdir, 'nested', 'deep', 'file.json');
      try {
        await fs.writeAtomic(badTarget, 'new');
      } catch {
        // expected
      }
      const content = await readFile(target, 'utf-8');
      assert.equal(content, 'original');
    });

    it('overwrites existing file atomically', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'config.json');
      await fs.writeAtomic(target, 'v1');
      await fs.writeAtomic(target, 'v2');
      const content = await readFile(target, 'utf-8');
      assert.equal(content, 'v2');
    });

    it('refuses to write over a symlink', async () => {
      const fs = createFsAdapter(tmp);
      const realFile = join(tmp, 'real.txt');
      const link = join(tmp, 'link.txt');
      await writeFile(realFile, 'data');
      await symlink(realFile, link);
      await assert.rejects(
        () => fs.writeAtomic(link, 'evil'),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.SYMLINK_REJECTED);
          return true;
        },
      );
    });

    it('refuses path escaping root', async () => {
      const fs = createFsAdapter(tmp);
      await assert.rejects(
        () => fs.writeAtomic(join(tmp, '..', 'escape.txt'), 'data'),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.PATH_ESCAPE);
          return true;
        },
      );
    });

    it('applies a custom mode when specified', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'custom-mode.txt');
      await fs.writeAtomic(target, 'data', 0o640);
      const stats = await stat(target);
      assert.equal(stats.mode & 0o777, 0o640);
    });
  });

  describe('remove', () => {
    it('removes an existing file', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'delete-me.txt');
      await writeFile(target, 'bye');
      await fs.remove(target);
      const exists = await fs.exists(target);
      assert.equal(exists, false);
    });

    it('does not throw when file does not exist', async () => {
      const fs = createFsAdapter(tmp);
      await fs.remove(join(tmp, 'ghost.txt'));
    });

    it('refuses path that escapes root', async () => {
      const fs = createFsAdapter(tmp);
      await assert.rejects(
        () => fs.remove(join(tmp, '..', 'escaped-file.txt')),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.PATH_ESCAPE);
          return true;
        },
      );
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      const fs = createFsAdapter(tmp);
      const target = join(tmp, 'exists.txt');
      await writeFile(target, '');
      assert.equal(await fs.exists(target), true);
    });

    it('returns false for missing file', async () => {
      const fs = createFsAdapter(tmp);
      assert.equal(await fs.exists(join(tmp, 'nope.txt')), false);
    });
  });

  describe('ensureDir', () => {
    it('creates nested directories', async () => {
      const fs = createFsAdapter(tmp);
      const dir = join(tmp, 'a', 'b', 'c');
      await fs.ensureDir(dir);
      const stats = await stat(dir);
      assert.ok(stats.isDirectory());
    });

    it('does not fail when directory already exists', async () => {
      const fs = createFsAdapter(tmp);
      const dir = join(tmp, 'existing');
      await mkdir(dir);
      await fs.ensureDir(dir);
    });

    it('refuses path that escapes root', async () => {
      const fs = createFsAdapter(tmp);
      await assert.rejects(
        () => fs.ensureDir(join(tmp, '..', 'escaped-dir')),
        (err: unknown) => {
          assert.ok(err instanceof FsError);
          assert.equal(err.code, FsErrorCode.PATH_ESCAPE);
          return true;
        },
      );
    });
  });

  describe('without root restriction', () => {
    it('works without a root (no path escape check)', async () => {
      const fs = createFsAdapter();
      const target = join(tmp, 'no-root.txt');
      await fs.writeAtomic(target, 'ok');
      const content = await fs.readText(target);
      assert.equal(content, 'ok');
    });
  });
});
