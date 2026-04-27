import type { CustomRuleEntry } from '../folders/types.js';
import type { ZxcvbnScoreResult } from '../strength/types.js';

export type Scorer = (
  password: string,
  userDictionary: readonly string[],
) => ZxcvbnScoreResult;

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

export type RedactedItem = {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly folderId: string | null;
  readonly login: {
    readonly username: string | null;
    readonly uris: readonly string[];
    readonly password: string;
    readonly totp: string;
  } | null;
  readonly revisionDate: string;
};
