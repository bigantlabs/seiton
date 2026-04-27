export type CustomRuleEntry = {
  readonly folder: string;
  readonly keywords: readonly string[];
};

export type ClassifyResult = {
  readonly folder: string;
  readonly matchedKeyword: string;
  readonly ruleSource: 'builtin' | 'custom';
};

export type BuiltinRule = {
  readonly folder: string;
  readonly keywords: readonly string[];
};
