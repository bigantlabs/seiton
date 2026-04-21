import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { ROOT, type RunResult } from '../helpers/run-cli.js';

const execFileAsync = promisify(execFile);

const WEBSITE_DIR = join(ROOT, 'website');

async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
  }
}

describe('Website build', () => {
  it('should install dependencies in website directory', async () => {
    const result = await runCommand('npm', ['install'], WEBSITE_DIR);
    assert.equal(
      result.exitCode,
      0,
      `npm install failed with exit code ${result.exitCode}: ${result.stderr}`,
    );
  });

  it('should build the Docusaurus site without errors', async () => {
    const result = await runCommand('npm', ['run', 'build'], WEBSITE_DIR);
    assert.equal(
      result.exitCode,
      0,
      `npm run build failed with exit code ${result.exitCode}: ${result.stderr}`,
    );
  });

  it('should produce a build directory', async () => {
    const buildDir = join(WEBSITE_DIR, 'build');
    const stats = await stat(buildDir);
    assert(stats.isDirectory(), 'build directory should exist');
  });
});
