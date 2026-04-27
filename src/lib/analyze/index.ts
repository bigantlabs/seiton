import { createHash } from 'node:crypto';
import type { BwItem, BwFolder } from '../domain/types.js';
import { ItemType } from '../domain/types.js';
import type { Finding } from '../domain/finding.js';
import {
  makeDuplicateFinding,
  makeReuseFinding,
  makeWeakFinding,
  makeMissingFinding,
  makeFolderFinding,
  makeNearDuplicateFinding,
} from '../domain/finding.js';
import { dedupKey, dedupKeyMulti } from '../dedup/key.js';
import { findNearDuplicateGroups } from '../dedup/near.js';
import { scorePassword, collectWeaknesses, type StrengthConfig } from '../strength/heuristic.js';
import { zxcvbnScore } from '../strength/zxcvbn.js';
import { classifyItem, type CustomRuleEntry } from '../folders/builtins.js';

export interface AnalysisConfig {
  readonly strength: {
    readonly min_length: number;
    readonly require_digit: boolean;
    readonly require_symbol: boolean;
    readonly min_character_classes: number;
    readonly zxcvbn_min_score: number;
    readonly extra_common_passwords: readonly string[];
  };
  readonly dedup: {
    readonly name_similarity_threshold: number;
    readonly treat_www_as_same_domain: boolean;
    readonly case_insensitive_usernames: boolean;
    readonly compare_only_primary_uri: boolean;
  };
  readonly folders: {
    readonly preserve_existing: boolean;
    readonly enabled_categories: readonly string[];
    readonly custom_rules: readonly CustomRuleEntry[];
  };
}

export function analyzeItems(
  items: readonly BwItem[],
  config: AnalysisConfig,
  existingFolders: readonly BwFolder[] = [],
): Finding[] {
  const logins = items.filter((i) => i.type === ItemType.LOGIN);

  return [
    ...findDuplicates(logins, config.dedup),
    ...findNearDuplicates(logins, config.dedup),
    ...findReusedPasswords(logins),
    ...findWeakPasswords(logins, config.strength),
    ...findMissingFields(logins),
    ...findFolderSuggestions(logins, config.folders, existingFolders),
  ];
}

function findDuplicates(
  items: readonly BwItem[],
  config: AnalysisConfig['dedup'],
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

function findReusedPasswords(items: readonly BwItem[]): Finding[] {
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

function probeZxcvbn(): boolean {
  try {
    zxcvbnScore('probe', []);
    return true;
  } catch {
    return false;
  }
}

function findWeakPasswords(
  items: readonly BwItem[],
  config: AnalysisConfig['strength'],
  logger?: { warn(msg: string): void },
): Finding[] {
  const useZxcvbn = probeZxcvbn();
  if (!useZxcvbn && logger) {
    logger.warn('zxcvbn-ts unavailable; falling back to heuristic scoring');
  }

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

    if (useZxcvbn) {
      const result = zxcvbnScore(pw, config.extra_common_passwords);
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
