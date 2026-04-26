import type { FolderPageState, FolderPageEntry, EntryDecision } from './folder-page-model.js';
import { visibleWindow, allDecided } from './folder-page-model.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const INVERSE = '\x1b[7m';

function decisionBadge(decision: EntryDecision): string {
  switch (decision) {
    case 'accept': return `${GREEN}[v]${RESET}`;
    case 'skip': return `${DIM}[-]${RESET}`;
    case 'delete': return `${RED}[x]${RESET}`;
    case 'pending': return `${DIM}[ ]${RESET}`;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function extractHostname(entry: FolderPageEntry): string {
  const uri = entry.finding.item.login?.uris?.[0]?.uri;
  if (!uri) return '';
  try {
    return new URL(uri).hostname;
  } catch (_e: unknown) {
    // Malformed URI in display context — intentional, never log user data here
    return '';
  }
}

function formatRow(
  entry: FolderPageEntry,
  index: number,
  cursorIndex: number,
): string {
  const isCurrent = index === cursorIndex;
  const cursor = isCurrent ? `${INVERSE}>` : ' ';
  const name = truncate(entry.finding.item.name, 30);
  const host = truncate(extractHostname(entry), 20);
  const folder = truncate(entry.finding.suggestedFolder, 18);
  const badge = decisionBadge(entry.decision);
  const suffix = isCurrent ? RESET : '';
  return `${cursor} ${name.padEnd(30)} ${host.padEnd(20)} ${folder.padEnd(18)} ${badge}${suffix}`;
}

export function renderPage(state: FolderPageState): string {
  const lines: string[] = [];
  const total = state.entries.length;

  lines.push(`${BOLD}${CYAN}── Folder Suggestions (${total} items) ──${RESET}`);
  lines.push('');

  const win = visibleWindow(state);
  for (let i = 0; i < win.entries.length; i++) {
    const globalIndex = win.startIndex + i;
    lines.push(formatRow(win.entries[i]!, globalIndex, state.cursor));
  }

  lines.push('');

  if (total > state.pageSize) {
    lines.push(`${DIM}Showing ${win.startIndex + 1}-${win.endIndex} of ${total}${RESET}`);
  }

  if (allDecided(state)) {
    lines.push(`${GREEN}All entries reviewed — press Enter to submit${RESET}`);
  }

  lines.push(
    `${DIM}↑/↓ navigate | a accept | s skip | d delete | Enter submit | q cancel${RESET}`,
  );

  return lines.join('\n');
}

