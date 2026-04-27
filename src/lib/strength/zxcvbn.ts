import zxcvbnDefault from 'zxcvbn-ts';
import type { ZxcvbnResult } from 'zxcvbn-ts';

type ZxcvbnFn = (
  password: string,
  userInputs?: (string | number | boolean)[],
) => ZxcvbnResult;

// CJS/ESM interop: tsx wraps the CJS module so the function lives
// at .zxcvbn rather than being the default export directly.
const zxcvbn: ZxcvbnFn =
  typeof zxcvbnDefault === 'function'
    ? zxcvbnDefault
    : ((zxcvbnDefault as Record<string, unknown>).zxcvbn as ZxcvbnFn);

import type { ZxcvbnScoreResult } from './types.js';

export type { ZxcvbnScoreResult } from './types.js';

export function zxcvbnScore(
  password: string,
  userDictionary: readonly string[],
): ZxcvbnScoreResult {
  const result = zxcvbn(password, [...userDictionary]);

  const feedback: string[] = [];
  if (result.feedback.warning) {
    feedback.push(result.feedback.warning);
  }
  for (const suggestion of result.feedback.suggestions) {
    feedback.push(suggestion);
  }

  return { score: result.score, feedback };
}
