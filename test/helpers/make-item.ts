import { ItemType, type BwItem } from '../../src/lib/domain/types.js';

export function makeItem(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: 'test-id',
    organizationId: null,
    folderId: null,
    type: ItemType.LOGIN,
    name: 'Test Item',
    notes: null,
    favorite: false,
    login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'pass', totp: null },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
