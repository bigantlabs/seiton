import type { BwItem } from './types.js';

export const FINDING_CATEGORIES = [
  'duplicates',
  'reuse',
  'weak',
  'missing',
  'folders',
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

export type FolderFinding = {
  readonly category: 'folders';
  readonly item: BwItem;
  readonly suggestedFolder: string;
  readonly matchedRule: string;
};

export type Finding =
  | DuplicateFinding
  | ReuseFinding
  | WeakFinding
  | MissingFinding
  | FolderFinding;

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
  suggestedFolder: string,
  matchedRule: string,
): FolderFinding {
  return { category: 'folders', item, suggestedFolder, matchedRule };
}

export function isFindingCategory(value: string): value is FindingCategory {
  return (FINDING_CATEGORIES as readonly string[]).includes(value);
}
