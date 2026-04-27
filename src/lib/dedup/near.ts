import { distance } from 'fastest-levenshtein';
import type { BwItem } from '../domain/types.js';
import { ItemType } from '../domain/types.js';
import type { NearDuplicateGroup } from './types.js';

export type { NearDuplicateGroup } from './types.js';

export function findNearDuplicateGroups(
  items: readonly BwItem[],
  threshold: number,
): readonly NearDuplicateGroup[] {
  if (threshold <= 0) return [];

  const logins = items.filter((i) => i.type === ItemType.LOGIN);
  if (logins.length < 2) return [];

  const names = logins.map((i) => i.name.toLowerCase().trim());

  const parent = new Int32Array(logins.length);
  const rank = new Int32Array(logins.length);
  for (let i = 0; i < logins.length; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra]! < rank[rb]!) { parent[ra] = rb; }
    else if (rank[ra]! > rank[rb]!) { parent[rb] = ra; }
    else { parent[rb] = ra; rank[ra]!++; }
  }

  const maxDist = new Map<number, number>();

  for (let i = 0; i < logins.length; i++) {
    for (let j = i + 1; j < logins.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      if (Math.abs(a.length - b.length) > threshold) continue;
      const d = distance(a, b);
      if (d <= threshold) {
        union(i, j);
        const root = find(i);
        const prev = maxDist.get(root) ?? 0;
        if (d > prev) maxDist.set(root, d);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < logins.length; i++) {
    const root = find(i);
    let group = clusters.get(root);
    if (!group) {
      group = [];
      clusters.set(root, group);
    }
    group.push(i);
  }

  const results: NearDuplicateGroup[] = [];
  for (const [root, indices] of clusters) {
    if (indices.length < 2) continue;
    const groupItems = indices.map((idx) => logins[idx]!);
    const dist = maxDist.get(root) ?? 0;
    results.push({ items: groupItems, maxDistance: dist });
  }
  return results;
}
