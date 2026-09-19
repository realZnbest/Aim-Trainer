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
import { Button, Card } from './primitives';
import { useApp } from '../store';
import { downloadText, sessionsToCsv } from '../export';

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

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('dashboard')}</h1>
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
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm opacity-70">
            No sessions yet. Play a scenario to start building your progression graph.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-3">
            <h2 className="mb-2 font-bold">Score progression</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progression}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="n" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ background: '#11161f', border: '1px solid #333' }}
                    labelFormatter={(v) => {
                      const idx = Number(v) - 1;
                      return `#${String(idx + 1)} ${progression[idx]?.scenario ?? ''}`;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#22d3ee"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Accuracy % per session</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progression}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="n" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#11161f', border: '1px solid #333' }} />
                  <Bar dataKey="acc" fill="#34d399" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
