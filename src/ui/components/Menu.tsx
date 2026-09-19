import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';
import { Button, Chip, Meter, ReticleMark } from './primitives';
import { DrillPreview } from './DrillPreview';

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

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold uppercase tracking-tight">
          {t('scenarios')}
        </h2>
        <span className="font-mono text-xs text-faint tnum">
          {BUILT_IN_SCENARIOS.length} DRILLS
        </span>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUILT_IN_SCENARIOS.map((s, i) => {
          const d = DOSSIER[s.id] ?? { focus: 'FREESTYLE', difficulty: 1 };
          return (
            <li
              key={s.id}
              className="flex flex-col overflow-hidden rounded-none border border-linesoft bg-panel transition-colors hover:border-brand/60 hover:bg-raised/60"
            >
              <div className="border-b border-linesoft bg-abyss/60">
                <DrillPreview mode={s.mode} seed={i} />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-bold text-faint tnum">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Chip tone="steel">{d.focus}</Chip>
                </div>
                <div className="mt-3 font-display text-lg font-semibold leading-tight">
                  {s.title}
                </div>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-mist">
                  {s.description}
                </p>
                <p className="mt-3 border-t border-linesoft pt-3 font-mono text-[11px] uppercase tracking-wider text-faint tnum">
                  {s.durationSec}s · {s.targetCount} tgt · {s.movementProfile}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <Meter
                    value={d.difficulty}
                    label={`${s.title} difficulty ${String(d.difficulty)} of 5`}
                  />
                  <Button onClick={() => startScenario(s.id)} ariaLabel={`start ${s.title}`}>
                    {t('start')} →
                  </Button>
                </div>
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
