import { createHash } from 'node:crypto';
import type { BwItem } from '../domain/types.js';
import type { Finding } from '../domain/finding.js';
import { makeReuseFinding } from '../domain/finding.js';

export function findReusedPasswords(items: readonly BwItem[]): Finding[] {
  const groups = new Map<string, BwItem[]>();
  for (const item of items) {
    const pw = item.login?.password;
    if (!pw) continue;
    const hash = createHash('sha256').update(pw).digest('hex');
    const group = groups.get(hash);
    if (group) group.push(item);
    else groups.set(hash, [item]);
  }

  const findings: Finding[] = [];
  let groupCounter = 0;
  for (const [, group] of groups) {
    if (group.length > 1) {
      groupCounter++;
      findings.push(makeReuseFinding(group, `reuse-group-${groupCounter}`));
    }
  }
  return findings;
}
