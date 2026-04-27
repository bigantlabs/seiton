import type { ApplyProgress, ApplyTimings } from './apply.js';

const PHASE_LABELS: Record<ApplyProgress['phase'], string> = {
  create_folder: 'Creating folder',
  assign_folder: 'Assigning folder',
  delete_item: 'Deleting item',
};

const SUMMARY_LABELS: Record<ApplyProgress['phase'], string> = {
  create_folder: 'Created folders',
  assign_folder: 'Assigned folders',
  delete_item: 'Deleted items',
};

const MAX_DESC_LENGTH = 30;

function truncate(text: string, maxLen: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxLen) return text;
  return chars.slice(0, maxLen - 1).join('') + '…';
}

function formatDuration(ms: number): string {
  if (Math.round(ms) < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatProgressMessage(progress: ApplyProgress): string {
  const label = PHASE_LABELS[progress.phase];
  const counter = `${progress.current}/${progress.phaseTotal}`;
  const desc = truncate(progress.description, MAX_DESC_LENGTH);
  const failTag = progress.failedSoFar > 0
    ? ` [${progress.failedSoFar} failed]`
    : '';
  return `${label} ${counter} — ${desc}${failTag}`;
}

export function formatApplySummary(timings: ApplyTimings, totalFailed: number): string {
  const phases = Object.keys(PHASE_LABELS) as ApplyProgress['phase'][];
  const lines: string[] = [];

  for (const phase of phases) {
    const t = timings[phase];
    if (t.count === 0) continue;
    const label = SUMMARY_LABELS[phase];
    const duration = formatDuration(t.durationMs);
    const countStr = t.succeeded < t.count
      ? `${t.succeeded}/${t.count}`
      : `${t.count}`;
    lines.push(`  ${label}: ${countStr} in ${duration}`);
  }

  if (timings.cacheHits > 0 || timings.cacheMisses > 0) {
    lines.push(`  Cache: ${timings.cacheHits} hits, ${timings.cacheMisses} misses`);
  }

  const totalDuration = formatDuration(timings.totalDurationMs);
  const totalOps = timings.create_folder.count + timings.assign_folder.count + timings.delete_item.count;
  const failSuffix = totalFailed > 0 ? ` (${totalFailed} failed)` : '';
  const opsWord = totalOps === 1 ? 'op' : 'ops';
  lines.push(`  Total: ${totalOps} ${opsWord} in ${totalDuration}${failSuffix}`);

  return lines.join('\n');
}
