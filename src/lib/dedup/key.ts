import { getDomain } from 'tldts';

export function normalizeDomain(uri: string | null | undefined): string {
  if (!uri) return '';

  if (uri.startsWith('android://') || uri.startsWith('ios://')) {
    return uri.toLowerCase();
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return uri.toLowerCase();
  }

  const hostname = parsed.hostname.toLowerCase();
  return hostname;
}

export function stripWww(hostname: string): string {
  if (hostname.startsWith('www.')) {
    return hostname.slice(4);
  }
  return hostname;
}

export function registrableDomain(hostname: string): string {
  if (!hostname) return '';

  const domain = getDomain(hostname, { allowPrivateDomains: false });
  if (domain) return domain.toLowerCase();

  return hostname.toLowerCase();
}

export function dedupKey(
  uri: string | null | undefined,
  username: string | null | undefined,
  options: {
    readonly treatWwwAsSameDomain: boolean;
    readonly caseInsensitiveUsernames: boolean;
  },
): string {
  let domain = normalizeDomain(uri);

  if (options.treatWwwAsSameDomain) {
    domain = stripWww(domain);
  }

  let user = username ?? '';
  if (options.caseInsensitiveUsernames) {
    user = user.toLowerCase();
  }

  return `${domain}:${user}`;
}
