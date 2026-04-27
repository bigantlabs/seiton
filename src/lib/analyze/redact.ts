import type { BwItem } from '../domain/types.js';
import type { RedactedItem } from './types.js';

export type { RedactedItem } from './types.js';

const REDACTED = '[REDACTED]';
const MASKED_DEFAULT = '\u2022';

export function maskPassword(
  password: string | null | undefined,
  maskChar: string = MASKED_DEFAULT,
): string {
  if (password === null || password === undefined) return '';
  if (password === '') return '<empty>';
  return maskChar.repeat(8);
}

export function redactTotp(
  totp: string | null | undefined,
): string {
  if (!totp) return '';
  return REDACTED;
}

export function redactNotes(
  _notes: string | null | undefined,
): string {
  return REDACTED;
}

export function stripUriCredentials(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (!parsed.username && !parsed.password) return uri;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch (_err: unknown) {
    return uri;
  }
}

export function redactItem(
  item: BwItem,
  maskChar: string = MASKED_DEFAULT,
): RedactedItem {
  const login = item.login
    ? {
        username: item.login.username ?? null,
        uris: (item.login.uris ?? [])
          .map((u) => u.uri)
          .filter((u): u is string => u !== null)
          .map(stripUriCredentials),
        password: maskPassword(item.login.password, maskChar),
        totp: redactTotp(item.login.totp),
      }
    : null;

  return {
    id: item.id,
    name: item.name,
    type: item.type,
    folderId: item.folderId,
    login,
    revisionDate: item.revisionDate,
  };
}

export function redactItems(
  items: readonly BwItem[],
  maskChar: string = MASKED_DEFAULT,
): readonly RedactedItem[] {
  return items.map((item) => redactItem(item, maskChar));
}
