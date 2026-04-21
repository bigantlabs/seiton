#!/usr/bin/env node
/**
 * Stand-in binary for `bw` in integration tests.
 * Reads FAKE_BW_SCENARIO env var and emits canned output.
 */

const scenario = process.env['FAKE_BW_SCENARIO'] ?? 'default';
const args = process.argv.slice(2);

if (args[0] === '--version') {
  if (scenario === 'version-error') {
    process.stderr.write('bw: error fetching version\n');
    process.exit(1);
  }
  process.stdout.write('2024.6.0\n');
  process.exit(0);
}

if (args[0] === 'status') {
  if (scenario === 'locked') {
    process.stdout.write(JSON.stringify({ status: 'locked', userEmail: 'user@example.com' }) + '\n');
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ status: 'unlocked', userEmail: 'user@example.com' }) + '\n');
  process.exit(0);
}

if (args[0] === 'list' && args[1] === 'items') {
  if (scenario === 'empty-vault') {
    process.stdout.write('[]\n');
    process.exit(0);
  }
  if (scenario === 'items-error') {
    process.stderr.write('bw: vault access failed\n');
    process.exit(1);
  }
  const items = [
    {
      id: 'item-1', organizationId: null, folderId: null, type: 1,
      name: 'Example Login', notes: null, favorite: false,
      login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'weak', totp: null },
      revisionDate: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'item-2', organizationId: null, folderId: null, type: 1,
      name: 'Another Login', notes: null, favorite: false,
      login: { uris: [{ match: null, uri: 'https://another.com' }], username: 'user2', password: '', totp: null },
      revisionDate: '2024-01-02T00:00:00.000Z',
    },
  ];
  process.stdout.write(JSON.stringify(items) + '\n');
  process.exit(0);
}

if (args[0] === 'list' && args[1] === 'folders') {
  process.stdout.write(JSON.stringify([{ id: 'folder-1', name: 'Existing' }]) + '\n');
  process.exit(0);
}

if (args[0] === 'get' && args[1] === 'item') {
  const itemId = args[2];
  const items: Record<string, object> = {
    'item-1': {
      id: 'item-1', organizationId: null, folderId: null, type: 1,
      name: 'Example Login', notes: null, favorite: false,
      login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'weak', totp: null },
      revisionDate: '2024-01-01T00:00:00.000Z',
    },
    'item-2': {
      id: 'item-2', organizationId: null, folderId: null, type: 1,
      name: 'Another Login', notes: null, favorite: false,
      login: { uris: [{ match: null, uri: 'https://another.com' }], username: 'user2', password: '', totp: null },
      revisionDate: '2024-01-02T00:00:00.000Z',
    },
  };
  const item = items[itemId ?? ''];
  if (item) {
    process.stdout.write(JSON.stringify(item) + '\n');
    process.exit(0);
  }
  process.stderr.write(`bw: item not found: ${itemId}\n`);
  process.exit(1);
}

if (args[0] === 'edit' && args[1] === 'item') {
  if (scenario === 'apply-partial-failure' && args[2] === 'item-2') {
    process.stderr.write('bw: edit failed\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ id: args[2], success: true }) + '\n');
  process.exit(0);
}

if (args[0] === 'delete' && args[1] === 'item') {
  if (scenario === 'apply-partial-failure' && args[2] === 'item-2') {
    process.stderr.write('bw: delete failed\n');
    process.exit(1);
  }
  process.stdout.write('Item deleted\n');
  process.exit(0);
}

if (args[0] === 'create' && args[1] === 'folder') {
  process.stdout.write(JSON.stringify({ id: 'new-folder-id', name: 'Created' }) + '\n');
  process.exit(0);
}

if (args[0] === 'sync') {
  if (scenario === 'sync-failure') {
    process.stderr.write('bw: sync failed\n');
    process.exit(1);
  }
  process.stdout.write('Syncing complete.\n');
  process.exit(0);
}

process.stderr.write(`fake-bw: unhandled command: ${args.join(' ')}\n`);
process.exit(1);
