import type { ReactElement } from 'react';
import { useApp } from '../store';
import { useTranslation } from 'react-i18next';

export function ConsentBanner(): ReactElement | null {
  const consent = useApp((s) => s.consent);
  const setConsent = useApp((s) => s.setConsent);
  const { t } = useTranslation();
  if (consent !== 'unknown') return null;
  return (
    <div
      role="dialog"
      aria-label="privacy consent"
      className="fixed bottom-4 left-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 rounded-card border border-line bg-panel p-4"
    >
      <p className="text-sm text-mist">{t('consent')}</p>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-lg bg-brand px-4 py-1.5 font-display text-sm font-semibold text-brand-ink hover:bg-brand-strong"
          onClick={() => setConsent('accepted')}
        >
          {t('accept')}
        </button>
        <button
          className="rounded-lg border border-line px-4 py-1.5 text-sm text-ink hover:bg-raised"
          onClick={() => setConsent('declined')}
        >
          {t('decline')}
        </button>
      </div>
    </div>
  );
}
