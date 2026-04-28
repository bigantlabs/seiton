import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
  throw new Error('package.json is missing a valid "version" field');
}

const tag = `v${pkg.version}`;

function tagExists(): boolean {
  try {
    execFileSync('git', ['ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

if (tagExists()) {
  console.log(`tag ${tag} already exists — skipping`);
  process.exit(0);
}

execFileSync('git', ['tag', tag], { cwd: root, stdio: 'inherit' });
execFileSync('git', ['push', 'origin', tag], { cwd: root, stdio: 'inherit' });
console.log(`pushed tag ${tag}`);
