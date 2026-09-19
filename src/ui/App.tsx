import { Suspense, lazy, useEffect, type ReactElement } from 'react';
import { useApp } from './store';
import { Menu } from './components/Menu';
import { Results } from './components/Results';
import { Sandbox } from './components/Sandbox';
import { SettingsPanel } from './components/SettingsPanel';
import { ConsentBanner } from './components/ConsentBanner';
import { MobileBlock } from './components/MobileBlock';
import { ErrorBoundary } from './components/ErrorBoundary';
import './i18n';

// Code-split heavy deps so initial JS stays under budget:
// three.js loads only when entering the arena, recharts only in Dashboard.
const GameScreen = lazy(() =>
  import('./components/GameScreen').then((m) => ({ default: m.GameScreen })),
);
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
);

function Loading(): ReactElement {
  return <div className="flex h-full items-center justify-center p-8">Loading…</div>;
}

export function App(): ReactElement {
  const view = useApp((s) => s.view);
  const runId = useApp((s) => s.runId);

  // Keyboard nav: 1-3 quick switch outside game.
  // Ignored while typing in form fields so settings inputs accept digits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useApp.getState().view === 'game') return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === '1') useApp.getState().setView('menu');
      if (e.key === '2') useApp.getState().setView('dashboard');
      if (e.key === '3') useApp.getState().setView('settings');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ErrorBoundary>
      <MobileBlock>
        <div className="h-full min-h-screen bg-abyss text-ink">
          {view === 'menu' && <Menu />}
          {view === 'game' && (
            <Suspense fallback={<Loading />}>
              <GameScreen key={runId} />
            </Suspense>
          )}
          {view === 'results' && <Results />}
          {view === 'sandbox' && <Sandbox />}
          {view === 'dashboard' && (
            <Suspense fallback={<Loading />}>
              <Dashboard />
            </Suspense>
          )}
          {view === 'settings' && <SettingsPanel />}
          <ConsentBanner />
        </div>
      </MobileBlock>
    </ErrorBoundary>
  );
}
