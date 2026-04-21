export const ExitCode = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INTERNAL_ERROR: 2,
  MALFORMED_BW_OUTPUT: 3,
  USAGE: 64,
  UNAVAILABLE: 69,
  CANT_CREATE: 73,
  NO_PERMISSION: 77,
  USER_INTERRUPT: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
