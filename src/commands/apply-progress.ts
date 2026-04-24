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
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
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
  const phases: ApplyProgress['phase'][] = ['create_folder', 'assign_folder', 'delete_item'];
  const lines: string[] = [];

  for (const phase of phases) {
    const t = timings[phase];
    if (t.count === 0) continue;
    const label = SUMMARY_LABELS[phase];
    const duration = formatDuration(t.durationMs);
    lines.push(`  ${label}: ${t.count} in ${duration}`);
  }

  const totalDuration = formatDuration(timings.totalDurationMs);
  const totalOps = timings.create_folder.count + timings.assign_folder.count + timings.delete_item.count;
  const failSuffix = totalFailed > 0 ? ` (${totalFailed} failed)` : '';
  lines.push(`  Total: ${totalOps} ops in ${totalDuration}${failSuffix}`);

  return lines.join('\n');
}
