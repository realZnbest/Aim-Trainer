import { useEffect, useState, type ReactElement } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { listSessions, type SessionRecord } from '@/persistence/db';
import { Button, Card, Chip, ReticleMark } from './primitives';
import { useApp } from '../store';
import { downloadText, sessionsToCsv } from '../export';

const AXIS = '#5d6d92';
const GRID = '#141e36';

export function Dashboard(): ReactElement {
  const { t } = useTranslation();
  const setView = useApp((s) => s.setView);
  const [rows, setRows] = useState<SessionRecord[]>([]);

  useEffect(() => {
    void listSessions(100).then((r) => setRows(r.reverse()));
  }, []);

  const progression = rows.map((r, i) => ({
    n: i + 1,
    score: r.score,
    acc: +(r.accuracy * 100).toFixed(1),
    scenario: r.scenarioId,
  }));
  const best = rows.reduce((m, r) => Math.max(m, r.score), 0);
  const avgAcc =
    rows.length === 0 ? 0 : (rows.reduce((s, r) => s + r.accuracy, 0) / rows.length) * 100;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ReticleMark size={30} />
          <div>
            <h1 className="font-display text-2xl font-bold uppercase leading-none tracking-tight">
              {t('dashboard')}
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-faint">
              {rows.length} sessions on record
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => downloadText('sessions.csv', sessionsToCsv(rows), 'text/csv')}
          >
            {t('exportCsv')}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              downloadText('sessions.json', JSON.stringify(rows, null, 2), 'application/json')
            }
          >
            {t('exportJson')}
          </Button>
          <Button variant="ghost" onClick={() => setView('menu')}>
            {t('backToMenu')}
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-mist">
            No sessions yet. Play a scenario to start building your progression graph.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <Chip tone="pink">Best {best}</Chip>
            <Chip tone="steel">Avg acc {avgAcc.toFixed(1)}%</Chip>
            <Chip tone="mute">Latest {rows[rows.length - 1]?.scenarioId}</Chip>
          </div>
          <Card className="mt-3">
            <h2 className="mb-2 font-display font-semibold uppercase tracking-tight">
              Score progression
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progression} margin={{ left: -8, right: 8 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="n"
                    stroke={AXIS}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={AXIS}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0a1120',
                      border: '1px solid #22304e',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => {
                      const idx = Number(v) - 1;
                      return `#${String(idx + 1)} ${progression[idx]?.scenario ?? ''}`;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#f06ba1"
                    dot={false}
                    strokeWidth={2.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="mt-3">
            <h2 className="mb-2 font-display font-semibold uppercase tracking-tight">
              Accuracy % per session
            </h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progression} margin={{ left: -8, right: 8 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="n"
                    stroke={AXIS}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={AXIS}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0a1120',
                      border: '1px solid #22304e',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="acc" fill="#6ea8ff" radius={[3, 3, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <h2 className="mt-8 font-display text-lg font-semibold uppercase tracking-tight">
            Session ledger
          </h2>
          <ol className="mt-2 divide-y divide-linesoft border-y border-linesoft">
            {[...rows].reverse().map((r) => (
              <li key={r.id} className="flex items-center gap-4 py-3">
                <span className="w-24 shrink-0 font-mono text-xs text-faint">
                  {r.startedAt.slice(5, 10)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs uppercase tracking-wider text-mist">
                  {r.scenarioId}
                </span>
                <span className="font-display font-semibold text-brand-soft tnum">{r.score}</span>
                <span className="w-16 text-right font-mono text-xs text-mist tnum">
                  {(r.accuracy * 100).toFixed(0)}%
                </span>
                <Chip tone="mute">{r.tier}</Chip>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
