import type { FolderFinding } from '../lib/domain/finding.js';

export type EntryDecision = 'pending' | 'accept' | 'skip' | 'delete';

export interface FolderPageEntry {
  readonly finding: FolderFinding;
  decision: EntryDecision;
}

export interface FolderPageState {
  readonly entries: FolderPageEntry[];
  cursor: number;
  scrollOffset: number;
  readonly pageSize: number;
}

const DEFAULT_PAGE_SIZE = 15;

export function createPageState(
  findings: readonly FolderFinding[],
  pageSize: number = DEFAULT_PAGE_SIZE,
): FolderPageState {
  return {
    entries: findings.map(finding => ({ finding, decision: 'pending' })),
    cursor: 0,
    scrollOffset: 0,
    pageSize,
  };
}

export function moveCursor(state: FolderPageState, delta: number): FolderPageState {
  const maxCursor = Math.max(0, state.entries.length - 1);
  const newCursor = Math.max(0, Math.min(maxCursor, state.cursor + delta));

  let newOffset = state.scrollOffset;
  if (newCursor < newOffset) {
    newOffset = newCursor;
  } else if (newCursor >= newOffset + state.pageSize) {
    newOffset = newCursor - state.pageSize + 1;
  }

  return { ...state, cursor: newCursor, scrollOffset: newOffset };
}

export function setDecision(state: FolderPageState, decision: EntryDecision): FolderPageState {
  const entries = state.entries.map((entry, i) =>
    i === state.cursor ? { ...entry, decision } : entry,
  );
  return { ...state, entries };
}

export function allDecided(state: FolderPageState): boolean {
  return state.entries.every(e => e.decision !== 'pending');
}

export interface VisibleWindow {
  entries: FolderPageEntry[];
  startIndex: number;
  endIndex: number;
}

export function visibleWindow(state: FolderPageState): VisibleWindow {
  const start = state.scrollOffset;
  const end = Math.min(start + state.pageSize, state.entries.length);
  return {
    entries: state.entries.slice(start, end),
    startIndex: start,
    endIndex: end,
  };
}
