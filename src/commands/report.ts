import type { Config } from '../config/schema.js';
import type { BwAdapter } from '../lib/bw.js';
import type { Logger } from '../adapters/logging.js';
import type { Finding } from '../lib/domain/finding.js';
import { analyzeItems } from '../lib/analyze/index.js';
import { redactItem } from '../lib/analyze/redact.js';

export type ReportResult =
  | { ok: true; findings: readonly Finding[]; itemCount: number; folderCount: number }
  | { ok: false; code: 'PREFLIGHT_FAILED' | 'FETCH_FAILED'; message: string };

export interface ReportOptions {
  config: Config;
  session: string;
  bw: BwAdapter;
  logger?: Logger;
  skipCategories?: readonly string[];
  limitPerCategory?: number | null;
}

export async function runReport(opts: ReportOptions): Promise<ReportResult> {
  const { config, session, bw, logger, skipCategories = [], limitPerCategory = null } = opts;

  logger?.info('report: fetching vault');
  const [itemsResult, foldersResult] = await Promise.all([
    bw.listItems(session),
    bw.listFolders(session),
  ]);

  if (!itemsResult.ok) {
    return { ok: false, code: 'FETCH_FAILED', message: `Failed to fetch items: ${itemsResult.error.message}` };
  }
  if (!foldersResult.ok) {
    return { ok: false, code: 'FETCH_FAILED', message: `Failed to fetch folders: ${foldersResult.error.message}` };
  }

  logger?.info('report: analyzing', { items: itemsResult.data.length });
  const allFindings = analyzeItems(itemsResult.data, {
    strength: config.strength,
    dedup: config.dedup,
    folders: config.folders,
  });

  const findings = filterFindings(allFindings, skipCategories, limitPerCategory);

  return {
    ok: true,
    findings,
    itemCount: itemsResult.data.length,
    folderCount: foldersResult.data.length,
  };
}

function filterFindings(
  findings: readonly Finding[],
  skipCategories: readonly string[],
  limitPerCategory: number | null,
): readonly Finding[] {
  const skipSet = new Set(skipCategories);
  const filtered = findings.filter((f) => !skipSet.has(f.category));

  if (limitPerCategory === null) return filtered;

  const counts = new Map<string, number>();
  return filtered.filter((f) => {
    const count = counts.get(f.category) ?? 0;
    if (count >= limitPerCategory) return false;
    counts.set(f.category, count + 1);
    return true;
  });
}

export function formatFindingsText(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No findings. Vault looks clean.\n';

  const lines: string[] = [];
  lines.push(`Found ${findings.length} finding(s):\n`);

  for (const f of findings) {
    switch (f.category) {
      case 'duplicates':
        lines.push(`[duplicates] ${f.items.length} items share key "${f.key}"`);
        for (const item of f.items) {
          lines.push(`  - ${item.name} (${item.id})`);
        }
        break;
      case 'reuse':
        lines.push(`[reuse] ${f.items.length} items share the same password`);
        for (const item of f.items) {
          lines.push(`  - ${item.name} (${item.id})`);
        }
        break;
      case 'weak':
        lines.push(`[weak] ${f.item.name} (score ${f.score}/4): ${f.reasons.join(', ')}`);
        break;
      case 'missing':
        lines.push(`[missing] ${f.item.name}: missing ${f.missingFields.join(', ')}`);
        break;
      case 'folders':
        lines.push(`[folders] ${f.item.name} → suggested "${f.suggestedFolder}"`);
        break;
    }
  }

  return lines.join('\n') + '\n';
}

export function formatFindingsJson(
  findings: readonly Finding[],
  maskChar: string,
  itemCount: number,
  folderCount: number,
): string {
  const report = {
    version: 1,
    summary: {
      totalItems: itemCount,
      totalFolders: folderCount,
      totalFindings: findings.length,
    },
    findings: findings.map((f) => formatOneFindingJson(f, maskChar)),
  };
  return JSON.stringify(report, null, 2) + '\n';
}

function formatOneFindingJson(finding: Finding, maskChar: string): Record<string, unknown> {
  switch (finding.category) {
    case 'duplicates':
      return {
        category: 'duplicates',
        key: finding.key,
        items: finding.items.map((i) => redactItem(i, maskChar)),
      };
    case 'reuse':
      return {
        category: 'reuse',
        items: finding.items.map((i) => redactItem(i, maskChar)),
      };
    case 'weak':
      return {
        category: 'weak',
        item: redactItem(finding.item, maskChar),
        score: finding.score,
        reasons: [...finding.reasons],
      };
    case 'missing':
      return {
        category: 'missing',
        item: redactItem(finding.item, maskChar),
        missingFields: [...finding.missingFields],
      };
    case 'folders':
      return {
        category: 'folders',
        item: redactItem(finding.item, maskChar),
        suggestedFolder: finding.suggestedFolder,
      };
  }
}
