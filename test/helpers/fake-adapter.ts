import type { BwAdapter, BwResult } from '../../src/lib/bw.js';
import type { BwItem, BwFolder } from '../../src/lib/domain/types.js';

const DEFAULT_ITEM: BwItem = {
  id: 'default-item', organizationId: null, folderId: null, type: 1 as const,
  name: 'Test Item', notes: null, favorite: false,
  login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'pass', totp: null },
  revisionDate: '2024-01-01T00:00:00.000Z',
};

export function makeFakeAdapter(overrides: Partial<BwAdapter> = {}): BwAdapter {
  return {
    getVersion: async () => ({ ok: true, data: '2024.6.0' }) as BwResult<string>,
    getStatus: async () => ({ ok: true, data: { status: 'unlocked' } }) as BwResult<{ status: string }>,
    getItem: async (_session, itemId) => ({
      ok: true,
      data: { ...DEFAULT_ITEM, id: itemId },
    }),
    listItems: async () => ({ ok: true, data: [DEFAULT_ITEM] }) as BwResult<BwItem[]>,
    listFolders: async () => ({ ok: true, data: [] }) as BwResult<BwFolder[]>,
    editItem: async () => ({ ok: true, data: undefined }) as BwResult<void>,
    deleteItem: async () => ({ ok: true, data: undefined }) as BwResult<void>,
    createFolder: async () => ({ ok: true, data: 'new-id' }) as BwResult<string>,
    sync: async () => ({ ok: true, data: undefined }) as BwResult<void>,
    ...overrides,
  };
}
