import type { Config } from '../config/schema.js';
import type { BwAdapter } from '../lib/bw.js';
import type { Logger } from '../adapters/logging.js';
import type { Finding, FindingCategory } from '../lib/domain/finding.js';
import { FINDING_CATEGORIES } from '../lib/domain/finding.js';
import { analyzeItems } from '../lib/analyze/index.js';
import { redactItem } from '../lib/analyze/redact.js';
import { REPORT_SCHEMA_VERSION } from '../report/schema.js';

export type ReportResult =
  | { ok: true; findings: readonly Finding[]; itemCount: number; folderCount: number }
  | { ok: false; code: 'FETCH_FAILED'; message: string };

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
  }, foldersResult.data);

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

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  duplicates: 'Duplicates',
  reuse: 'Reused Passwords',
  weak: 'Weak Passwords',
  missing: 'Missing Fields',
  folders: 'Folder Suggestions',
  near_duplicates: 'Near-Duplicate Names',
};

export function formatFindingsText(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No findings. Vault looks clean.\n';

  const lines: string[] = [];
  lines.push(`Found ${findings.length} finding(s):\n`);

  for (const category of FINDING_CATEGORIES) {
    const group = findings.filter(f => f.category === category);
    if (group.length === 0) continue;

    lines.push(`── ${CATEGORY_LABELS[category]} (${group.length}) ──`);
    for (const f of group) {
      switch (f.category) {
        case 'duplicates':
          lines.push(`  ${f.items.length} items share key "${f.key}"`);
          for (const item of f.items) {
            lines.push(`    - ${item.name} (${item.id})`);
          }
          break;
        case 'reuse':
          lines.push(`  ${f.items.length} items share the same password`);
          for (const item of f.items) {
            lines.push(`    - ${item.name} (${item.id})`);
          }
          break;
        case 'weak':
          lines.push(`  ${f.item.name} (score ${f.score}/4): ${f.reasons.join(', ')}`);
          break;
        case 'missing':
          lines.push(`  ${f.item.name}: missing ${f.missingFields.join(', ')}`);
          break;
        case 'folders':
          lines.push(`  ${f.item.name} → suggested "${f.suggestedFolder}"`);
          break;
        case 'near_duplicates':
          lines.push(`  Similar names (distance ${f.maxDistance}): ${f.items.map(i => i.name).join(', ')}`);
          break;
      }
    }
    lines.push('');
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
    version: REPORT_SCHEMA_VERSION,
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
    case 'near_duplicates':
      return {
        category: 'near_duplicates',
        items: finding.items.map((i) => redactItem(i, maskChar)),
        maxDistance: finding.maxDistance,
      };
  }
}
