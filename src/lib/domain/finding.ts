import type { BwItem } from './types.js';

export const FINDING_CATEGORIES = [
  'duplicates',
  'reuse',
  'weak',
  'missing',
  'folders',
  'near_duplicates',
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export type DuplicateFinding = {
  readonly category: 'duplicates';
  readonly items: readonly BwItem[];
  readonly key: string;
};

export type ReuseFinding = {
  readonly category: 'reuse';
  readonly items: readonly BwItem[];
  readonly passwordHash: string;
};

export type WeakFinding = {
  readonly category: 'weak';
  readonly item: BwItem;
  readonly score: number;
  readonly reasons: readonly string[];
};

export type MissingFinding = {
  readonly category: 'missing';
  readonly item: BwItem;
  readonly missingFields: readonly string[];
};

export type MatchReason = {
  readonly matchedKeyword: string;
  readonly ruleSource: 'builtin' | 'custom';
};

export type FolderFinding = {
  readonly category: 'folders';
  readonly item: BwItem;
  readonly suggestedFolder: string;
  readonly existingFolderId: string | null;
  readonly matchReason: MatchReason;
};

export type NearDuplicateFinding = {
  readonly category: 'near_duplicates';
  readonly items: readonly BwItem[];
  readonly maxDistance: number;
};

export type Finding =
  | DuplicateFinding
  | ReuseFinding
  | WeakFinding
  | MissingFinding
  | FolderFinding
  | NearDuplicateFinding;

export function makeDuplicateFinding(
  items: readonly BwItem[],
  key: string,
): DuplicateFinding {
  return { category: 'duplicates', items, key };
}

export function makeReuseFinding(
  items: readonly BwItem[],
  passwordHash: string,
): ReuseFinding {
  return { category: 'reuse', items, passwordHash };
}

export function makeWeakFinding(
  item: BwItem,
  score: number,
  reasons: readonly string[],
): WeakFinding {
  return { category: 'weak', item, score, reasons };
}

export function makeMissingFinding(
  item: BwItem,
  missingFields: readonly string[],
): MissingFinding {
  return { category: 'missing', item, missingFields };
}

export function makeFolderFinding(
  item: BwItem,
  folder: string,
  existingFolderId: string | null = null,
  matchReason: MatchReason = { matchedKeyword: '', ruleSource: 'builtin' },
): FolderFinding {
  return { category: 'folders', item, suggestedFolder: folder, existingFolderId, matchReason };
}

export function makeNearDuplicateFinding(
  items: readonly BwItem[],
  maxDistance: number,
): NearDuplicateFinding {
  return { category: 'near_duplicates', items, maxDistance };
}

export function isFindingCategory(value: string): value is FindingCategory {
  return (FINDING_CATEGORIES as readonly string[]).includes(value);
}

export const INFORMATIONAL_CATEGORIES: readonly FindingCategory[] = ['weak', 'reuse', 'missing', 'near_duplicates'];
export const ACTIONABLE_CATEGORIES: readonly FindingCategory[] = ['duplicates', 'folders'];

export function isInformationalCategory(category: FindingCategory): boolean {
  return (INFORMATIONAL_CATEGORIES as readonly string[]).includes(category);
}
