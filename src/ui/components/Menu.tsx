import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';
import { Button, Card } from './primitives';

export function Menu(): ReactElement {
  const { t, i18n } = useTranslation();
  const startScenario = useApp((s) => s.startScenario);
  const setView = useApp((s) => s.setView);
  const language = useApp((s) => s.language);
  const setLanguage = useApp((s) => s.setLanguage);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t('appName')} <span className="text-cyan-400">— esports precision</span>
          </h1>
          <p className="mt-1 text-sm opacity-70">
            Low-latency input · deterministic sim · actionable analytics
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </header>

      <h2 className="mb-3 text-lg font-bold">{t('scenarios')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUILT_IN_SCENARIOS.map((s) => (
          <Card key={s.id} className="flex flex-col gap-2">
            <div className="font-bold">{s.title}</div>
            <p className="min-h-[3rem] text-xs opacity-70">{s.description}</p>
            <div className="text-xs opacity-60">
              {s.durationSec}s · {s.targetCount} target{s.targetCount > 1 ? 's' : ''} ·{' '}
              {s.movementProfile}
            </div>
            <Button onClick={() => startScenario(s.id)} ariaLabel={`start ${s.title}`}>
              {t('start')} →
            </Button>
          </Card>
        ))}
      </div>

      <footer className="mt-8 text-xs opacity-50">
        Safari note: Pointer Lock on Safari requires macOS 16+ and user click; iOS Safari touch
        aiming is intentionally unsupported (desktop mouse required).
      </footer>
    </div>
  );
}
