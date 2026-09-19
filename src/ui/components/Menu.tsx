import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';
import { Button, Chip, Meter, ReticleMark } from './primitives';

/** Drill dossier metadata: focus + difficulty are authored coaching facts. */
const DOSSIER: Record<string, { focus: string; difficulty: number }> = {
  gridshot: { focus: 'SPEED', difficulty: 2 },
  spidershot: { focus: 'REACTION', difficulty: 2 },
  microshot: { focus: 'PRECISION', difficulty: 4 },
  'tracking-motion': { focus: 'TRACKING', difficulty: 3 },
  switching: { focus: 'FLICK', difficulty: 3 },
  'reflex-reactive': { focus: 'REACTION', difficulty: 3 },
  'strafe-track': { focus: 'TRACKING', difficulty: 5 },
  'target-switching-speed': { focus: 'SPEED', difficulty: 4 },
  sandbox: { focus: 'FREESTYLE', difficulty: 1 },
};

/** Range ruler: distance ticks, the sport's own measuring tool. */
function RangeRuler(): ReactElement {
  const labels = ['5M', '10M', '15M', '20M', '25M', '30M'];
  return (
    <div aria-hidden className="flex select-none">
      {labels.map((d) => (
        <div key={d} className="flex-1">
          <div className="flex items-end">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={
                  i === 0
                    ? 'h-5 w-px bg-steel/60'
                    : i === 5
                      ? 'h-3 w-px bg-line'
                      : 'h-1.5 w-px bg-linesoft'
                }
                style={{ marginRight: 7 }}
              />
            ))}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">{d}</div>
        </div>
      ))}
    </div>
  );
}

export function Menu(): ReactElement {
  const { t, i18n } = useTranslation();
  const startScenario = useApp((s) => s.startScenario);
  const setView = useApp((s) => s.setView);
  const language = useApp((s) => s.language);
  const setLanguage = useApp((s) => s.setLanguage);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ReticleMark size={36} />
          <div>
            <h1 className="font-display text-2xl font-bold uppercase leading-none tracking-tight">
              {t('appName')}
            </h1>
            <p className="mt-1 text-[13px] text-mist">
              Low-latency input · deterministic sim · actionable analytics
            </p>
          </div>
        </div>
        <nav className="flex gap-2" aria-label="primary">
          <Button
            variant="ghost"
            ariaLabel="switch language"
            onClick={() => {
              const next = language === 'en' ? 'th' : 'en';
              setLanguage(next);
              void i18n.changeLanguage(next);
            }}
          >
            {language === 'en' ? 'TH' : 'EN'}
          </Button>
          <Button variant="ghost" onClick={() => setView('dashboard')} ariaLabel="dashboard">
            {t('dashboard')}
          </Button>
          <Button variant="ghost" onClick={() => setView('settings')} ariaLabel="settings">
            {t('settings')}
          </Button>
        </nav>
      </header>

      <div className="mt-8 border-y border-linesoft py-4">
        <RangeRuler />
      </div>

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold uppercase tracking-tight">
          {t('scenarios')}
        </h2>
        <span className="font-mono text-xs text-faint tnum">
          {BUILT_IN_SCENARIOS.length} DRILLS
        </span>
      </div>

      <ol className="mt-3 divide-y divide-linesoft border-y border-linesoft">
        {BUILT_IN_SCENARIOS.map((s) => {
          const d = DOSSIER[s.id] ?? { focus: 'FREESTYLE', difficulty: 1 };
          return (
            <li key={s.id}>
              <div className="drill-row group flex items-center gap-4 py-4 pl-4 pr-2 transition-colors hover:bg-raised/60 sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-semibold">{s.title}</span>
                    <Chip tone="steel">{d.focus}</Chip>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-mist">{s.description}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-faint tnum">
                    {s.durationSec}s · {s.targetCount} tgt · {s.movementProfile}
                  </p>
                </div>
                <span className="hidden shrink-0 sm:block">
                  <Meter
                    value={d.difficulty}
                    label={`${s.title} difficulty ${String(d.difficulty)} of 5`}
                  />
                </span>
                <Button
                  onClick={() => startScenario(s.id)}
                  ariaLabel={`start ${s.title}`}
                  className="shrink-0 opacity-90 group-hover:opacity-100"
                >
                  {t('start')} →
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="mt-8 flex flex-wrap justify-between gap-3 text-xs text-faint">
        <span className="font-mono">KEYS 1 MENU · 2 DASHBOARD · 3 SETTINGS</span>
        <span className="max-w-md">
          Safari note: Pointer Lock needs macOS 16+ and a user click; iOS touch aiming is
          intentionally unsupported.
        </span>
      </footer>
    </div>
  );
}
