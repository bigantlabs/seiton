import { BUILTIN_RULES, BUILTIN_FOLDER_INDEX } from './builtins.js';
import type { CustomRuleEntry, ClassifyResult } from './types.js';

export type { CustomRuleEntry, ClassifyResult } from './types.js';

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}

function containsAsWord(text: string, keyword: string): boolean {
  if (!keyword) return false;
  let start = 0;
  while (start <= text.length) {
    const idx = text.indexOf(keyword, start);
    if (idx < 0) return false;
    const before = idx === 0 ? '' : text[idx - 1]!;
    const afterIdx = idx + keyword.length;
    const after = afterIdx >= text.length ? '' : text[afterIdx]!;
    const beforeOk = before === '' || !isWordChar(before);
    const afterOk = after === '' || !isWordChar(after);
    if (beforeOk && afterOk) return true;
    start = idx + 1;
  }
  return false;
}

export function classifyItem(
  name: string,
  uris: readonly string[],
  customRules: readonly CustomRuleEntry[],
  enabledCategories: readonly string[],
): ClassifyResult | null {
  const searchable = [
    name.toLowerCase(),
    ...uris.map((u) => u.toLowerCase()),
  ];

  for (const rule of customRules) {
    for (const keyword of rule.keywords) {
      const lower = keyword.toLowerCase();
      for (const text of searchable) {
        if (containsAsWord(text, lower)) {
          return { folder: rule.folder, matchedKeyword: keyword, ruleSource: 'custom' };
        }
      }
    }
  }

  const enabledSet = new Set(enabledCategories);

  for (const rule of BUILTIN_RULES) {
    if (!enabledSet.has(rule.folder)) continue;
    for (const keyword of rule.keywords) {
      const lower = keyword.toLowerCase();
      for (const text of searchable) {
        if (containsAsWord(text, lower)) {
          return { folder: rule.folder, matchedKeyword: keyword, ruleSource: 'builtin' };
        }
      }
    }
  }

  return null;
}

export function builtinFolderForKeyword(keyword: string): string | undefined {
  return BUILTIN_FOLDER_INDEX.get(keyword.toLowerCase());
}
