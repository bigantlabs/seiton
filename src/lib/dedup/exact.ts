import type { BwItem } from '../domain/types.js';
import type { Finding } from '../domain/finding.js';
import { makeDuplicateFinding } from '../domain/finding.js';
import { dedupKey, dedupKeyMulti } from './key.js';
import type { DedupConfig } from './types.js';

export type { DedupConfig } from './types.js';

export function findExactDuplicates(
  items: readonly BwItem[],
  config: DedupConfig,
): Finding[] {
  const groups = new Map<string, BwItem[]>();
  const dedupOpts = {
    treatWwwAsSameDomain: config.treat_www_as_same_domain,
    caseInsensitiveUsernames: config.case_insensitive_usernames,
  };
  for (const item of items) {
    const uris = item.login?.uris ?? [];
    const key = config.compare_only_primary_uri
      ? dedupKey(uris[0]?.uri, item.login?.username, dedupOpts)
      : dedupKeyMulti(
          uris.map((u) => u.uri).filter((u): u is string => u !== null),
          item.login?.username,
          dedupOpts,
        );
    if (!key || key.startsWith(':')) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const findings: Finding[] = [];
  for (const [key, group] of groups) {
    if (group.length > 1) {
      findings.push(makeDuplicateFinding(group, key));
    }
  }
  return findings;
}
