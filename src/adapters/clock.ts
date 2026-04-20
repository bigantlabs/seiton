export interface Clock {
  now(): Date;
  isoNow(): string;
}

export function createSystemClock(): Clock {
  return {
    now(): Date {
      return new Date();
    },
    isoNow(): string {
      return new Date().toISOString();
    },
  };
}

export function createFixedClock(fixed: Date): Clock {
  const timestamp = fixed.getTime();
  const iso = fixed.toISOString();
  return {
    now(): Date {
      return new Date(timestamp);
    },
    isoNow(): string {
      return iso;
    },
  };
}
