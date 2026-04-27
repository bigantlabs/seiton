import type { BwItem, BwFolder } from '../domain/types.js';
import { ItemType } from '../domain/types.js';
import type { Finding } from '../domain/finding.js';
import {
  makeWeakFinding,
  makeMissingFinding,
  makeFolderFinding,
  makeNearDuplicateFinding,
} from '../domain/finding.js';
import { findNearDuplicateGroups } from '../dedup/near.js';
import { findExactDuplicates } from '../dedup/exact.js';
import { findReusedPasswords } from '../strength/reuse.js';
import { scorePassword, collectWeaknesses } from '../strength/heuristic.js';
import type { StrengthConfig } from '../strength/types.js';
import { zxcvbnScore } from '../strength/zxcvbn.js';
import { classifyItem } from '../folders/classify.js';
import type { Scorer, AnalysisConfig } from './types.js';

export type { Scorer, AnalysisConfig } from './types.js';

export function analyzeItems(
  items: readonly BwItem[],
  config: AnalysisConfig,
  existingFolders: readonly BwFolder[] = [],
  scorer?: Scorer,
): Finding[] {
  const logins = items.filter((i) => i.type === ItemType.LOGIN);

  return [
    ...findExactDuplicates(logins, config.dedup),
    ...findNearDuplicates(logins, config.dedup),
    ...findReusedPasswords(logins),
    ...findWeakPasswords(logins, config.strength, scorer),
    ...findMissingFields(logins),
    ...findFolderSuggestions(logins, config.folders, existingFolders),
  ];
}

function probeScorer(fn: Scorer): boolean {
  try {
    fn('probe', []);
    return true;
  } catch {
    // zxcvbn-fallback: deliberate recovery — probe must swallow load errors
    return false;
  }
}

function findWeakPasswords(
  items: readonly BwItem[],
  config: AnalysisConfig['strength'],
  scorer?: Scorer,
): Finding[] {
  const candidate = scorer ?? zxcvbnScore;
  const resolvedScorer = probeScorer(candidate) ? candidate : null;

  const strengthCfg: StrengthConfig = {
    minLength: config.min_length,
    requireDigit: config.require_digit,
    requireSymbol: config.require_symbol,
    minCharacterClasses: config.min_character_classes,
    extraCommonPasswords: [...config.extra_common_passwords],
  };

  const findings: Finding[] = [];
  for (const item of items) {
    const pw = item.login?.password;
    if (!pw) continue;

    let score: number;
    let reasons: readonly string[];

    if (resolvedScorer) {
      const result = resolvedScorer(pw, config.extra_common_passwords);
      score = result.score;
      reasons = result.feedback;
    } else {
      score = scorePassword(pw, strengthCfg);
      reasons = collectWeaknesses(pw, strengthCfg);
    }

    if (score < config.zxcvbn_min_score) {
      findings.push(makeWeakFinding(item, score, reasons));
    }
  }
  return findings;
}

function findMissingFields(items: readonly BwItem[]): Finding[] {
  const findings: Finding[] = [];
  for (const item of items) {
    const missing: string[] = [];
    if (!item.login?.password) missing.push('password');
    if (!item.login?.username) missing.push('username');
    if (!item.login?.uris?.some(u => u.uri)) missing.push('uri');
    if (missing.length > 0) {
      findings.push(makeMissingFinding(item, missing));
    }
  }
  return findings;
}

function findFolderSuggestions(
  items: readonly BwItem[],
  config: AnalysisConfig['folders'],
  existingFolders: readonly BwFolder[],
): Finding[] {
  const existingByName = new Map<string, { id: string; name: string }>();
  for (const f of existingFolders) {
    const key = f.name.toLowerCase();
    if (!existingByName.has(key)) existingByName.set(key, { id: f.id, name: f.name });
  }

  const findings: Finding[] = [];
  for (const item of items) {
    if (config.preserve_existing && item.folderId) continue;
    const uris = (item.login?.uris ?? [])
      .map((u) => u.uri)
      .filter((u): u is string => u !== null);
    const result = classifyItem(
      item.name,
      uris,
      config.custom_rules,
      config.enabled_categories,
    );
    if (result) {
      const existing = existingByName.get(result.folder.toLowerCase()) ?? null;
      findings.push(makeFolderFinding(
        item,
        existing?.name ?? result.folder,
        existing?.id ?? null,
        { matchedKeyword: result.matchedKeyword, ruleSource: result.ruleSource },
      ));
    }
  }
  return findings;
}

function findNearDuplicates(
  items: readonly BwItem[],
  config: AnalysisConfig['dedup'],
): Finding[] {
  const groups = findNearDuplicateGroups(items, config.name_similarity_threshold);
  return groups.map((g) => makeNearDuplicateFinding(g.items, g.maxDistance));
}
