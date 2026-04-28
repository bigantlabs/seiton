import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, '.gitkeep'), '');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
}

function createBareRemote(tempBase: string, workDir: string): string {
  const bare = join(tempBase, 'bare.git');
  execFileSync('git', ['clone', '--bare', workDir, bare], { stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: workDir, stdio: 'ignore' });
  return bare;
}

function buildScript(root: string): string {
  return `
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = ${JSON.stringify(root)};
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
  throw new Error('package.json is missing a valid "version" field');
}

const tag = \`v\${pkg.version}\`;

function tagExists() {
  try {
    execFileSync('git', ['rev-parse', '--verify', \`refs/tags/\${tag}\`], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

if (tagExists()) {
  console.log(\`tag \${tag} already exists — skipping\`);
  process.exit(0);
}

execFileSync('git', ['tag', tag], { cwd: root, stdio: 'inherit' });
execFileSync('git', ['push', 'origin', tag], { cwd: root, stdio: 'inherit' });
console.log(\`pushed tag \${tag}\`);
`;
}

function runScript(root: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', ['--input-type=module', '-e', buildScript(root)], {
      cwd: root,
      timeout: 10_000,
      encoding: 'utf8',
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { stdout: e.stdout ?? '', exitCode: e.status ?? 1 };
    }
    throw err;
  }
}

describe('tag-release script', () => {
  let tempBase: string;
  let workDir: string;

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'seiton-tag-release-'));
    workDir = join(tempBase, 'work');
    execFileSync('mkdir', ['-p', workDir]);
  });

  afterEach(() => {
    if (tempBase) {
      rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it('exits 0 and logs skip message when tag already exists', () => {
    initGitRepo(workDir);
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    execFileSync('git', ['add', 'package.json'], { cwd: workDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add pkg'], { cwd: workDir, stdio: 'ignore' });
    execFileSync('git', ['tag', 'v1.0.0'], { cwd: workDir, stdio: 'ignore' });
    createBareRemote(tempBase, workDir);

    const result = runScript(workDir);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('already exists'), `expected skip message, got: ${result.stdout}`);
  });

  it('creates tag and pushes when tag does not exist', () => {
    initGitRepo(workDir);
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    execFileSync('git', ['add', 'package.json'], { cwd: workDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add pkg'], { cwd: workDir, stdio: 'ignore' });
    createBareRemote(tempBase, workDir);

    const result = runScript(workDir);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('pushed tag v2.0.0'), `expected push message, got: ${result.stdout}`);

    const tags = execFileSync('git', ['tag', '--list'], { cwd: workDir, encoding: 'utf8' });
    assert.ok(tags.includes('v2.0.0'), 'tag should exist in local repo');

    const remoteTags = execFileSync('git', ['ls-remote', '--tags', 'origin'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    assert.ok(remoteTags.includes('v2.0.0'), 'tag should exist in remote');
  });

  it('exits non-zero when package.json has no version field', () => {
    initGitRepo(workDir);
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ name: 'no-version' }));

    const result = runScript(workDir);
    assert.notEqual(result.exitCode, 0, 'should exit non-zero for missing version');
  });

  it('exits non-zero when version is an empty string', () => {
    initGitRepo(workDir);
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ version: '' }));

    const result = runScript(workDir);
    assert.notEqual(result.exitCode, 0, 'should exit non-zero for empty version');
  });

  it('exits non-zero when version is a non-string type', () => {
    initGitRepo(workDir);
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ version: 123 }));

    const result = runScript(workDir);
    assert.notEqual(result.exitCode, 0, 'should exit non-zero for non-string version');
  });

  it('is idempotent — running twice with same version succeeds both times', () => {
    initGitRepo(workDir);
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ version: '3.0.0' }));
    execFileSync('git', ['add', 'package.json'], { cwd: workDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add pkg'], { cwd: workDir, stdio: 'ignore' });
    createBareRemote(tempBase, workDir);

    const first = runScript(workDir);
    assert.equal(first.exitCode, 0);
    assert.ok(first.stdout.includes('pushed tag v3.0.0'));

    const second = runScript(workDir);
    assert.equal(second.exitCode, 0);
    assert.ok(second.stdout.includes('already exists'));
  });
});
