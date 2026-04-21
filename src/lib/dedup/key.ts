import { getDomain } from 'tldts';

export function normalizeDomain(uri: string | null | undefined): string {
  if (!uri) return '';

  if (uri.startsWith('android://') || uri.startsWith('ios://')) {
    return uri.toLowerCase();
  }

  try {
    return new URL(uri).hostname.toLowerCase();
  } catch (_err: unknown) {
    try {
      return new URL(`http://${uri}`).hostname.toLowerCase();
    } catch (_innerErr: unknown) {
      return uri.toLowerCase();
    }
  }
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
  // Exact-host matching by design: different subdomains often host different
  // services with separate credentials (mail.google.com vs accounts.google.com).
  // registrableDomain is exported for callers that want eTLD+1 grouping elsewhere.
  const domain = normalizeForDedup(uri, options.treatWwwAsSameDomain);

  let user = username ?? '';
  if (options.caseInsensitiveUsernames) {
    user = user.toLowerCase();
  }

  return `${domain}:${user}`;
}

export function dedupKeyMulti(
  uris: readonly string[],
  username: string | null | undefined,
  options: {
    readonly treatWwwAsSameDomain: boolean;
    readonly caseInsensitiveUsernames: boolean;
  },
): string {
  const domains = uris
    .map((u) => normalizeForDedup(u, options.treatWwwAsSameDomain))
    .filter(Boolean)
    .sort()
    .join(',');

  let user = username ?? '';
  if (options.caseInsensitiveUsernames) {
    user = user.toLowerCase();
  }

  return `${domains}:${user}`;
}

function normalizeForDedup(uri: string | null | undefined, stripWwwPrefix: boolean): string {
  let domain = normalizeDomain(uri);
  if (stripWwwPrefix) {
    domain = stripWww(domain);
  }
  return domain;
}
