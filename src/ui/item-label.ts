import type { BwItem } from '../lib/domain/types.js';

export function itemLabel(item: BwItem): string {
  const uri = item.login?.uris?.[0]?.uri;
  const user = item.login?.username;
  let label = item.name;
  if (uri) label += ` (${uri})`;
  if (user) label += ` [${user}]`;
  return label;
}
