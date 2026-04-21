#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { registerCleanup, installSignalHandlers } from '../../src/core/signals.js';
import { makePendingQueue } from '../../src/lib/domain/pending.js';
import type { PendingOp } from '../../src/lib/domain/pending.js';

const pendingPath = process.argv[2];
if (!pendingPath) {
  process.stderr.write('Usage: audit-sigint-child.ts <pending-path>\n');
  process.exit(1);
}

const ops: PendingOp[] = [
  { kind: 'create_folder', folderName: 'TestFolder' },
  { kind: 'assign_folder', itemId: 'item-1', folderId: null, folderName: 'TestFolder' },
  { kind: 'delete_item', itemId: 'item-2' },
];

registerCleanup(async () => {
  mkdirSync(dirname(pendingPath), { recursive: true });
  const queue = makePendingQueue(ops, '2024-06-01T00:00:00.000Z');
  writeFileSync(pendingPath, JSON.stringify(queue, null, 2) + '\n', { mode: 0o600 });
});

installSignalHandlers();

process.stdout.write('READY\n');

setInterval(() => {}, 60_000);
