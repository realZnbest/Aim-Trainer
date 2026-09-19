/**
 * CSV / JSON export of session history. Pure functions (testable without DOM).
 * @module ui/export
 */
import type { SessionRecord } from '@/persistence/db';

const COLS = [
  'id',
  'scenarioId',
  'mode',
  'seed',
  'startedAt',
  'durationSec',
  'score',
  'accuracy',
  'kills',
  'shots',
  'hits',
  'killsPerSec',
  'reactionMean',
  'reactionMedian',
  'reactionP95',
  'reactionSd',
  'overshootRatio',
  'undershootRatio',
  'timeOnTargetPct',
  'rmsErrorDeg',
  'tier',
  'percentile',
] as const;

export function sessionsToCsv(rows: SessionRecord[]): string {
  const esc = (v: unknown): string => {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLS.join(',')];
  for (const r of rows) {
    lines.push(COLS.map((c) => esc(r[c as keyof SessionRecord])).join(','));
  }
  return lines.join('\n');
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
