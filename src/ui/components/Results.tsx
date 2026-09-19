import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { Button, Chip, ReticleMark } from './primitives';
import { listSessions } from '@/persistence/db';
import { downloadText, sessionsToCsv } from '../export';
import { cn } from '../cn';

/** Tier → chip tone + dot color. Apex tiers earn the pink. */
function tierStyle(tier: string): { tone: 'pink' | 'steel' | 'amber' | 'mute'; dot: string } {
  switch (tier) {
    case 'Grandmaster':
      return { tone: 'pink', dot: '#ff8fbf' };
    case 'Master':
      return { tone: 'pink', dot: '#f06ba1' };
    case 'Diamond':
      return { tone: 'steel', dot: '#7fb2ff' };
    case 'Platinum':
      return { tone: 'steel', dot: '#a9c6ff' };
    case 'Gold':
      return { tone: 'amber', dot: '#e3b95c' };
    case 'Silver':
      return { tone: 'mute', dot: '#9fb0cc' };
    default:
      return { tone: 'mute', dot: '#c08b5c' };
  }
}

function LedgerRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-linesoft py-3 last:border-0">
      <span className="font-mono text-xs uppercase tracking-wider text-faint">{label}</span>
      <span className="text-right">
        <span className="font-display text-lg font-semibold tnum">{value}</span>
        {sub && <span className="ml-2 font-mono text-xs text-mist">{sub}</span>}
      </span>
    </div>
  );
}

export function Results(): ReactElement {
  const { t } = useTranslation();
  const lastResult = useApp((s) => s.lastResult);
  const startScenario = useApp((s) => s.startScenario);
  const setView = useApp((s) => s.setView);
  const scenarioId = useApp((s) => s.scenarioId);

  if (!lastResult) {
    return (
      <div className="p-8">
        <p className="text-mist">No result yet.</p>
        <div className="mt-4">
          <Button onClick={() => setView('menu')}>{t('backToMenu')}</Button>
        </div>
      </div>
    );
  }
  const s = lastResult.session;
  const tier = tierStyle(s.tier);

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-8">
      <header className="rise flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ReticleMark size={30} />
          <div>
            <h1 className="font-display text-2xl font-bold uppercase leading-none tracking-tight">
              {t('results')}
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-faint">
              {s.scenarioId} · {s.startedAt.slice(0, 10)} · seed {s.seed.slice(-6)}
            </p>
          </div>
        </div>
        <Chip tone={tier.tone}>
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: tier.dot }}
          />
          {s.tier} · {s.percentile.toFixed(0)}%
        </Chip>
      </header>

      <section
        className="rise mt-6 rounded-card border border-linesoft bg-panel px-6 py-5"
        style={{ animationDelay: '60ms' }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-faint">
              {t('score')}
            </div>
            <div className="font-display text-7xl font-bold leading-none text-brand-soft tnum">
              {s.score}
            </div>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-faint">
                {t('accuracy')}
              </div>
              <div className="font-display text-2xl font-semibold tnum">
                {(s.accuracy * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-faint">Pace</div>
              <div className="font-display text-2xl font-semibold tnum">
                {s.killsPerSec.toFixed(2)}
                <span className="text-sm text-faint">/s</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 border-t border-linesoft pt-2">
          <LedgerRow
            label={`${t('reaction')} — median`}
            value={`${s.reactionMedian.toFixed(0)}ms`}
            sub={`mean ${s.reactionMean.toFixed(0)} · p95 ${s.reactionP95.toFixed(0)} · sd ${s.reactionSd.toFixed(0)}`}
          />
          <LedgerRow
            label="Flick bias"
            value={`▲ ${(s.overshootRatio * 100).toFixed(0)}%  ▼ ${(s.undershootRatio * 100).toFixed(0)}%`}
            sub="over · under"
          />
          <LedgerRow
            label="Shots"
            value={`${String(s.hits)}/${String(s.shots)}`}
            sub={
              s.timeOnTargetPct != null
                ? `ToT ${s.timeOnTargetPct.toFixed(1)}% · RMS ${(s.rmsErrorDeg ?? 0).toFixed(2)}°`
                : undefined
            }
          />
        </div>
      </section>

      <h2
        className="rise mt-8 font-display text-lg font-semibold uppercase tracking-tight"
        style={{ animationDelay: '120ms' }}
      >
        Findings + next drills
      </h2>
      <ol className="mt-3 flex flex-col gap-2">
        {lastResult.insights.length === 0 && (
          <p className="rise text-sm text-mist" style={{ animationDelay: '140ms' }}>
            Clean run — no systematic weakness detected.
          </p>
        )}
        {lastResult.insights.map((finding, i) => (
          <li
            key={finding.id}
            className="rise rounded-card border border-linesoft bg-panel p-4"
            style={{ animationDelay: `${String(140 + i * 60)}ms` }}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  finding.severity === 'critical' && 'bg-danger',
                  finding.severity === 'warning' && 'bg-warn',
                  finding.severity === 'info' && 'bg-steel',
                )}
              />
              <span className="font-mono text-[11px] uppercase tracking-wider text-faint">
                {String(i + 1).padStart(2, '0')} · {finding.severity}
              </span>
            </div>
            <div className="mt-1 font-display font-semibold">{finding.title}</div>
            <p className="mt-0.5 text-sm text-mist">{finding.detail}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap gap-2">
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
