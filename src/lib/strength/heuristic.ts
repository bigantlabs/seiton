const COMMON_SUBSTRINGS = [
  'password', 'pass', '1234', 'qwerty', 'abc123', 'letmein',
  'admin', 'welcome', 'monkey', 'dragon', 'master', 'login',
  'princess', 'football', 'shadow', 'sunshine', 'trustno1',
  'iloveyou', 'batman', 'access', 'hello', 'charlie',
] as const;

export type StrengthConfig = {
  readonly minLength: number;
  readonly requireDigit: boolean;
  readonly requireSymbol: boolean;
  readonly minCharacterClasses: number;
  readonly extraCommonPasswords: readonly string[];
};

export const DEFAULT_STRENGTH_CONFIG: StrengthConfig = {
  minLength: 12,
  requireDigit: true,
  requireSymbol: true,
  minCharacterClasses: 2,
  extraCommonPasswords: [],
};

function countCharacterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^a-zA-Z0-9]/.test(password)) classes++;
  return classes;
}

function hasCommonSubstring(
  password: string,
  extraCommon: readonly string[],
): boolean {
  const lower = password.toLowerCase();
  for (const sub of COMMON_SUBSTRINGS) {
    if (lower.includes(sub)) return true;
  }
  for (const sub of extraCommon) {
    if (lower.includes(sub.toLowerCase())) return true;
  }
  return false;
}

export function collectWeaknesses(
  password: string,
  config: StrengthConfig = DEFAULT_STRENGTH_CONFIG,
): readonly string[] {
  const reasons: string[] = [];

  if (password.length < config.minLength) {
    reasons.push(`length ${password.length} below minimum ${config.minLength}`);
  }

  const classes = countCharacterClasses(password);
  if (classes < config.minCharacterClasses) {
    reasons.push(
      `${classes} character class(es), minimum is ${config.minCharacterClasses}`,
    );
  }

  if (config.requireDigit && !/[0-9]/.test(password)) {
    reasons.push('missing digit');
  }

  if (config.requireSymbol && !/[^a-zA-Z0-9]/.test(password)) {
    reasons.push('missing symbol');
  }

  if (hasCommonSubstring(password, config.extraCommonPasswords)) {
    reasons.push('contains common password substring');
  }

  return reasons;
}

export function scorePassword(
  password: string,
  config: StrengthConfig = DEFAULT_STRENGTH_CONFIG,
): number {
  if (!password) return 0;

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= config.minLength) score++;

  const classes = countCharacterClasses(password);
  if (classes >= config.minCharacterClasses) score++;

  if (!hasCommonSubstring(password, config.extraCommonPasswords)) score++;

  const hasRequiredFailure =
    password.length < config.minLength ||
    classes < config.minCharacterClasses ||
    (config.requireDigit && !/[0-9]/.test(password)) ||
    (config.requireSymbol && !/[^a-zA-Z0-9]/.test(password));

  if (hasRequiredFailure) {
    score = Math.min(score, 2);
  }

  return Math.min(score, 4);
}

export function isWeak(
  password: string,
  config: StrengthConfig = DEFAULT_STRENGTH_CONFIG,
): boolean {
  return collectWeaknesses(password, config).length > 0;
}
