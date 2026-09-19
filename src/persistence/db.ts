/**
 * Offline-first persistence (IndexedDB via Dexie) + optional sync layer stub.
 * @module persistence/db
 */
import Dexie, { type Table } from 'dexie';

export interface SessionRecord {
  id?: number;
  scenarioId: string;
  mode: string;
  seed: string;
  startedAt: string;
  durationSec: number;
  score: number;
  accuracy: number;
  kills: number;
  shots: number;
  hits: number;
  killsPerSec: number;
  reactionMean: number;
  reactionMedian: number;
  reactionP95: number;
  reactionSd: number;
  overshootRatio: number;
  undershootRatio: number;
  timeOnTargetPct: number | null;
  rmsErrorDeg: number | null;
  tier: string;
  percentile: number;
  replayJson: string;
  telemetryJson: string;
}

export interface ProfileRecord {
  id?: number;
  name: string;
  cm360: number;
  dpi: number;
  game: string;
  gameSens: number;
  fov: number;
  crosshairJson: string;
  updatedAt: string;
}

export interface SettingsRecord {
  id?: number;
  key: string;
  value: string;
}

class AimDb extends Dexie {
  sessions!: Table<SessionRecord, number>;
  profiles!: Table<ProfileRecord, number>;
  settings!: Table<SettingsRecord, number>;

  constructor() {
    super('aim-trainer');
    this.version(1).stores({
      sessions: '++id, scenarioId, startedAt, score',
      profiles: '++id, name',
      settings: '++id, &key',
    });
  }
}

export const db = new AimDb();

export async function saveSession(r: Omit<SessionRecord, 'id'>): Promise<number> {
  return db.sessions.add(r);
}

export async function listSessions(limit = 50): Promise<SessionRecord[]> {
  return db.sessions.orderBy('startedAt').reverse().limit(limit).toArray();
}

export async function clearSessions(): Promise<void> {
  await db.sessions.clear();
}

/** Optional sync layer: POST sessions to a backend when configured + opted in. */
export async function syncSessions(endpoint: string, apiKey: string): Promise<number> {
  const rows = await db.sessions.toArray();
  let pushed = 0;
  for (const r of rows) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(r),
    });
    if (res.ok) pushed++;
    else break;
  }
  return pushed;
}
