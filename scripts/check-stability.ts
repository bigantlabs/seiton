import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function getPreviousTag(): string | null {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

function getExitCodesAtRef(ref: string): Map<string, number> {
  try {
    const content = execFileSync('git', ['show', `${ref}:src/exit-codes.ts`], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return parseExitCodes(content);
  } catch {
    return new Map();
  }
}

function getCurrentExitCodes(): Map<string, number> {
  const content = readFileSync(join(ROOT, 'src/exit-codes.ts'), 'utf-8');
  return parseExitCodes(content);
}

function parseExitCodes(content: string): Map<string, number> {
  const codes = new Map<string, number>();
  const regex = /(\w+):\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    codes.set(match[1], Number(match[2]));
  }
  return codes;
}

function getCliFlags(content: string): Set<string> {
  const flags = new Set<string>();
  const regex = /['"](-{1,2}[\w-]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const flag = match[1];
    if (flag.startsWith('--') || (flag.startsWith('-') && flag.length === 2)) {
      flags.add(flag);
    }
  }
  return flags;
}

function getCliFlagsAtRef(ref: string): Set<string> {
  try {
    const content = execFileSync('git', ['show', `${ref}:src/bw-organize.ts`], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return getCliFlags(content);
  } catch {
    return new Set();
  }
}

function getCurrentCliFlags(): Set<string> {
  const content = readFileSync(join(ROOT, 'src/bw-organize.ts'), 'utf-8');
  return getCliFlags(content);
}

function getDeprecations(): Set<string> {
  const path = join(ROOT, 'DEPRECATIONS.md');
  if (!existsSync(path)) return new Set();
  const content = readFileSync(path, 'utf-8');
  const entries = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') || trimmed.startsWith('-')) {
      entries.add(trimmed.toLowerCase());
    }
  }
  return entries;
}

function isDocumentedDeprecation(name: string, deprecations: Set<string>): boolean {
  const lower = name.toLowerCase();
  for (const entry of deprecations) {
    if (entry.includes(lower)) return true;
  }
  return false;
}

function main(): void {
  const tag = getPreviousTag();
  if (!tag) {
    console.log('check-stability: no previous tag found, skipping');
    process.exit(0);
  }

  console.log(`check-stability: comparing HEAD against ${tag}`);
  const deprecations = getDeprecations();
  const violations: string[] = [];

  const oldCodes = getExitCodesAtRef(tag);
  const newCodes = getCurrentExitCodes();
  for (const [name, code] of oldCodes) {
    if (!newCodes.has(name)) {
      if (!isDocumentedDeprecation(name, deprecations)) {
        violations.push(`Exit code removed: ${name} (${code}) — not listed in DEPRECATIONS.md`);
      }
    }
  }

  const oldFlags = getCliFlagsAtRef(tag);
  const newFlags = getCurrentCliFlags();
  for (const flag of oldFlags) {
    if (!newFlags.has(flag)) {
      if (!isDocumentedDeprecation(flag, deprecations)) {
        violations.push(`CLI flag removed: ${flag} — not listed in DEPRECATIONS.md`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('check-stability: FAILED — undocumented removals:');
    for (const v of violations) {
      console.error(`  ${v}`);
    }
    process.exit(1);
  }

  console.log('check-stability: OK');
  process.exit(0);
}

main();
