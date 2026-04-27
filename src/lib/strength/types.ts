export type StrengthConfig = {
  readonly minLength: number;
  readonly requireDigit: boolean;
  readonly requireSymbol: boolean;
  readonly minCharacterClasses: number;
  readonly extraCommonPasswords: readonly string[];
};

export type ZxcvbnScoreResult = {
  readonly score: number;
  readonly feedback: readonly string[];
};
