import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { Button, Card } from './primitives';
import { listSessions } from '@/persistence/db';
import { downloadText, sessionsToCsv } from '../export';

export function Results(): ReactElement {
  const { t } = useTranslation();
  const lastResult = useApp((s) => s.lastResult);
  const startScenario = useApp((s) => s.startScenario);
  const setView = useApp((s) => s.setView);
  const scenarioId = useApp((s) => s.scenarioId);

  if (!lastResult) {
    return (
      <div className="p-8">
        <p>No result yet.</p>
        <Button onClick={() => setView('menu')}>{t('backToMenu')}</Button>
      </div>
    );
  }
  const s = lastResult.session;
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('results')}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs opacity-60">{t('score')}</div>
          <div className="text-3xl font-extrabold text-cyan-300">{s.score}</div>
          <div className="text-xs">
            {t('tier')}: {s.tier} ({s.percentile.toFixed(1)}%)
          </div>
        </Card>
        <Card>
          <div className="text-xs opacity-60">{t('accuracy')}</div>
          <div className="text-3xl font-extrabold">{(s.accuracy * 100).toFixed(1)}%</div>
          <div className="text-xs">
            {s.hits}/{s.shots} · {s.killsPerSec.toFixed(2)} kills/s
          </div>
        </Card>
        <Card>
          <div className="text-xs opacity-60">{t('reaction')} (med/p95)</div>
          <div className="text-3xl font-extrabold">{s.reactionMedian.toFixed(0)}ms</div>
          <div className="text-xs">
            mean {s.reactionMean.toFixed(0)} · p95 {s.reactionP95.toFixed(0)} · sd{' '}
            {s.reactionSd.toFixed(0)}
          </div>
        </Card>
        <Card>
          <div className="text-xs opacity-60">Flick / Tracking</div>
          <div className="text-sm">
            over {(s.overshootRatio * 100).toFixed(0)}% · under{' '}
            {(s.undershootRatio * 100).toFixed(0)}%
          </div>
          <div className="text-sm">
            {s.timeOnTargetPct != null
              ? `ToT ${s.timeOnTargetPct.toFixed(1)}% · RMS ${(s.rmsErrorDeg ?? 0).toFixed(2)}°`
              : '—'}
          </div>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 font-bold">Weaknesses + training plan</h2>
      <div className="flex flex-col gap-2">
        {lastResult.insights.length === 0 && (
          <p className="text-sm opacity-70">Clean run — no systematic weakness detected.</p>
        )}
        {lastResult.insights.map((i) => (
          <Card key={i.id}>
            <div className="font-semibold">
              [{i.severity}] {i.title}
            </div>
            <p className="text-sm opacity-80">{i.detail}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => startScenario(scenarioId)}>{t('playAgain')}</Button>
        <Button variant="ghost" onClick={() => setView('menu')}>
          {t('backToMenu')}
        </Button>
        <Button variant="ghost" onClick={() => setView('dashboard')}>
          {t('dashboard')}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            downloadText(`session-${s.seed}.json`, JSON.stringify(s, null, 2), 'application/json')
          }
        >
          {t('exportJson')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void (async (): Promise<void> => {
              const rows = await listSessions(200);
              downloadText('sessions.csv', sessionsToCsv(rows), 'text/csv');
            })();
          }}
        >
          {t('exportCsv')}
        </Button>
      </div>
    </div>
  );
}
