import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessions, personalBests, saveSession, type SessionRecord } from '@/persistence/db';

// Node's experimental global localStorage can shadow jsdom's and lacks methods;
// install a plain in-memory Storage before the store module is evaluated.
const mem = vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => void data.set(k, v),
    removeItem: (k: string): void => void data.delete(k),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
});
import { useApp } from '@/ui/store';

function session(over: Partial<SessionRecord>): Omit<SessionRecord, 'id'> {
  return {
    scenarioId: 'gridshot',
    mode: 'gridshot',
    seed: 's',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationSec: 60,
    score: 100,
    accuracy: 0.5,
    kills: 1,
    shots: 2,
    hits: 1,
    killsPerSec: 1,
    reactionMean: 1,
    reactionMedian: 1,
    reactionP95: 1,
    reactionSd: 1,
    overshootRatio: 0,
    undershootRatio: 0,
    timeOnTargetPct: null,
    rmsErrorDeg: null,
    tier: 'Bronze',
    percentile: 10,
    replayJson: '{}',
    telemetryJson: '{}',
    ...over,
  };
}

describe('personalBests', () => {
  beforeEach(async () => {
    await clearSessions();
  });

  it('returns the max score per scenario', async () => {
    await saveSession(session({ score: 100, startedAt: 'a' }));
    await saveSession(session({ score: 300, startedAt: 'b' }));
    await saveSession(session({ score: 200, startedAt: 'c' }));
    await saveSession(session({ scenarioId: 'microshot', score: 50, startedAt: 'd' }));
    expect(await personalBests()).toEqual({ gridshot: 300, microshot: 50 });
  });

  it('can exclude the run being displayed', async () => {
    await saveSession(session({ score: 100, startedAt: 'a' }));
    await saveSession(session({ score: 300, startedAt: 'b' }));
    expect(await personalBests('b')).toEqual({ gridshot: 100 });
  });

  it('is empty with no sessions', async () => {
    expect(await personalBests()).toEqual({});
  });
});

describe('settings persistence', () => {
  it('writes only settings (not view/run state) to localStorage', () => {
    useApp.getState().patchSens({ cm360: 42 });
    useApp.getState().setView('dashboard');
    const raw = mem.getItem('aim-trainer-settings');
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw as string) as { state: Record<string, unknown>; version: number };
    expect(saved.version).toBe(2);
    expect((saved.state.sens as { cm360: number }).cm360).toBe(42);
    expect(saved.state).not.toHaveProperty('view');
    expect(saved.state).not.toHaveProperty('lastResult');
  });
});
