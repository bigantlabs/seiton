import type { BwItem } from '../domain/types.js';

export type DedupConfig = {
  readonly treat_www_as_same_domain: boolean;
  readonly case_insensitive_usernames: boolean;
  readonly compare_only_primary_uri: boolean;
};

export interface NearDuplicateGroup {
  readonly items: readonly BwItem[];
  readonly maxDistance: number;
}
